"""
Mock User Service — simulazione del sistema di gestione utenti (FastAPI, porta 8001).

Persiste utenti e cronologia reset su db.json nella stessa directory.
Al primo avvio, se db.json non esiste, carica tre utenti demo.
In produzione si sostituirebbe questo servizio con il sistema HR/LDAP reale.

Endpoints:
  GET    /users                     — lista utenti (filtro opzionale ?email=)
  GET    /users/{username}          — dettaglio singolo utente
  POST   /users                     — crea nuovo utente
  PUT    /users/{username}          — aggiorna email, nome o stato
  DELETE /users/{username}          — elimina utente
  POST   /reset-password            — esegue reset, genera password temporanea
  POST   /unlock-account            — sblocca utenza previa verifica identità
  GET    /rooms                     — elenca le chiamate live attive (LiveKit)
  GET    /operator-token            — JWT per far entrare un operatore in una room
  GET    /reset-history             — cronologia completa di tutte le operazioni
  GET    /reset-history/{username}  — cronologia reset per singolo utente
  DELETE /reset-history             — azzera la cronologia (usato dal frontend)
  GET    /token                     — genera JWT LiveKit per chiamata WebRTC via browser
  GET    /transcripts               — lista file di trascrizione (per il frontend React)
  GET    /transcripts/{filename}    — contenuto testo di una singola trascrizione

Tutti gli endpoint richiedono l'header X-Internal-Api-Key (vedi shared/auth.py).
"""
from __future__ import annotations

import json
import logging
import os
import secrets
import string
import sys
import threading
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Literal, Optional

import httpx
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field
from livekit import api as lk_api
from livekit.api import AccessToken, VideoGrants

# Carica .env dalla root del progetto (funziona sia con run_all.sh che in standalone)
_ROOT = next(p for p in Path(__file__).resolve().parents if (p / ".env.example").is_file())
load_dotenv(_ROOT / ".env")

# Aggiunge la root del progetto al path per importare i modelli condivisi
sys.path.insert(0, str(_ROOT))
from shared.models import (
    ResetHistoryEntry,
    ResetRequest,
    ResetResult,
    UnlockRequest,
    UnlockResult,
    User,
)
from shared.auth import API_KEY_HEADER, get_internal_api_key, make_api_key_dependency

log = logging.getLogger("user_service")

# Credenziali LiveKit per l'emissione di token WebRTC
_LIVEKIT_URL = os.getenv("LIVEKIT_URL", "")
_LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY", "")
_LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET", "")
# Nome dell'agente LiveKit (dispatch esplicito). Deve coincidere con l'agent_name
# del worker voce; il token della chiamata web lo richiede nella room.
_LIVEKIT_AGENT_NAME = os.getenv("LIVEKIT_AGENT_NAME", "aria-support")

# Email Service per il recapito delle password temporanee (reset da canale voce)
_EMAIL_SERVICE_URL = os.getenv("EMAIL_SERVICE_URL", "http://localhost:8002")
_AGENT_EMAIL = os.getenv("AGENT_EMAIL", "agent@password-reset.local")

# Anti-abuso: oltre questo numero di sblocchi riusciti in 24h l'utenza va
# gestita dal supporto (segnale di possibile brute-force). Vedi docs/04.
_MAX_UNLOCKS_24H = int(os.getenv("MAX_UNLOCKS_24H", "2"))

# ── Persistenza ───────────────────────────────────────────────────────────────

# Override via USER_DB_PATH per i test (db isolato); default: db.json accanto al modulo.
DB_PATH = Path(os.getenv("USER_DB_PATH", str(Path(__file__).parent / "db.json")))

# Utenti pre-caricati al primo avvio (quando db.json non esiste ancora)
DEMO_USERS: list[dict] = [
    {
        "username": "mario.rossi",
        "email": "mario.rossi@example.com",
        "full_name": "Mario Rossi",
        "status": "active",
        "last_reset": None,
        "created_at": "2025-01-10T10:00:00+00:00",
    },
    {
        "username": "giulia.bianchi",
        "email": "giulia.bianchi@example.com",
        "full_name": "Giulia Bianchi",
        "status": "active",
        "last_reset": None,
        "created_at": "2025-02-14T09:30:00+00:00",
    },
    {
        "username": "luca.neri",
        "email": "luca.neri@example.com",
        "full_name": "Luca Neri",
        "status": "locked",
        "last_reset": None,
        "created_at": "2025-03-01T08:00:00+00:00",
    },
]

# Storage in-memory caricato da db.json all'avvio
users_db: dict[str, dict] = {}
reset_history: list[dict] = []


def _load_db() -> None:
    """Carica users_db e reset_history da db.json.

    Se il file non esiste (primo avvio), inizializza con i DEMO_USERS e salva.
    """
    global users_db, reset_history
    if DB_PATH.exists():
        try:
            data = json.loads(DB_PATH.read_text())
        except (OSError, json.JSONDecodeError) as exc:
            raise RuntimeError(
                f"db.json corrotto o illeggibile ({DB_PATH}): ripristinalo da un "
                "backup o cancellalo per ripartire dai dati demo."
            ) from exc
        users_db = {u["username"]: u for u in data.get("users", [])}
        reset_history = data.get("reset_history", [])
    else:
        users_db = {u["username"]: dict(u) for u in DEMO_USERS}
        reset_history = []
        _save_db()


_db_lock = threading.Lock()


def _save_db() -> None:
    """Persiste users_db e reset_history su db.json dopo ogni modifica.

    Scrittura atomica (file temporaneo + os.replace) sotto lock: un crash a
    metà scrittura o due richieste concorrenti non possono corrompere il file.
    """
    with _db_lock:
        payload = json.dumps(
            {"users": list(users_db.values()), "reset_history": reset_history},
            default=str,
            indent=2,
        )
        tmp_path = DB_PATH.with_name(DB_PATH.name + ".tmp")
        tmp_path.write_text(payload)
        os.replace(tmp_path, DB_PATH)


def _generate_temp_password() -> str:
    """Genera una password temporanea robusta nel formato Tmp-XXXXXXXXXX!.

    Usa `secrets` (CSPRNG): 10 caratteri alfanumerici ≈ 62^10 combinazioni,
    contro le 10^6 del vecchio formato a sole cifre generato con `random`.
    """
    alphabet = string.ascii_letters + string.digits
    core = "".join(secrets.choice(alphabet) for _ in range(10))
    return f"Tmp-{core}!"


# Carica il DB all'avvio del modulo (prima che FastAPI registri gli endpoint)
_load_db()

# ── App ───────────────────────────────────────────────────────────────────────

# Default-deny: ogni endpoint richiede X-Internal-Api-Key. La chiave è nota solo
# ai processi locali (tool voce, email processor, proxy Vite), mai al browser.
app = FastAPI(
    title="Mock User Service",
    version="1.1.0",
    dependencies=[Depends(make_api_key_dependency())],
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5175",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5175",
    ],
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", API_KEY_HEADER],
)


# ── Modelli di input ──────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    username: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9._-]+$")
    email: str = Field(min_length=3, max_length=254)
    full_name: str = Field(min_length=1, max_length=100)
    # Literal allineato a shared.models.User: uno status arbitrario passava la
    # creazione ma faceva fallire con 500 la serializzazione della risposta.
    status: Literal["active", "locked", "suspended"] = "active"


class UserUpdate(BaseModel):
    """Tutti i campi sono opzionali: aggiorna solo quelli presenti nel body."""
    email: Optional[str] = Field(None, min_length=3, max_length=254)
    full_name: Optional[str] = Field(None, min_length=1, max_length=100)
    status: Optional[Literal["active", "locked", "suspended"]] = None


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health() -> dict:
    """Liveness: il processo è vivo. Uniforma user_service agli altri servizi."""
    return {"status": "ok"}


# ── Endpoints utenti ──────────────────────────────────────────────────────────

@app.get("/users", response_model=List[User])
def list_users(email: Optional[str] = Query(None)):
    """Restituisce tutti gli utenti, con filtro opzionale per indirizzo email.

    Il parametro ?email= è usato dai tool del voice agent per il lookup per email.
    """
    users = list(users_db.values())
    if email:
        users = [u for u in users if u["email"] == email]
    return [User(**u) for u in users]


@app.get("/users/{username}", response_model=User)
def get_user(username: str):
    """Restituisce il dettaglio di un singolo utente per username."""
    if username not in users_db:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    return User(**users_db[username])


@app.post("/users", response_model=User, status_code=201)
def create_user(body: UserCreate):
    """Crea un nuovo utente. Restituisce 409 se lo username è già in uso."""
    if body.username in users_db:
        raise HTTPException(status_code=409, detail="Username già esistente")
    now = datetime.now(timezone.utc).isoformat()
    user = {
        "username": body.username,
        "email": body.email,
        "full_name": body.full_name,
        "status": body.status,
        "last_reset": None,
        "created_at": now,
    }
    users_db[body.username] = user
    _save_db()
    return User(**user)


@app.put("/users/{username}", response_model=User)
def update_user(username: str, body: UserUpdate):
    """Aggiorna parzialmente un utente (email, nome completo, stato)."""
    if username not in users_db:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    user = users_db[username]
    if body.email is not None:
        user["email"] = body.email
    if body.full_name is not None:
        user["full_name"] = body.full_name
    if body.status is not None:
        user["status"] = body.status
    _save_db()
    return User(**user)


@app.delete("/users/{username}", status_code=204)
def delete_user(username: str):
    """Elimina un utente. La cronologia reset associata resta invariata."""
    if username not in users_db:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    del users_db[username]
    _save_db()


# ── Endpoint reset password ───────────────────────────────────────────────────

@app.post("/reset-password", response_model=ResetResult)
def reset_password(body: ResetRequest):
    """Esegue il reset della password per l'utente specificato.

    Logica:
    - Utente non trovato → errore (loggato in history)
    - Utente locked o suspended → errore con suggerimento supporto
    - Utente active → genera password temporanea, aggiorna last_reset, persiste

    Il campo channel ("voice" o "email") traccia da quale canale è arrivata
    la richiesta per le metriche nel frontend.
    """
    username = body.username
    if username not in users_db:
        entry = _make_history_entry(username, body.channel, False, "Utente non trovato")
        reset_history.append(entry)
        _save_db()
        return ResetResult(success=False, username=username, message="Utente non trovato")

    user = users_db[username]
    if user["status"] in ("locked", "suspended"):
        msg = f"Account {user['status']}. Contatta il supporto."
        entry = _make_history_entry(username, body.channel, False, msg)
        reset_history.append(entry)
        _save_db()
        return ResetResult(success=False, username=username, message=msg)

    new_pwd = _generate_temp_password()
    user["last_reset"] = datetime.now(timezone.utc).isoformat()
    # La password NON entra nel messaggio: la history (e quindi db.json,
    # dashboard e log) resta priva di segreti. Viaggia solo via email.
    msg = "Password resettata con successo. La password temporanea è stata inviata via email."
    entry = _make_history_entry(username, body.channel, True, msg)
    reset_history.append(entry)
    _save_db()
    # Voce e chat non mostrano la password: la recapita il User Service via email.
    # Il canale email è invece gestito dall'Email Processor, che compone la risposta.
    if body.channel in ("voice", "chat"):
        _send_password_email(user, new_pwd)
    return ResetResult(success=True, username=username, message=msg, new_password=new_pwd)


def _make_history_entry(
    username: str, channel: str, success: bool, message: str, operation: str = "reset"
) -> dict:
    """Costruisce una voce della cronologia operazioni con id univoco e timestamp UTC."""
    return {
        "id": str(uuid.uuid4()),
        "username": username,
        "channel": channel,
        "operation": operation,
        "success": success,
        "message": message,
        "requested_at": datetime.now(timezone.utc).isoformat(),
    }


def _send_password_email(user: dict, new_password: str) -> None:
    """Recapita la password temporanea via Email Service (reset da canale voce).

    Best-effort: se l'Email Service non risponde il reset resta comunque valido
    e il fallimento viene solo loggato (graceful degradation di un canale non
    critico). Per il canale email è invece l'Email Processor a comporre la
    risposta con la password.
    """
    body = (
        f"Gentile {user['full_name']},\n\n"
        f"come richiesto telefonicamente, la password dell'account "
        f"'{user['username']}' è stata resettata.\n\n"
        f"Password temporanea: {new_password}\n\n"
        f"La cambi al primo accesso.\n\n"
        f"Cordiali saluti,\nServizio Reset Password"
    )
    try:
        resp = httpx.post(
            f"{_EMAIL_SERVICE_URL}/send",
            json={
                "from_address": _AGENT_EMAIL,
                "to_address": user["email"],
                "subject": "La tua password temporanea",
                "body": body,
            },
            headers={API_KEY_HEADER: get_internal_api_key()},
            timeout=5.0,
        )
        resp.raise_for_status()
    except Exception as exc:  # il canale email non deve mai far fallire il reset
        log.warning("Invio email password temporanea a %s fallito: %s", user["username"], exc)


# ── Endpoint sblocco utenza ───────────────────────────────────────────────────

def _normalize_name(name: str) -> str:
    """Normalizza un nome per il confronto: minuscolo, spazi singoli, trim."""
    return " ".join(name.split()).casefold()


def _recent_successful_unlocks(username: str) -> int:
    """Conta gli sblocchi riusciti per l'utente nelle ultime 24 ore (anti-abuso)."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    count = 0
    for e in reset_history:
        if e.get("operation") != "unlock" or not e.get("success") or e["username"] != username:
            continue
        try:
            ts = datetime.fromisoformat(e["requested_at"])
        except (ValueError, KeyError):
            continue
        if ts >= cutoff:
            count += 1
    return count


@app.post("/unlock-account", response_model=UnlockResult)
def unlock_account(body: UnlockRequest):
    """Sblocca un'utenza bloccata previa verifica d'identità e controllo anti-abuso.

    Flusso (default-deny — ogni ramo negativo è registrato in cronologia):
    - Utente non trovato → rifiuto
    - Nome fornito ≠ nome registrato → rifiuto (verifica identità fallita)
    - Troppi sblocchi recenti (>_MAX_UNLOCKS_24H in 24h) → rifiuto, rimanda al supporto
    - Account sospeso → rifiuto, rimanda al supporto
    - Account già attivo → nessuna azione necessaria
    - Account bloccato → sblocca (status → active) e notifica via email
    """
    username = body.username

    def _fail(msg: str) -> UnlockResult:
        reset_history.append(_make_history_entry(username, body.channel, False, msg, "unlock"))
        _save_db()
        return UnlockResult(success=False, username=username, message=msg)

    if username not in users_db:
        return _fail("Utente non trovato")

    user = users_db[username]

    if _normalize_name(body.full_name) != _normalize_name(user["full_name"]):
        # Messaggio volutamente generico: non conferma quale campo non torna.
        return _fail("Verifica dell'identità non riuscita. Contatta il supporto.")

    if _recent_successful_unlocks(username) >= _MAX_UNLOCKS_24H:
        return _fail("Troppi sblocchi recenti per questa utenza. Contatta il supporto.")

    if user["status"] == "suspended":
        return _fail("Account sospeso. Contatta il supporto.")

    if user["status"] == "active":
        return _fail("L'account è già attivo: nessuno sblocco necessario.")

    # status == "locked" → sblocca
    user["status"] = "active"
    msg = "Utenza sbloccata con successo."
    reset_history.append(_make_history_entry(username, body.channel, True, msg, "unlock"))
    _save_db()
    if body.channel in ("voice", "chat"):
        _send_unlock_email(user)
    return UnlockResult(success=True, username=username, message=msg)


def _send_unlock_email(user: dict) -> None:
    """Notifica via email l'avvenuto sblocco (best-effort, non blocca l'operazione)."""
    body = (
        f"Gentile {user['full_name']},\n\n"
        f"come richiesto telefonicamente, l'utenza '{user['username']}' è stata "
        f"sbloccata ed è di nuovo attiva.\n\n"
        f"Se non hai richiesto tu questo sblocco, contatta subito il supporto IT.\n\n"
        f"Cordiali saluti,\nServizio IT"
    )
    try:
        resp = httpx.post(
            f"{_EMAIL_SERVICE_URL}/send",
            json={
                "from_address": _AGENT_EMAIL,
                "to_address": user["email"],
                "subject": "Utenza sbloccata",
                "body": body,
            },
            headers={API_KEY_HEADER: get_internal_api_key()},
            timeout=5.0,
        )
        resp.raise_for_status()
    except Exception as exc:
        log.warning("Invio email sblocco a %s fallito: %s", user["username"], exc)


# ── Endpoints cronologia reset ────────────────────────────────────────────────

@app.get("/reset-history", response_model=List[ResetHistoryEntry])
def get_reset_history():
    """Restituisce la cronologia completa di tutti i reset (tutti gli utenti)."""
    return [ResetHistoryEntry(**e) for e in reset_history]


@app.get("/reset-history/{username}", response_model=List[ResetHistoryEntry])
def get_reset_history_for_user(username: str):
    """Restituisce la cronologia reset filtrata per un singolo utente."""
    return [ResetHistoryEntry(**e) for e in reset_history if e["username"] == username]


@app.delete("/reset-history", status_code=204)
def clear_reset_history():
    """Azzera l'intera cronologia reset. Usato dal pulsante 'Reset metriche' nel frontend."""
    global reset_history
    reset_history = []
    _save_db()


# ── Endpoints WebRTC ──────────────────────────────────────────────────────────

@app.get("/token")
def get_webrtc_token():
    """Genera un JWT LiveKit per una chiamata WebRTC via browser.

    Crea una room con nome univoco e restituisce il token che il browser
    userà per connettersi. Quando il partecipante entra nella room, LiveKit
    auto-dispatcha il voice agent (stesso meccanismo delle chiamate SIP).

    Risposta: { token, url, room }
    """
    if not _LIVEKIT_URL or not _LIVEKIT_API_KEY or not _LIVEKIT_API_SECRET:
        raise HTTPException(
            status_code=503,
            detail="LiveKit non configurato: controlla LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET nel .env",
        )

    room_name = f"web-{uuid.uuid4().hex[:8]}"
    token = (
        AccessToken(_LIVEKIT_API_KEY, _LIVEKIT_API_SECRET)
        .with_identity("user-web")
        .with_name("Utente Web")
        .with_grants(VideoGrants(room_join=True, room=room_name))
        # Dispatch ESPLICITO dell'agente: quando il browser entra nella room,
        # LiveKit dispatcha il worker "aria-support" (il dispatch automatico non
        # consegnava i job, così Sofia non entrava). Coerente con la SIP dispatch rule.
        .with_room_config(
            lk_api.RoomConfiguration(
                agents=[lk_api.RoomAgentDispatch(agent_name=_LIVEKIT_AGENT_NAME)]
            )
        )
        .to_jwt()
    )
    return {"token": token, "url": _LIVEKIT_URL, "room": room_name}


# ── Handoff operatore: chiamate live e ingresso operatore ─────────────────────

def _livekit_http_url() -> str:
    """URL HTTP(S) del server LiveKit per le API (LIVEKIT_URL è in forma ws/wss)."""
    return _LIVEKIT_URL.replace("wss://", "https://").replace("ws://", "http://")


def _require_livekit() -> None:
    if not _LIVEKIT_URL or not _LIVEKIT_API_KEY or not _LIVEKIT_API_SECRET:
        raise HTTPException(status_code=503, detail="LiveKit non configurato nel .env")


@app.get("/rooms")
async def list_live_rooms():
    """Elenca le chiamate live in corso (room LiveKit di voce/web) con i partecipanti.

    Usato dalla dashboard operatore per vedere le conversazioni attive e prenderle
    in carico. Considera solo le room con prefisso "call-" (SIP) o "web-" (browser).
    """
    _require_livekit()
    lkapi = lk_api.LiveKitAPI(_livekit_http_url(), _LIVEKIT_API_KEY, _LIVEKIT_API_SECRET)
    try:
        rooms_resp = await lkapi.room.list_rooms(lk_api.ListRoomsRequest())
        result = []
        for room in rooms_resp.rooms:
            if not (room.name.startswith("call-") or room.name.startswith("web-")):
                continue
            parts_resp = await lkapi.room.list_participants(
                lk_api.ListParticipantsRequest(room=room.name)
            )
            participants = [
                {
                    "identity": p.identity,
                    "name": p.name,
                    # kind==4 è AGENT nel protocollo LiveKit; getattr per sicurezza
                    "is_agent": getattr(p, "kind", 0) == 4 or p.identity.lower().startswith("agent"),
                    "is_operator": p.identity.startswith("operator-"),
                }
                for p in parts_resp.participants
            ]
            result.append({
                "name": room.name,
                "num_participants": room.num_participants,
                "created_at": datetime.fromtimestamp(room.creation_time, tz=timezone.utc).isoformat()
                if room.creation_time else None,
                "participants": participants,
                "has_operator": any(p["is_operator"] for p in participants),
            })
        result.sort(key=lambda r: r["created_at"] or "", reverse=True)
        return result
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("Elenco room LiveKit fallito")
        raise HTTPException(status_code=502, detail="Impossibile contattare LiveKit") from exc
    finally:
        await lkapi.aclose()


@app.get("/operator-token")
def get_operator_token(room: str = Query(..., min_length=1, max_length=128)):
    """Genera un JWT per far entrare un operatore umano in una room esistente.

    L'operatore entra nella stessa room del chiamante per prenderne in carico la
    conversazione (handoff). Identità dedicata "operator-<id>" così l'agente può
    riconoscerlo e farsi da parte.
    """
    _require_livekit()
    identity = f"operator-{uuid.uuid4().hex[:8]}"
    token = (
        AccessToken(_LIVEKIT_API_KEY, _LIVEKIT_API_SECRET)
        .with_identity(identity)
        .with_name("Operatore")
        .with_grants(VideoGrants(
            room_join=True, room=room,
            can_publish=True, can_subscribe=True, can_publish_data=True,
        ))
        .to_jwt()
    )
    return {"token": token, "url": _LIVEKIT_URL, "room": room, "identity": identity}


# ── Endpoints trascrizioni (per il frontend React) ────────────────────────────

# Override via TRANSCRIPTS_DIR (in Docker le trascrizioni sono montate qui);
# default: cartella transcripts/ nella radice del repo.
_TRANSCRIPTS_DIR = Path(os.getenv("TRANSCRIPTS_DIR", str(_ROOT / "transcripts")))


def _transcript_label(filename: str) -> str:
    """Genera un'etichetta leggibile dal nome del file trascrizione."""
    import re
    m = re.match(r"(\d{8})_(\d{6})_(.+)\.txt", filename)
    if not m:
        return filename
    date_str, time_str, room = m.groups()
    try:
        from zoneinfo import ZoneInfo
        dt = datetime.strptime(f"{date_str}_{time_str}", "%Y%m%d_%H%M%S").replace(tzinfo=timezone.utc)
        dt_local = dt.astimezone(ZoneInfo("Europe/Rome"))
        date_label = dt_local.strftime("%d/%m/%Y %H:%M")
    except Exception:
        date_label = f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:]} {time_str[:2]}:{time_str[2:4]}"

    if "web-" in room:
        return f"🌐 Web — {date_label}"
    caller_m = re.search(r"call-_([^_]+)_", room)
    caller = caller_m.group(1) if caller_m else ""
    return f"📞 Telefono — {date_label} — {caller}" if caller else f"📞 Telefono — {date_label}"


@app.get("/transcripts")
def list_transcripts():
    """Restituisce la lista dei file di trascrizione, dal più recente."""
    if not _TRANSCRIPTS_DIR.exists():
        return []
    files = sorted(_TRANSCRIPTS_DIR.glob("*.txt"), reverse=True)
    result = []
    for f in files:
        try:
            ts = datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc).isoformat()
            result.append({"filename": f.name, "label": _transcript_label(f.name), "timestamp": ts})
        except Exception:
            continue
    return result


@app.get("/transcripts/{filename}")
def get_transcript(filename: str):
    """Restituisce il contenuto testuale di una singola trascrizione."""
    safe = Path(filename).name  # Previene path traversal
    path = _TRANSCRIPTS_DIR / safe
    if not path.exists() or not path.is_file() or path.suffix != ".txt":
        raise HTTPException(status_code=404, detail="Trascrizione non trovata")
    return PlainTextResponse(path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
