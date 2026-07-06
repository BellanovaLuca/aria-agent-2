"""
Analytics Service — analisi AI post-chiamata delle trascrizioni (FastAPI, porta 8006).

Analizza le trascrizioni delle conversazioni con Gemini (output strutturato) e
produce riassunto, esito, sentiment, intento e un punteggio di qualità; espone
sia le singole analisi sia metriche aggregate per la dashboard.

L'analisi è un job on-demand (POST /analyze): processa in batch le trascrizioni
non ancora analizzate. Nessun costo a runtime finché non viene invocata.

Endpoints (protetti da X-Internal-Api-Key):
  POST /analyze              — analizza le trascrizioni non ancora processate
  GET  /analyses             — elenca le analisi salvate
  GET  /summary              — metriche aggregate (qualità media, distribuzioni)
  GET  /health               — liveness
"""
from __future__ import annotations

import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv(Path(__file__).parent.parent / ".env")
sys.path.insert(0, str(Path(__file__).parent.parent))
sys.path.insert(0, str(Path(__file__).parent))

from shared.auth import API_KEY_HEADER, make_api_key_dependency
from shared.models import TranscriptAnalysis

import analyzer
from store import AnalyticsStore

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("analytics_service")

TRANSCRIPTS_DIR = Path(os.getenv("TRANSCRIPTS_DIR", str(Path(__file__).parent.parent / "transcripts")))
DB_PATH = Path(os.getenv("ANALYSES_DB_PATH", str(Path(__file__).parent / "analyses.json")))
# Cap di sicurezza sul batch di analisi per invocazione (ogni item è una chiamata LLM).
DEFAULT_LIMIT = int(os.getenv("ANALYZE_BATCH_LIMIT", "25"))

_store = AnalyticsStore(DB_PATH, TRANSCRIPTS_DIR)

app = FastAPI(
    title="Analytics Service",
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
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", API_KEY_HEADER],
)


class AnalyzeResult(BaseModel):
    analyzed: list[str]
    failed: list[str]
    remaining: int


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/analyses", response_model=list[TranscriptAnalysis])
def list_analyses() -> list[TranscriptAnalysis]:
    return [TranscriptAnalysis(**a) for a in _store.all()]


@app.get("/summary")
def summary() -> dict:
    return _store.summary()


@app.post("/analyze", response_model=AnalyzeResult)
async def analyze(limit: int = Query(DEFAULT_LIMIT, ge=1, le=200)) -> AnalyzeResult:
    """Analizza fino a `limit` trascrizioni non ancora processate."""
    pending = _store.pending()[:limit]
    analyzed: list[str] = []
    failed: list[str] = []
    for filename in pending:
        text = _store.read_transcript(filename)
        if not text:
            failed.append(filename)
            continue
        try:
            fields = await analyzer.analyze_text(text)
            _store.put(filename, fields)
            analyzed.append(filename)
        except Exception:
            log.exception("Analisi fallita per %s", filename)
            failed.append(filename)
    log.info("Analizzate %d trascrizioni (%d fallite)", len(analyzed), len(failed))
    return AnalyzeResult(analyzed=analyzed, failed=failed, remaining=len(_store.pending()))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8006, reload=True)
