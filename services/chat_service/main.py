"""
Chat Service — canale chat testuale del supporto IT (FastAPI, porta 8004).

Espone l'assistente "Sofia" via HTTP: ogni richiesta porta un messaggio utente e
un id di sessione; il servizio mantiene la cronologia della conversazione in
memoria e risponde eseguendo gli stessi strumenti del canale vocale.

Lo storage delle sessioni è in-memory (si azzera al riavvio) e monoprocesso —
adeguato al PoC; in produzione andrebbe in una cache condivisa (es. Redis).

Endpoints (protetti da X-Internal-Api-Key):
  POST   /message            — invia un messaggio, riceve la risposta
  DELETE /sessions/{id}      — dimentica una conversazione
  GET    /health             — liveness
"""
from __future__ import annotations

import logging
import sys
import uuid
from collections import OrderedDict
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google.genai import types
from pydantic import BaseModel, Field

_ROOT = next(p for p in Path(__file__).resolve().parents if (p / ".env.example").is_file())
load_dotenv(_ROOT / ".env")
sys.path.insert(0, str(_ROOT))
sys.path.insert(0, str(Path(__file__).parent))

from shared.auth import API_KEY_HEADER, make_api_key_dependency

from agent import generate_reply

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("chat_service")

# Cap sulle sessioni tenute in memoria e sulla lunghezza di ciascuna, per non
# crescere senza limiti. Superata la capienza, si scarta la sessione più vecchia.
MAX_SESSIONS = 500
MAX_HISTORY_CONTENTS = 40

# session_id -> lista di Content (cronologia della conversazione)
_sessions: "OrderedDict[str, list[types.Content]]" = OrderedDict()


def _trim(history: list[types.Content]) -> list[types.Content]:
    """Limita la cronologia mantenendo i turni più recenti.

    Dopo il taglio scarta eventuali Content iniziali che non siano un messaggio
    utente testuale, per non lasciare una risposta-tool orfana in testa (il che
    farebbe rifiutare la richiesta dall'API).
    """
    if len(history) <= MAX_HISTORY_CONTENTS:
        return history
    trimmed = history[-MAX_HISTORY_CONTENTS:]
    while trimmed and not (
        trimmed[0].role == "user"
        and trimmed[0].parts
        and getattr(trimmed[0].parts[0], "text", None)
    ):
        trimmed.pop(0)
    return trimmed


app = FastAPI(
    title="Chat Service",
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
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type", API_KEY_HEADER],
)


class ChatRequest(BaseModel):
    session_id: str | None = None
    text: str = Field(min_length=1, max_length=2000)


class ChatResponse(BaseModel):
    session_id: str
    reply: str


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/message", response_model=ChatResponse)
async def message(body: ChatRequest) -> ChatResponse:
    session_id = body.session_id or uuid.uuid4().hex
    history = _sessions.get(session_id, [])

    try:
        reply, new_history = await generate_reply(history, body.text)
    except Exception as exc:  # errore del modello o di rete: non esporre i dettagli
        log.exception("Generazione risposta fallita (session=%s)", session_id)
        raise HTTPException(status_code=502, detail="Assistente non disponibile, riprova.") from exc

    _sessions[session_id] = _trim(new_history)
    _sessions.move_to_end(session_id)
    while len(_sessions) > MAX_SESSIONS:
        _sessions.popitem(last=False)

    return ChatResponse(session_id=session_id, reply=reply)


@app.delete("/sessions/{session_id}", status_code=204)
def forget_session(session_id: str) -> None:
    _sessions.pop(session_id, None)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8004, reload=True)
