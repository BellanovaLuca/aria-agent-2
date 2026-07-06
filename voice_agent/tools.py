"""
Tool functions esposte a Gemini Live durante le conversazioni telefoniche.

Ogni funzione decorata con @llm.function_tool viene registrata nel contesto
dell'agente e può essere invocata autonomamente dal modello quando lo ritiene
necessario nel flusso conversazionale.

Le funzioni comunicano esclusivamente con il Mock User Service via HTTP REST
(autenticate con l'header X-Internal-Api-Key). In produzione si sostituirebbe
USER_SERVICE_URL con il servizio reale.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path

import httpx
from dotenv import load_dotenv
from livekit.agents import llm

load_dotenv(Path(__file__).parent.parent / ".env")

USER_SERVICE_URL = os.getenv("USER_SERVICE_URL", "http://localhost:8001")
_INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "")
log = logging.getLogger(__name__)

# Risposta di cortesia quando il backend non risponde: il modello la riferisce
# all'utente invece di far cadere la conversazione con un'eccezione non gestita.
_SERVICE_UNAVAILABLE = {
    "found": False,
    "success": False,
    "message": (
        "Il sistema di gestione utenti è momentaneamente non disponibile. "
        "Invita l'utente a riprovare tra qualche minuto o a contattare il supporto."
    ),
}


@llm.function_tool
async def reset_user_password(username: str) -> dict:
    """Verifica l'utente ed esegue il reset della password in un'unica operazione.

    Cerca l'utente per username o email, controlla che l'account sia attivo,
    e se lo è esegue immediatamente il reset. La password temporanea NON viene
    restituita: l'utente la riceve via email. Restituisce un messaggio chiaro
    in tutti i casi (non trovato, bloccato, reset riuscito o fallito).

    Args:
        username: Username (es. "mario.rossi") o indirizzo email dell'utente.

    Returns:
        Dizionario con found, status, success e message.
    """
    log.info(">>> TOOL CALL: reset_user_password(username=%r)", username)
    headers = {"X-Internal-Api-Key": _INTERNAL_API_KEY}
    try:
        async with httpx.AsyncClient(timeout=10.0, headers=headers) as client:
            # Passo 1: verifica utente
            if "@" in username:
                resp = await client.get(f"{USER_SERVICE_URL}/users", params={"email": username})
                resp.raise_for_status()
                users = resp.json()
                if not users:
                    log.info(">>> utente non trovato (email=%r)", username)
                    return {"found": False, "message": "Nessun utente trovato con questa email."}
                user = users[0]
            else:
                resp = await client.get(f"{USER_SERVICE_URL}/users/{username}")
                if resp.status_code == 404:
                    log.info(">>> utente non trovato (username=%r)", username)
                    return {"found": False, "message": "Utente non trovato."}
                resp.raise_for_status()
                user = resp.json()

            # Delega tutto al backend: gestisce locked/suspended/active e registra
            # la cronologia in entrambi i casi (successo e fallimento).
            reset_resp = await client.post(
                f"{USER_SERVICE_URL}/reset-password",
                json={"username": user["username"], "channel": "voice"},
            )
            reset_resp.raise_for_status()
            result = reset_resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        # Timeout, connessione rifiutata, 5xx o body non-JSON: la chiamata
        # vocale deve proseguire con una risposta di cortesia, non crashare.
        log.warning(">>> user service non disponibile: %s", exc)
        return dict(_SERVICE_UNAVAILABLE)

    # La password temporanea non deve mai entrare nel contesto del modello:
    # finirebbe nei log, potrebbe essere pronunciata e quindi trascritta.
    # Viaggia esclusivamente via email.
    result.pop("new_password", None)
    log.info(">>> reset per %r: success=%s", user["username"], result.get("success"))
    return {
        "found": True,
        "username": user["username"],
        "status": user.get("status", "unknown"),
        **result,
    }
