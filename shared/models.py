"""
Modelli Pydantic condivisi tra User Service, Email Service ed Email Processor.

Centralizzare qui i modelli evita duplicazioni e garantisce coerenza
nei tipi di dati scambiati tra i microservizi via HTTP REST.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


class User(BaseModel):
    """Rappresenta un utente nel sistema di gestione password."""
    username: str
    email: str
    full_name: str
    # "suspended" è gestito dal backend ma non esposto nel frontend (solo active/locked)
    status: Literal["active", "locked", "suspended"]
    last_reset: Optional[datetime] = None
    created_at: datetime


class ResetRequest(BaseModel):
    """Payload per richiedere il reset della password di un utente."""
    username: str
    channel: Literal["voice", "email"]  # traccia il canale di origine per le metriche


class ResetResult(BaseModel):
    """Risposta del servizio di reset password."""
    success: bool
    username: str
    message: str
    new_password: Optional[str] = None  # presente solo se success=True


class ResetHistoryEntry(BaseModel):
    """Voce della cronologia reset, persistita in db.json."""
    id: str
    username: str
    channel: Literal["voice", "email"]
    success: bool
    message: str
    requested_at: datetime


class Email(BaseModel):
    """Email completa con metadati (id, timestamp, stato di processazione)."""
    id: str
    from_address: str
    to_address: str
    subject: str
    body: str
    timestamp: datetime
    processed: bool = False


class EmailCreate(BaseModel):
    """Payload per creare/inviare una nuova email (senza id e timestamp, generati dal servizio)."""
    from_address: str
    to_address: str
    subject: str
    body: str
