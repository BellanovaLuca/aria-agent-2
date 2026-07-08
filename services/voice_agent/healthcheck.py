"""
Healthcheck Docker del voice agent, con auto-riparazione.

Il worker LiveKit espone un HTTP server di stato (porta 8081, fissata in
agent.py): `GET /` risponde 200 se la connessione a LiveKit Cloud è attiva,
503 se il worker ha rinunciato a riconnettersi (`_connection_failed`) o se il
processo di inference è morto. Un worker in quello stato è vivo ma non riceve
più job: Sofia non entra in chiamata e la restart policy da sola non scatta,
perché il processo non esce mai.

Questo script viene eseguito da Docker a ogni intervallo di healthcheck:
- esito OK  → exit 0 e azzera il contatore dei fallimenti consecutivi;
- esito KO  → exit 1 (il container diventa "unhealthy" dopo `retries` docker) e
  incrementa il contatore su file; raggiunta la soglia, manda SIGTERM a PID 1:
  il worker esce in modo ordinato e la restart policy lo ricrea pulito.

La soglia è volutamente più alta dei `retries` docker: lo stato "unhealthy" è
un segnale rapido di visibilità, il riavvio è un'azione paziente che non deve
scattare per un blip di rete (il worker si riconnette da solo, vedi max_retry
in agent.py).

Env (con default):
  HC_WORKER_URL    URL di stato del worker   (http://127.0.0.1:8081/)
  HC_MAX_FAILURES  fallimenti consecutivi prima del riavvio (20 ≈ 10 min a
                   intervalli di 30s)
  HC_STATE_FILE    file del contatore (/tmp/voice_agent_hc_failures)
"""
from __future__ import annotations

import os
import signal
import sys
import urllib.error
import urllib.request
from pathlib import Path

WORKER_URL = os.getenv("HC_WORKER_URL", "http://127.0.0.1:8081/")
MAX_CONSECUTIVE_FAILURES = int(os.getenv("HC_MAX_FAILURES", "20"))
STATE_FILE = Path(os.getenv("HC_STATE_FILE", "/tmp/voice_agent_hc_failures"))


def worker_is_healthy() -> tuple[bool, str]:
    """Interroga l'endpoint di stato del worker. Restituisce (ok, dettaglio)."""
    try:
        with urllib.request.urlopen(WORKER_URL, timeout=5) as resp:
            return resp.status == 200, f"HTTP {resp.status}"
    except urllib.error.HTTPError as exc:
        # 503 = worker vivo ma scollegato da LiveKit (o inference morto).
        detail = exc.read(120).decode("utf-8", errors="replace").strip()
        return False, f"HTTP {exc.code}: {detail}"
    except OSError as exc:
        # Connection refused/timeout = HTTP server giù o event loop bloccato.
        return False, str(exc)


def consecutive_failures(ok: bool) -> int:
    """Aggiorna il contatore persistente dei fallimenti consecutivi."""
    if ok:
        STATE_FILE.unlink(missing_ok=True)
        return 0
    try:
        count = int(STATE_FILE.read_text()) + 1
    except (OSError, ValueError):
        count = 1
    STATE_FILE.write_text(str(count))
    return count


def main() -> int:
    ok, detail = worker_is_healthy()
    failures = consecutive_failures(ok)
    if ok:
        return 0

    print(
        f"worker non sano ({failures}/{MAX_CONSECUTIVE_FAILURES}): {detail}",
        file=sys.stderr,
    )
    if failures >= MAX_CONSECUTIVE_FAILURES:
        # Azzera PRIMA del riavvio: il nuovo processo riparte con il periodo
        # di grazia pieno invece di essere ucciso subito al prossimo check.
        STATE_FILE.unlink(missing_ok=True)
        print("worker irrecuperabile: SIGTERM a PID 1 per riavvio pulito", file=sys.stderr)
        try:
            os.kill(1, signal.SIGTERM)
        except OSError as exc:
            print(f"invio SIGTERM fallito: {exc}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
