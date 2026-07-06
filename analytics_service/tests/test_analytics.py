"""
Test dell'analytics_service: aggregazione pura, store con trascrizioni finte e
endpoint /analyze con analyzer mockato (nessuna chiamata a Gemini).
"""
import importlib
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

import pytest

from store import AnalyticsStore, label_for, summarize


def test_summarize_empty():
    s = summarize([])
    assert s["total"] == 0 and s["avg_quality"] == 0.0


def test_summarize_aggregates():
    analyses = [
        {"outcome": "risolto", "sentiment": "positivo", "intent": "reset_password", "quality_score": 5},
        {"outcome": "risolto", "sentiment": "neutro", "intent": "domanda", "quality_score": 4},
        {"outcome": "escalation", "sentiment": "negativo", "intent": "altro", "quality_score": 2},
    ]
    s = summarize(analyses)
    assert s["total"] == 3
    assert s["avg_quality"] == round((5 + 4 + 2) / 3, 2)
    assert s["by_outcome"] == {"risolto": 2, "escalation": 1}
    assert s["by_sentiment"] == {"positivo": 1, "neutro": 1, "negativo": 1}
    assert s["by_intent"]["reset_password"] == 1


def test_label_for():
    assert "Telefono" in label_for("20260422_220739_call-_caller99_ABC.txt")
    assert "Web" in label_for("20260423_090248_web-54dbeedb.txt")
    assert label_for("strano.txt") == "strano.txt"


@pytest.fixture
def store(tmp_path):
    tdir = tmp_path / "transcripts"
    tdir.mkdir()
    (tdir / "20260422_220739_web-aaa.txt").write_text("AGENTE: ciao\nUTENTE: reset password", encoding="utf-8")
    (tdir / "20260422_230000_web-bbb.txt").write_text("AGENTE: ciao\nUTENTE: sblocco", encoding="utf-8")
    return AnalyticsStore(tmp_path / "analyses.json", tdir)


def test_pending_and_put(store):
    assert len(store.pending()) == 2
    store.put("20260422_220739_web-aaa.txt", {
        "summary": "reset", "outcome": "risolto", "sentiment": "neutro",
        "intent": "reset_password", "quality_score": 5, "quality_notes": "ok",
    })
    pending = store.pending()
    assert len(pending) == 1
    assert "20260422_220739_web-aaa.txt" not in pending
    saved = store.get("20260422_220739_web-aaa.txt")
    assert saved["label"] and saved["analyzed_at"]


def test_read_transcript_path_safe(store):
    assert store.read_transcript("../../etc/passwd") is None
    assert store.read_transcript("inesistente.txt") is None
    assert "UTENTE" in store.read_transcript("20260422_220739_web-aaa.txt")


def test_analyze_endpoint_with_mocked_llm(tmp_path, monkeypatch):
    tdir = tmp_path / "transcripts"
    tdir.mkdir()
    (tdir / "20260422_220739_web-aaa.txt").write_text("AGENTE: ciao\nUTENTE: reset", encoding="utf-8")

    os.environ["INTERNAL_API_KEY"] = "test-key-an"
    os.environ["TRANSCRIPTS_DIR"] = str(tdir)
    os.environ["ANALYSES_DB_PATH"] = str(tmp_path / "analyses.json")

    import main
    importlib.reload(main)

    async def fake_analyze(text):
        return {"summary": "s", "outcome": "risolto", "sentiment": "positivo",
                "intent": "reset_password", "quality_score": 4, "quality_notes": "buono"}

    monkeypatch.setattr(main.analyzer, "analyze_text", fake_analyze)

    from fastapi.testclient import TestClient
    client = TestClient(main.app)
    auth = {"X-Internal-Api-Key": "test-key-an"}

    assert client.post("/analyze").status_code == 401  # senza chiave
    r = client.post("/analyze", headers=auth)
    assert r.status_code == 200
    body = r.json()
    assert body["analyzed"] == ["20260422_220739_web-aaa.txt"]
    assert body["remaining"] == 0

    analyses = client.get("/analyses", headers=auth).json()
    assert len(analyses) == 1 and analyses[0]["quality_score"] == 4
    summary = client.get("/summary", headers=auth).json()
    assert summary["total"] == 1 and summary["avg_quality"] == 4.0
