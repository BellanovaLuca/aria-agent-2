"""
Operazioni di supporto IT condivise tra i canali (voce e chat).

Centralizzano la logica di business e di sicurezza — lookup utente, reset,
sblocco, ricerca nella knowledge base — in modo che voice agent e chat service
si comportino in modo identico. In particolare la regola per cui la password
temporanea non torna MAI al modello vive qui, in un unico punto.

Ogni funzione è async, usa httpx con timeout e l'header X-Internal-Api-Key, e
restituisce dizionari già pronti per essere passati al modello. Su errore di
rete restituisce un messaggio di cortesia invece di sollevare: la conversazione
prosegue con garbo.
"""
from __future__ import annotations

import logging
import os

import httpx

log = logging.getLogger(__name__)

USER_SERVICE_URL = os.getenv("USER_SERVICE_URL", "http://localhost:8001")
KNOWLEDGE_SERVICE_URL = os.getenv("KNOWLEDGE_SERVICE_URL", "http://localhost:8003")
_INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "")

_HTTP_TIMEOUT = 10.0

_SERVICE_UNAVAILABLE = {
    "found": False,
    "success": False,
    "message": (
        "Il sistema di gestione utenti è momentaneamente non disponibile. "
        "Invita l'utente a riprovare tra qualche minuto o a contattare il supporto."
    ),
}


def _headers() -> dict:
    return {"X-Internal-Api-Key": _INTERNAL_API_KEY}


async def reset_password(identifier: str, channel: str) -> dict:
    """Verifica l'utente ed esegue il reset password (per username o email).

    La password temporanea NON viene mai restituita: l'utente la riceve via
    email. `channel` traccia l'origine ("voice", "chat", ...) per le metriche.
    """
    log.info("reset_password(identifier=%r, channel=%r)", identifier, channel)
    try:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT, headers=_headers()) as client:
            if "@" in identifier:
                resp = await client.get(f"{USER_SERVICE_URL}/users", params={"email": identifier})
                resp.raise_for_status()
                users = resp.json()
                if not users:
                    return {"found": False, "message": "Nessun utente trovato con questa email."}
                user = users[0]
            else:
                resp = await client.get(f"{USER_SERVICE_URL}/users/{identifier}")
                if resp.status_code == 404:
                    return {"found": False, "message": "Utente non trovato."}
                resp.raise_for_status()
                user = resp.json()

            reset_resp = await client.post(
                f"{USER_SERVICE_URL}/reset-password",
                json={"username": user["username"], "channel": channel},
            )
            reset_resp.raise_for_status()
            result = reset_resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        log.warning("reset_password: user service non disponibile: %s", exc)
        return dict(_SERVICE_UNAVAILABLE)

    # La password temporanea non deve mai entrare nel contesto del modello.
    result.pop("new_password", None)
    return {
        "found": True,
        "username": user["username"],
        "status": user.get("status", "unknown"),
        **result,
    }


async def unlock_account(username: str, full_name: str, channel: str) -> dict:
    """Sblocca un'utenza bloccata previa verifica identità (delega al backend)."""
    log.info("unlock_account(username=%r, channel=%r)", username, channel)
    try:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT, headers=_headers()) as client:
            resp = await client.post(
                f"{USER_SERVICE_URL}/unlock-account",
                json={"username": username, "full_name": full_name, "channel": channel},
            )
            resp.raise_for_status()
            return resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        log.warning("unlock_account: user service non disponibile: %s", exc)
        return dict(_SERVICE_UNAVAILABLE)


async def search_knowledge_base(query: str) -> dict:
    """Cerca nella knowledge base i passaggi rilevanti per una domanda.

    Restituisce {found, passages: [{text, source}]}. La regola anti-allucinazione
    (rispondere solo dai passaggi) è imposta dal prompt del modello.
    """
    log.info("search_knowledge_base(query=%r)", query)
    try:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT, headers=_headers()) as client:
            resp = await client.post(
                f"{KNOWLEDGE_SERVICE_URL}/search",
                json={"query": query, "top_k": 3},
            )
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        log.warning("search_knowledge_base: knowledge service non disponibile: %s", exc)
        return {
            "found": False,
            "passages": [],
            "message": "La base di conoscenza non è al momento raggiungibile.",
        }
    passages = [{"text": h["text"], "source": h["filename"]} for h in data.get("hits", [])]
    return {"found": bool(passages), "passages": passages}
