"""
Mock Email Service — simulazione di un server email (FastAPI, porta 8002).

Espone due mailbox in memoria:
  - inbox: email in arrivo (richieste di reset da utenti o dal frontend Admin)
  - sent:  email in uscita (risposte inviate dall'Email Processor)

Lo storage è in-memory: si azzera a ogni riavvio del servizio.
In produzione si sostituirebbe con IMAP/SMTP reali.

Endpoints:
  GET  /inbox                      — lista email ricevute
  POST /inbox                      — simula ricezione di una nuova email
  PATCH /inbox/{id}/processed      — marca email come processata
  DELETE /inbox/{id}               — elimina email dall'inbox
  GET  /sent                       — lista email inviate dall'agente
  POST /send                       — aggiunge email alla sent box
"""
from __future__ import annotations

import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# Carica .env dalla root (serve INTERNAL_API_KEY) e importa i moduli condivisi
_ROOT = next(p for p in Path(__file__).resolve().parents if (p / ".env.example").is_file())
load_dotenv(_ROOT / ".env")
sys.path.insert(0, str(_ROOT))
from shared.models import Email, EmailCreate
from shared.auth import API_KEY_HEADER, make_api_key_dependency

# ── Storage in-memory ─────────────────────────────────────────────────────────

inbox: list[dict] = []
sent: list[dict] = []

# ── App ───────────────────────────────────────────────────────────────────────

# Default-deny: ogni endpoint richiede X-Internal-Api-Key (vedi shared/auth.py).
app = FastAPI(
    title="Mock Email Service",
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
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Content-Type", API_KEY_HEADER],
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _email_to_dict(body: EmailCreate, processed: bool = False) -> dict:
    """Costruisce il dizionario interno di un'email aggiungendo id e timestamp."""
    return {
        "id": str(uuid.uuid4()),
        "from_address": body.from_address,
        "to_address": body.to_address,
        "subject": body.subject,
        "body": body.body,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "processed": processed,
    }


# ── Endpoints inbox ───────────────────────────────────────────────────────────

@app.get("/inbox", response_model=List[Email])
def get_inbox(unprocessed_only: bool = False):
    """Restituisce le email in inbox.

    Con ?unprocessed_only=true filtra solo le email non ancora elaborate
    dall'Email Processor — usato dal loop di polling.
    """
    emails = inbox if not unprocessed_only else [e for e in inbox if not e["processed"]]
    return [Email(**e) for e in emails]


@app.post("/inbox", response_model=Email, status_code=201)
def receive_email(body: EmailCreate):
    """Simula la ricezione di una nuova email in arrivo.

    Usato dal frontend Admin per iniettare richieste di test,
    o da sistemi esterni che simulano l'invio da parte degli utenti.
    """
    entry = _email_to_dict(body, processed=False)
    inbox.append(entry)
    return Email(**entry)


@app.patch("/inbox/{email_id}/processed", response_model=Email)
def mark_processed(email_id: str):
    """Marca un'email come processata dopo che l'Email Processor l'ha elaborata."""
    for e in inbox:
        if e["id"] == email_id:
            e["processed"] = True
            return Email(**e)
    raise HTTPException(status_code=404, detail="Email non trovata")


@app.delete("/inbox/{email_id}", status_code=204)
def delete_inbox_email(email_id: str):
    """Elimina fisicamente un'email dall'inbox."""
    global inbox
    before = len(inbox)
    inbox = [e for e in inbox if e["id"] != email_id]
    if len(inbox) == before:
        raise HTTPException(status_code=404, detail="Email non trovata")


# ── Endpoints sent box ────────────────────────────────────────────────────────

@app.get("/sent", response_model=List[Email])
def get_sent():
    """Restituisce tutte le email inviate dall'agente (risposte ai richiedenti)."""
    return [Email(**e) for e in sent]


@app.post("/send", response_model=Email, status_code=201)
def send_email(body: EmailCreate):
    """Registra un'email nella sent box (chiamato dall'Email Processor dopo ogni reset)."""
    entry = _email_to_dict(body, processed=True)
    sent.append(entry)
    return Email(**entry)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8002, reload=True)
