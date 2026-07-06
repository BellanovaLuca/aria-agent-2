"""
Ticket Service — sistema di ticketing di supporto (mock ServiceNow, porta 8005).

Simula l'ITSM su cui l'agente apre ticket quando non può risolvere una richiesta
(problema fuori dai suoi ambiti, domanda senza risposta in knowledge base, o
richiesta esplicita dell'utente). Un operatore li gestisce dalla dashboard.

Persistenza su tickets.json (scrittura atomica sotto lock, come user_service);
in produzione sarebbe l'API ServiceNow reale.

Endpoints (protetti da X-Internal-Api-Key):
  POST   /tickets              — apre un nuovo ticket
  GET    /tickets              — elenca i ticket (filtri ?status= e ?caller=)
  GET    /tickets/{number}     — dettaglio di un ticket
  PATCH  /tickets/{number}     — cambia stato e/o aggiunge una nota
  GET    /health               — liveness
"""
from __future__ import annotations

import json
import logging
import os
import sys
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

load_dotenv(Path(__file__).parent.parent / ".env")
sys.path.insert(0, str(Path(__file__).parent.parent))

from shared.auth import API_KEY_HEADER, make_api_key_dependency
from shared.models import Ticket, TicketCreate, TicketUpdate

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("ticket_service")

# Override via TICKETS_DB_PATH per i test; default: tickets.json accanto al modulo.
DB_PATH = Path(os.getenv("TICKETS_DB_PATH", str(Path(__file__).parent / "tickets.json")))
# I numeri ticket partono da qui e crescono di 1 (stile ServiceNow INCxxxxxxx).
_FIRST_SEQ = 1001

_tickets: list[dict] = []
_seq = _FIRST_SEQ
_lock = threading.Lock()


def _load() -> None:
    global _tickets, _seq
    if DB_PATH.exists():
        try:
            data = json.loads(DB_PATH.read_text())
        except (OSError, json.JSONDecodeError) as exc:
            raise RuntimeError(f"tickets.json corrotto ({DB_PATH})") from exc
        _tickets = data.get("tickets", [])
        _seq = data.get("seq", _FIRST_SEQ)
    else:
        _tickets, _seq = [], _FIRST_SEQ
        _save()


def _save() -> None:
    """Scrittura atomica (temp file + os.replace) sotto lock."""
    with _lock:
        payload = json.dumps({"tickets": _tickets, "seq": _seq}, default=str, indent=2)
        tmp = DB_PATH.with_name(DB_PATH.name + ".tmp")
        tmp.write_text(payload)
        os.replace(tmp, DB_PATH)


_load()

app = FastAPI(
    title="Ticket Service",
    version="1.0.0",
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
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["Content-Type", API_KEY_HEADER],
)


def _find(number: str) -> Optional[dict]:
    return next((t for t in _tickets if t["number"] == number), None)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/tickets", response_model=Ticket, status_code=201)
def create_ticket(body: TicketCreate) -> Ticket:
    global _seq
    now = datetime.now(timezone.utc).isoformat()
    number = f"INC{_seq:07d}"
    _seq += 1
    ticket = {
        "id": str(uuid.uuid4()),
        "number": number,
        "caller": body.caller,
        "channel": body.channel,
        "category": body.category,
        "subject": body.subject,
        "description": body.description,
        "status": "new",
        "created_at": now,
        "updated_at": now,
        "notes": [],
    }
    _tickets.append(ticket)
    _save()
    log.info("Ticket aperto: %s (%s, canale %s)", number, body.subject, body.channel)
    return Ticket(**ticket)


@app.get("/tickets", response_model=List[Ticket])
def list_tickets(status: Optional[str] = Query(None), caller: Optional[str] = Query(None)):
    items = _tickets
    if status:
        items = [t for t in items if t["status"] == status]
    if caller:
        items = [t for t in items if t.get("caller") == caller]
    # Dal più recente
    items = sorted(items, key=lambda t: t["created_at"], reverse=True)
    return [Ticket(**t) for t in items]


@app.get("/tickets/{number}", response_model=Ticket)
def get_ticket(number: str):
    ticket = _find(number)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket non trovato")
    return Ticket(**ticket)


@app.patch("/tickets/{number}", response_model=Ticket)
def update_ticket(number: str, body: TicketUpdate):
    ticket = _find(number)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket non trovato")
    if body.status is not None:
        ticket["status"] = body.status
    if body.note:
        ticket["notes"].append({
            "author": body.author or "operatore",
            "text": body.note,
            "at": datetime.now(timezone.utc).isoformat(),
        })
    ticket["updated_at"] = datetime.now(timezone.utc).isoformat()
    _save()
    return Ticket(**ticket)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8005, reload=True)
