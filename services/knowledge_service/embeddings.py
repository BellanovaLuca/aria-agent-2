"""
Generazione di embedding tramite Google Gemini (`gemini-embedding-001`).

Isolato dal resto del servizio dietro una funzione semplice `embed_texts`, così
lo store può ricevere una funzione di embedding mockata nei test senza toccare
la rete. Il client Gemini è un singleton lazy: creato una sola volta per
processo, mai dentro un handler HTTP.
"""
from __future__ import annotations

import math
import os
from typing import Literal

from google import genai
from google.genai import types

EMBED_MODEL = os.getenv("EMBED_MODEL", "gemini-embedding-001")
# 768 dim: buon compromesso qualità/velocità per il retrieval in questo contesto.
EMBED_DIM = int(os.getenv("EMBED_DIM", "768"))

TaskType = Literal["RETRIEVAL_DOCUMENT", "RETRIEVAL_QUERY"]

_client: genai.Client | None = None


def _get_client() -> genai.Client:
    """Restituisce il client Gemini, creandolo alla prima chiamata (lazy singleton)."""
    global _client
    if _client is None:
        api_key = os.getenv("GOOGLE_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError("GOOGLE_API_KEY mancante: necessaria per gli embedding.")
        _client = genai.Client(api_key=api_key)
    return _client


def _normalize(vector: list[float]) -> list[float]:
    """Normalizza L2 un vettore.

    Gli embedding a dimensione ridotta (<3072) di gemini-embedding-001 non sono
    pre-normalizzati: la normalizzazione è necessaria perché la distanza coseno
    di Qdrant sia coerente.
    """
    norm = math.sqrt(sum(x * x for x in vector))
    if norm == 0.0:
        return vector
    return [x / norm for x in vector]


def embed_texts(texts: list[str], task_type: TaskType) -> list[list[float]]:
    """Calcola gli embedding normalizzati di una lista di testi.

    Args:
        texts: testi da vettorializzare (chunk di documento o query).
        task_type: RETRIEVAL_DOCUMENT per l'indicizzazione, RETRIEVAL_QUERY per
            la ricerca — Gemini ottimizza lo spazio vettoriale di conseguenza.

    Returns:
        Una lista di vettori (uno per testo), ciascuno di dimensione EMBED_DIM.
    """
    if not texts:
        return []
    client = _get_client()
    result = client.models.embed_content(
        model=EMBED_MODEL,
        contents=texts,
        config=types.EmbedContentConfig(
            task_type=task_type,
            output_dimensionality=EMBED_DIM,
        ),
    )
    return [_normalize(list(e.values)) for e in result.embeddings]
