"""
Email Processor — canale email del sistema di reset password.

Loop asincrono che fa polling sull'inbox del Mock Email Service ogni
EMAIL_POLL_INTERVAL secondi. Per ogni email non ancora processata:
  1. La marca subito come processata (claim: evita reset duplicati)
  2. Estrae l'identificativo account dal corpo con regex
  3. Risolve l'username (gestisce sia username che email)
  4. Invoca il reset password sul User Service
  5. Invia una email di risposta al mittente (con la password temporanea)

Formato email accettato nel corpo:
  "Richiedo il reset della password per l'account: <username-o-email>"
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [email_processor] %(levelname)s %(message)s",
)
log = logging.getLogger(__name__)

# ── Configurazione ────────────────────────────────────────────────────────────

USER_SERVICE_URL = os.getenv("USER_SERVICE_URL", "http://localhost:8001")
EMAIL_SERVICE_URL = os.getenv("EMAIL_SERVICE_URL", "http://localhost:8002")
AGENT_EMAIL = os.getenv("AGENT_EMAIL", "agent@password-reset.local")
_INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "")

try:
    POLL_INTERVAL = int(os.getenv("EMAIL_POLL_INTERVAL", "10"))
except ValueError:
    log.warning("EMAIL_POLL_INTERVAL non numerico, uso il default di 10s")
    POLL_INTERVAL = 10

# Regex che riconosce il pattern "per l'account: <valore>" nel corpo dell'email.
# Accetta sia l'apostrofo tipografico (') che quello ASCII (').
_ACCOUNT_RE = re.compile(
    r"per\s+l['']account\s*:\s*(\S+)",
    re.IGNORECASE,
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _extract_identifier(body: str) -> str | None:
    """Estrae username o email dal corpo dell'email tramite regex.

    Restituisce None se il formato non corrisponde al pattern atteso.
    """
    m = _ACCOUNT_RE.search(body)
    return m.group(1).strip() if m else None


async def _resolve_username(client: httpx.AsyncClient, identifier: str) -> str | None:
    """Converte un identificativo (username o email) nello username canonico.

    Se l'identificativo contiene "@" esegue un lookup per email sul User Service
    e restituisce lo username del primo utente trovato, altrimenti restituisce
    l'identificativo così com'è (già uno username).
    """
    if "@" in identifier:
        resp = await client.get(f"{USER_SERVICE_URL}/users", params={"email": identifier})
        resp.raise_for_status()
        users = resp.json()
        if isinstance(users, list) and users:
            return users[0].get("username")
        return None
    return identifier


# ── Elaborazione singola email ────────────────────────────────────────────────

async def _process_email(client: httpx.AsyncClient, email: dict) -> None:
    """Elabora una singola email di richiesta reset.

    L'email viene marcata come processata PRIMA di eseguire il reset: così un
    errore a metà elaborazione non provoca reset duplicati al giro successivo.
    Meglio una richiesta persa (l'utente può riprovare) che una password
    rigenerata più volte all'insaputa dell'utente.
    """
    email_id = email["id"]
    from_addr = email["from_address"]
    body_text = email["body"]

    await _mark_processed(client, email_id)

    identifier = _extract_identifier(body_text)
    if not identifier:
        log.warning("Email %s: nessun account trovato nel corpo, skip", email_id)
        return

    username = await _resolve_username(client, identifier)
    if not username:
        log.warning("Email %s: nessun utente trovato per '%s'", email_id, identifier)
        await _send_reply(client, from_addr, False, identifier, "Utente non trovato nel sistema.")
        return

    log.info("Email %s: reset password per utente '%s'", email_id, username)
    resp = await client.post(
        f"{USER_SERVICE_URL}/reset-password",
        json={"username": username, "channel": "email"},
    )
    resp.raise_for_status()
    result = resp.json()

    # La history del backend non contiene più la password: per il canale email
    # è questa risposta il mezzo di recapito, quindi la aggiungiamo qui.
    message = result.get("message", "")
    if result.get("success") and result.get("new_password"):
        message = (
            f"{message}\n\n"
            f"Password temporanea: {result['new_password']}\n"
            f"La cambi al primo accesso."
        )
    await _send_reply(client, from_addr, bool(result.get("success")), username, message)


async def _send_reply(
    client: httpx.AsyncClient,
    to_addr: str,
    success: bool,
    username: str,
    message: str,
) -> None:
    """Invia l'email di risposta al mittente tramite il Mock Email Service."""
    subject = "Reset password completato" if success else "Reset password non riuscito"
    body = (
        f"Gentile utente,\n\n"
        f"La richiesta di reset password per l'account '{username}' "
        f"{'è stata completata con successo' if success else 'non è stata completata'}.\n\n"
        f"{message}\n\n"
        f"Cordiali saluti,\nServizio Reset Password"
    )
    resp = await client.post(
        f"{EMAIL_SERVICE_URL}/send",
        json={
            "from_address": AGENT_EMAIL,
            "to_address": to_addr,
            "subject": subject,
            "body": body,
        },
    )
    resp.raise_for_status()
    log.info("Risposta inviata a %s (successo=%s)", to_addr, success)


async def _mark_processed(client: httpx.AsyncClient, email_id: str) -> None:
    """Marca l'email come processata nel Mock Email Service."""
    resp = await client.patch(f"{EMAIL_SERVICE_URL}/inbox/{email_id}/processed")
    resp.raise_for_status()


# ── Loop principale ───────────────────────────────────────────────────────────

async def polling_loop() -> None:
    """Loop infinito di polling. Si interrompe solo con Ctrl+C o SIGTERM.

    Gestisce esplicitamente ConnectError per tollerare riavvii temporanei
    del Email Service senza crashare il processor. Un errore su una singola
    email non interrompe l'elaborazione delle altre email del batch.
    """
    log.info("Email processor avviato. Poll interval: %ds", POLL_INTERVAL)
    headers = {"X-Internal-Api-Key": _INTERNAL_API_KEY}
    async with httpx.AsyncClient(timeout=10.0, headers=headers) as client:
        while True:
            try:
                resp = await client.get(
                    f"{EMAIL_SERVICE_URL}/inbox",
                    params={"unprocessed_only": "true"},
                )
                resp.raise_for_status()
                emails = resp.json()
                if emails:
                    log.info("Trovate %d email da processare", len(emails))
                for email in emails:
                    try:
                        await _process_email(client, email)
                    except (httpx.HTTPError, ValueError, KeyError) as exc:
                        log.error("Email %s: elaborazione fallita: %s", email.get("id"), exc)
            except httpx.ConnectError:
                log.warning("Email service non raggiungibile, riprovo tra %ds", POLL_INTERVAL)
            except Exception as exc:
                log.exception("Errore nel polling: %s", exc)
            await asyncio.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    try:
        asyncio.run(polling_loop())
    except KeyboardInterrupt:
        log.info("Email processor arrestato.")
