"""
Knowledge Service — base di conoscenza per la Q&A dell'agente (FastAPI, porta 8003).

Indicizza documenti (PDF/MD/TXT) in un vector store Qdrant e li rende
interrogabili semanticamente. Il voice agent e il frontend lo usano tramite
l'endpoint /search, che restituisce i passaggi rilevanti con la citazione del
documento di origine.

Qdrant gira in modalità locale embedded (cartella su disco); impostando
QDRANT_URL si passa a un server Qdrant esterno senza modifiche al codice.

Endpoints (tutti protetti da X-Internal-Api-Key):
  POST   /documents            — carica e indicizza un documento
  GET    /documents            — elenca i documenti indicizzati
  DELETE /documents/{doc_id}   — elimina un documento e i suoi chunk
  POST   /search               — ricerca semantica, restituisce passaggi + fonte
  GET    /health               — liveness
"""
from __future__ import annotations

import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

_ROOT = next(p for p in Path(__file__).resolve().parents if (p / ".env.example").is_file())
load_dotenv(_ROOT / ".env")
sys.path.insert(0, str(_ROOT))
sys.path.insert(0, str(Path(__file__).parent))

from shared.auth import API_KEY_HEADER, make_api_key_dependency

from chunker import chunk_text, extract_text, is_supported
from embeddings import EMBED_DIM, embed_texts
from store import KnowledgeStore

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("knowledge_service")

# Cap dimensione upload: evita OOM su file abnormi (CLAUDE.md §2.7).
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(10 * 1024 * 1024)))  # 10 MB
QDRANT_URL = os.getenv("QDRANT_URL", "").strip() or None
QDRANT_PATH = os.getenv("QDRANT_PATH", str(Path(__file__).parent / "qdrant_data"))

# Store come singleton lazy: Qdrant embedded tiene un lock esclusivo sulla
# cartella, quindi va aperto una sola volta per processo (mai per-request).
_store: KnowledgeStore | None = None


def get_store() -> KnowledgeStore:
    global _store
    if _store is None:
        _store = KnowledgeStore(
            embed_fn=embed_texts,
            dim=EMBED_DIM,
            url=QDRANT_URL,
            path=None if QDRANT_URL else QDRANT_PATH,
        )
        log.info("KnowledgeStore pronto (%s)", "server" if QDRANT_URL else QDRANT_PATH)
    return _store


app = FastAPI(
    title="Knowledge Service",
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


# ── Modelli ────────────────────────────────────────────────────────────────

class DocumentOut(BaseModel):
    id: str
    filename: str
    chunk_count: int
    uploaded_at: str


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=1000)
    top_k: int = Field(default=3, ge=1, le=10)


class SearchHitOut(BaseModel):
    doc_id: str
    filename: str
    chunk_index: int
    text: str
    score: float


class SearchResponse(BaseModel):
    query: str
    hits: list[SearchHitOut]


# ── Endpoints ──────────────────────────────────────────────────────────────

@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/documents", response_model=list[DocumentOut])
def list_documents() -> list[DocumentOut]:
    docs = get_store().list_documents()
    return [DocumentOut(**vars(d)) for d in docs]


@app.post("/documents", response_model=DocumentOut, status_code=201)
async def upload_document(file: UploadFile = File(...)) -> DocumentOut:
    """Carica e indicizza un documento. Whitelist estensioni + cap dimensione."""
    filename = (file.filename or "").strip()
    if not filename or not is_supported(filename):
        raise HTTPException(status_code=400, detail="Formato non supportato: usa PDF, MD o TXT.")

    # Lettura con cap: interrompe file troppo grandi senza caricarli tutti.
    raw = bytearray()
    while chunk := await file.read(1024 * 1024):
        raw.extend(chunk)
        if len(raw) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="File troppo grande (max 10 MB).")

    try:
        text = extract_text(filename, bytes(raw))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    chunks = chunk_text(text)
    if not chunks:
        raise HTTPException(status_code=400, detail="Il documento non contiene testo estraibile.")

    try:
        meta = get_store().add_document(filename, chunks)
    except Exception as exc:  # embedding o Qdrant non disponibili
        log.exception("Indicizzazione fallita per %s", filename)
        raise HTTPException(status_code=502, detail="Indicizzazione non riuscita, riprova.") from exc

    log.info("Documento indicizzato: %s (%d chunk)", filename, meta.chunk_count)
    return DocumentOut(**vars(meta))


@app.delete("/documents/{doc_id}", status_code=204)
def delete_document(doc_id: str) -> None:
    if not get_store().delete_document(doc_id):
        raise HTTPException(status_code=404, detail="Documento non trovato.")


@app.post("/search", response_model=SearchResponse)
def search(body: SearchRequest) -> SearchResponse:
    try:
        hits = get_store().search(body.query, body.top_k)
    except Exception as exc:
        log.exception("Ricerca fallita")
        raise HTTPException(status_code=502, detail="Ricerca non disponibile, riprova.") from exc
    return SearchResponse(
        query=body.query,
        hits=[SearchHitOut(**vars(h)) for h in hits],
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8003, reload=True)
