"""
Estrazione testo e chunking dei documenti della knowledge base.

Funzioni pure (nessun I/O di rete, nessuno stato): ricevono i byte grezzi di un
upload e restituiscono i chunk di testo pronti per l'embedding. Testabili in
isolamento.
"""
from __future__ import annotations

import io
import re
from dataclasses import dataclass

from pypdf import PdfReader

# Estensioni ammesse (whitelist, non blacklist).
SUPPORTED_EXTENSIONS = {".txt", ".md", ".pdf"}

# Parametri di chunking: ~280 parole ≈ ~400 token, con sovrapposizione per non
# spezzare il contesto a cavallo di due chunk.
CHUNK_WORDS = 280
OVERLAP_WORDS = 50


@dataclass(frozen=True)
class Chunk:
    """Un frammento di testo con il suo indice progressivo nel documento."""
    index: int
    text: str


def extension_of(filename: str) -> str:
    """Restituisce l'estensione in minuscolo, inclusa (es. '.pdf')."""
    dot = filename.rfind(".")
    return filename[dot:].lower() if dot != -1 else ""


def is_supported(filename: str) -> bool:
    """True se l'estensione del file è tra quelle gestite."""
    return extension_of(filename) in SUPPORTED_EXTENSIONS


def _clean_text(text: str) -> str:
    """Normalizza il testo: rimuove null byte e comprime spazi/newline multipli."""
    text = text.replace("\x00", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_text(filename: str, raw: bytes) -> str:
    """Estrae il testo grezzo da un upload in base all'estensione.

    Args:
        filename: nome originale del file (determina il parser da usare).
        raw: contenuto binario del file.

    Returns:
        Il testo estratto e normalizzato.

    Raises:
        ValueError: se l'estensione non è supportata o il PDF è illeggibile.
    """
    ext = extension_of(filename)
    if ext in (".txt", ".md"):
        return _clean_text(raw.decode("utf-8", errors="replace"))
    if ext == ".pdf":
        try:
            reader = PdfReader(io.BytesIO(raw))
            pages = [page.extract_text() or "" for page in reader.pages]
        except Exception as exc:  # pypdf solleva vari tipi su PDF corrotti
            raise ValueError(f"PDF illeggibile: {exc}") from exc
        return _clean_text("\n\n".join(pages))
    raise ValueError(f"Estensione non supportata: {ext or '(nessuna)'}")


def chunk_text(text: str, chunk_words: int = CHUNK_WORDS, overlap_words: int = OVERLAP_WORDS) -> list[Chunk]:
    """Suddivide il testo in chunk sovrapposti basati sul conteggio di parole.

    La sovrapposizione mantiene continuità semantica tra chunk adiacenti, così
    un'informazione a cavallo del confine resta recuperabile da almeno un chunk.

    Args:
        text: testo già estratto e normalizzato.
        chunk_words: numero massimo di parole per chunk.
        overlap_words: parole condivise tra un chunk e il successivo.

    Returns:
        Lista di Chunk con indice progressivo. Lista vuota se il testo è vuoto.
    """
    if chunk_words <= 0:
        raise ValueError("chunk_words deve essere positivo")
    if not 0 <= overlap_words < chunk_words:
        raise ValueError("overlap_words deve essere in [0, chunk_words)")

    words = text.split()
    if not words:
        return []

    step = chunk_words - overlap_words
    chunks: list[Chunk] = []
    for start in range(0, len(words), step):
        window = words[start:start + chunk_words]
        if not window:
            break
        chunks.append(Chunk(index=len(chunks), text=" ".join(window)))
        if start + chunk_words >= len(words):
            break
    return chunks
