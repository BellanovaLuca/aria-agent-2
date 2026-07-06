"""
Autenticazione interna condivisa tra i microservizi (user_service, email_service).

Tutti gli endpoint richiedono l'header X-Internal-Api-Key uguale alla variabile
d'ambiente INTERNAL_API_KEY. La chiave è un segreto di deployment: viaggia solo
tra processi locali (tool del voice agent, email processor, proxy di sviluppo
Vite) e non arriva mai al browser.

Uso nei servizi FastAPI:

    from shared.auth import make_api_key_dependency
    app = FastAPI(dependencies=[Depends(make_api_key_dependency())])
"""
from __future__ import annotations

import hmac
import os

from fastapi import HTTPException, Security
from fastapi.security import APIKeyHeader

API_KEY_HEADER = "X-Internal-Api-Key"

_api_key_header = APIKeyHeader(name=API_KEY_HEADER, auto_error=False)


def get_internal_api_key() -> str:
    """Legge INTERNAL_API_KEY dall'ambiente, fallendo subito se assente.

    Fail-fast: un servizio avviato senza chiave resterebbe aperto a chiunque.
    """
    key = os.getenv("INTERNAL_API_KEY", "").strip()
    if not key or key.startswith("change-me"):
        raise RuntimeError(
            "INTERNAL_API_KEY mancante o placeholder: generala con "
            "`openssl rand -hex 32` e aggiungila al file .env nella root "
            "(vedi .env.example) prima di avviare i servizi."
        )
    return key


def make_api_key_dependency():
    """Costruisce la dependency FastAPI che verifica X-Internal-Api-Key.

    La chiave attesa viene letta una sola volta alla creazione dell'app;
    il confronto usa hmac.compare_digest (constant-time).
    """
    expected = get_internal_api_key()

    async def require_api_key(key: str | None = Security(_api_key_header)) -> None:
        if not key or not hmac.compare_digest(key, expected):
            raise HTTPException(status_code=401, detail="Non autorizzato")

    return require_api_key
