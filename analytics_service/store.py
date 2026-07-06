"""
Persistenza e aggregazione delle analisi delle trascrizioni.

Legge i file di trascrizione da una cartella e conserva le analisi su un JSON
(scrittura atomica). L'aggregazione (`summarize`) è una funzione pura, testabile
senza I/O.
"""
from __future__ import annotations

import json
import os
import re
import threading
from datetime import datetime, timezone
from pathlib import Path


def label_for(filename: str) -> str:
    """Etichetta leggibile da un nome file di trascrizione (canale + data)."""
    m = re.match(r"(\d{8})_(\d{6})_(.+)\.txt", filename)
    if not m:
        return filename
    date_str, time_str, room = m.groups()
    date_label = f"{date_str[6:]}/{date_str[4:6]}/{date_str[:4]} {time_str[:2]}:{time_str[2:4]}"
    channel = "🌐 Web" if "web-" in room else "📞 Telefono"
    return f"{channel} — {date_label}"


def summarize(analyses: list[dict]) -> dict:
    """Aggrega una lista di analisi in metriche di sintesi (funzione pura)."""
    total = len(analyses)
    if total == 0:
        return {"total": 0, "avg_quality": 0.0, "by_outcome": {}, "by_sentiment": {}, "by_intent": {}}

    def _dist(field: str) -> dict:
        out: dict[str, int] = {}
        for a in analyses:
            key = a.get(field, "?")
            out[key] = out.get(key, 0) + 1
        return out

    scores = [a.get("quality_score", 0) for a in analyses]
    return {
        "total": total,
        "avg_quality": round(sum(scores) / total, 2),
        "by_outcome": _dist("outcome"),
        "by_sentiment": _dist("sentiment"),
        "by_intent": _dist("intent"),
    }


class AnalyticsStore:
    """Store su file delle analisi, indicizzate per nome di trascrizione."""

    def __init__(self, db_path: Path, transcripts_dir: Path) -> None:
        self.db_path = db_path
        self.transcripts_dir = transcripts_dir
        self._lock = threading.Lock()
        self._analyses: dict[str, dict] = {}
        self._load()

    def _load(self) -> None:
        if self.db_path.exists():
            try:
                self._analyses = json.loads(self.db_path.read_text())
            except (OSError, json.JSONDecodeError) as exc:
                raise RuntimeError(f"analyses.json corrotto ({self.db_path})") from exc

    def _save(self) -> None:
        with self._lock:
            tmp = self.db_path.with_name(self.db_path.name + ".tmp")
            tmp.write_text(json.dumps(self._analyses, default=str, indent=2))
            os.replace(tmp, self.db_path)

    def transcript_files(self) -> list[str]:
        """Nomi dei file di trascrizione presenti su disco, dal più recente."""
        if not self.transcripts_dir.exists():
            return []
        return sorted((f.name for f in self.transcripts_dir.glob("*.txt")), reverse=True)

    def pending(self) -> list[str]:
        """Trascrizioni non ancora analizzate."""
        return [f for f in self.transcript_files() if f not in self._analyses]

    def read_transcript(self, filename: str) -> str | None:
        safe = Path(filename).name  # previene path traversal
        path = self.transcripts_dir / safe
        if not path.is_file() or path.suffix != ".txt":
            return None
        return path.read_text(encoding="utf-8")

    def put(self, filename: str, llm_fields: dict) -> dict:
        """Salva l'analisi di una trascrizione arricchendola con label e timestamp."""
        analysis = {
            "filename": filename,
            "label": label_for(filename),
            **llm_fields,
            "analyzed_at": datetime.now(timezone.utc).isoformat(),
        }
        self._analyses[filename] = analysis
        self._save()
        return analysis

    def all(self) -> list[dict]:
        return sorted(self._analyses.values(), key=lambda a: a["filename"], reverse=True)

    def get(self, filename: str) -> dict | None:
        return self._analyses.get(filename)

    def summary(self) -> dict:
        return summarize(list(self._analyses.values()))
