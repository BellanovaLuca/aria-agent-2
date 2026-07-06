"""
Analisi AI di una trascrizione tramite Gemini con output strutturato (JSON).

Isola la chiamata al modello dietro `analyze_text`, così lo store e le API non
conoscono il provider e i test possono mockarla. Il modello è vincolato a
restituire un JSON conforme allo schema (riassunto, esito, sentiment, intento,
qualità 1-5), quindi il risultato è sempre parsabile.
"""
from __future__ import annotations

import json
import logging
import os

from google import genai
from google.genai import types
from pydantic import BaseModel, Field

log = logging.getLogger(__name__)

ANALYSIS_MODEL = os.getenv("ANALYSIS_MODEL", "gemini-2.5-flash")

ANALYSIS_PROMPT = """
Sei un analista della qualità del servizio clienti. Ricevi la trascrizione di una
conversazione tra un assistente IT ("AGENTE") e un utente ("UTENTE") e la analizzi
in modo oggettivo. Rispondi SOLO con il JSON richiesto, in italiano.

- summary: riassunto in una frase di cosa ha chiesto l'utente e com'è andata.
- outcome: "escalation" se la conversazione è stata passata a un operatore umano.
  Questo vale in due casi: (a) l'utente ha chiesto esplicitamente di parlare con
  un operatore / una persona; (b) dalla trascrizione risulta un handoff a un
  umano — un operatore o un collega del supporto è entrato in linea per gestire
  la richiesta (es. l'agente annuncia che "un collega è appena entrato in linea",
  oppure compare una riga di handoff a operatore). Altrimenti: "risolto" se la
  richiesta dell'utente è stata evasa, "non_risolto" se non lo è stata.
  L'apertura di un ticket, da sola, NON è escalation.
- sentiment: umore prevalente dell'utente ("positivo", "neutro", "negativo").
- intent: motivo principale del contatto ("reset_password", "sblocco",
  "domanda" per una domanda informativa, "altro").
- quality_score: qualità del servizio dell'agente da 1 (pessima) a 5 (ottima).
- quality_notes: una frase che motiva il punteggio.
""".strip()


class LLMAnalysis(BaseModel):
    """Schema che il modello deve rispettare (senza i metadati aggiunti dopo)."""
    summary: str
    outcome: str
    sentiment: str
    intent: str
    quality_score: int = Field(ge=1, le=5)
    quality_notes: str


_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        api_key = os.getenv("GOOGLE_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError("GOOGLE_API_KEY mancante: necessaria per l'analisi.")
        _client = genai.Client(api_key=api_key)
    return _client


async def analyze_text(transcript: str) -> dict:
    """Analizza il testo di una trascrizione e restituisce il dizionario dei campi.

    Il risultato è vincolato dallo schema LLMAnalysis; su output non conforme si
    ripiega su un parse del testo JSON.
    """
    client = _get_client()
    resp = await client.aio.models.generate_content(
        model=ANALYSIS_MODEL,
        contents=[types.Content(role="user", parts=[types.Part(text=transcript)])],
        config=types.GenerateContentConfig(
            system_instruction=ANALYSIS_PROMPT,
            response_mime_type="application/json",
            response_schema=LLMAnalysis,
            temperature=0.2,
        ),
    )
    parsed = resp.parsed
    if isinstance(parsed, LLMAnalysis):
        return parsed.model_dump()
    return LLMAnalysis(**json.loads(resp.text)).model_dump()
