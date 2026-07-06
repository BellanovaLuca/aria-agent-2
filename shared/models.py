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


# Canali da cui può arrivare una richiesta (per le metriche del frontend).
Channel = Literal["voice", "email", "chat"]


class ResetRequest(BaseModel):
    """Payload per richiedere il reset della password di un utente."""
    username: str
    channel: Channel  # traccia il canale di origine per le metriche


class ResetResult(BaseModel):
    """Risposta del servizio di reset password."""
    success: bool
    username: str
    message: str
    new_password: Optional[str] = None  # presente solo se success=True


class UnlockRequest(BaseModel):
    """Payload per richiedere lo sblocco di un'utenza bloccata.

    full_name è la verifica d'identità: deve corrispondere al nome registrato.
    """
    username: str
    full_name: str
    channel: Channel


class UnlockResult(BaseModel):
    """Risposta del servizio di sblocco utenza."""
    success: bool
    username: str
    message: str


class ResetHistoryEntry(BaseModel):
    """Voce della cronologia operazioni, persistita in db.json.

    operation distingue reset password da sblocco utenza; default "reset" per
    retrocompatibilità con le voci storiche prive del campo.
    """
    id: str
    username: str
    channel: Channel
    operation: Literal["reset", "unlock"] = "reset"
    success: bool
    message: str
    requested_at: datetime


TicketStatus = Literal["new", "in_progress", "resolved", "closed"]


class TicketNote(BaseModel):
    """Nota di lavorazione aggiunta a un ticket."""
    author: str
    text: str
    at: datetime


class TicketCreate(BaseModel):
    """Payload per aprire un nuovo ticket di supporto."""
    caller: Optional[str] = None       # username/email del richiedente, se noto
    channel: Channel
    category: str = "altro"
    subject: str
    description: str


class TicketUpdate(BaseModel):
    """Aggiornamento di un ticket: cambio stato e/o aggiunta di una nota."""
    status: Optional[TicketStatus] = None
    note: Optional[str] = None
    author: Optional[str] = None        # autore della nota (default "operatore")


class Ticket(BaseModel):
    """Ticket di supporto (mock ServiceNow), persistito su tickets.json."""
    id: str
    number: str                          # es. "INC0001001"
    caller: Optional[str] = None
    channel: Channel
    category: str
    subject: str
    description: str
    status: TicketStatus
    created_at: datetime
    updated_at: datetime
    notes: list[TicketNote] = []


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
