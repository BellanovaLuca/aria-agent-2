#!/bin/bash
# run_all.sh — avvia tutti i processi del sistema Password Reset Agent.
#
# Ordine di avvio:
#   1. User Service   (porta 8001) — dipendenza di voice agent ed email processor
#   2. Email Service  (porta 8002) — dipendenza di email processor e frontend
#   3. Email Processor             — polling email, richiede 1 e 2 attivi
#   4. Voice Agent                 — si connette a LiveKit Cloud, richiede 1 attivo
#   5. Frontend React (porta 5173)     — legge da 1 e 2, avviato per ultimo
#
# Tutti i processi vengono terminati con Ctrl+C (trap su EXIT/INT/TERM).
#
# Prerequisiti:
#   - File .env compilato nella root del progetto
#   - Dipendenze Python installate (pip install -r */requirements.txt)
#   - LiveKit CLI installato (solo per il setup SIP, non necessario qui)

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

# Usa i binari del conda environment dove sono installate le dipendenze del progetto
CONDA_ENV="/home/lbellanova/miniconda3/envs/password-reset-agent/bin"
PYTHON="$CONDA_ENV/python"
UVICORN="$CONDA_ENV/uvicorn"

if [ ! -f "$ROOT/.env" ]; then
  echo "Errore: file .env non trovato. Copia .env.example in .env e compila le chiavi."
  exit 1
fi

# set -a esporta automaticamente ogni variabile assegnata, così i processi figli
# (uvicorn, python, vite) le ereditano senza bisogno di load_dotenv
set -a
source "$ROOT/.env"
set +a

# Ferma tutti i processi figli all'uscita (Ctrl+C, kill, errore)
cleanup() {
  echo ""
  echo "Arresto di tutti i processi..."
  kill $(jobs -p) 2>/dev/null || true
  wait 2>/dev/null
  echo "Tutto fermato."
}
trap cleanup EXIT INT TERM

# ── 1. User Service ───────────────────────────────────────────────────────────
echo "=== Avvio User Service (porta 8001) ==="
cd "$ROOT/user_service" && "$UVICORN" main:app --host 0.0.0.0 --port 8001 &

# ── 2. Email Service ──────────────────────────────────────────────────────────
echo "=== Avvio Email Service (porta 8002) ==="
cd "$ROOT/email_service" && "$UVICORN" main:app --host 0.0.0.0 --port 8002 &

# Breve attesa per dare tempo ai servizi HTTP di avviarsi prima che
# email processor e voice agent tentino la prima connessione
sleep 2

# ── 3. Email Processor ────────────────────────────────────────────────────────
echo "=== Avvio Email Processor ==="
cd "$ROOT" && "$PYTHON" email_processor/processor.py &

# ── 4. Voice Agent ────────────────────────────────────────────────────────────
# `dev` avvia un worker locale che si registra su LiveKit Cloud e resta
# in ascolto di job in ingresso. Richiede LIVEKIT_URL, LIVEKIT_API_KEY,
# LIVEKIT_API_SECRET e GOOGLE_API_KEY nel .env.
echo "=== Avvio Voice Agent ==="
cd "$ROOT" && "$PYTHON" voice_agent/agent.py dev &

# ── 5. Frontend React (Vite) ──────────────────────────────────────────────────
echo "=== Avvio Frontend React (porta 5175) ==="
if [ ! -d "$ROOT/frontend-react/node_modules" ]; then
  echo "  Installazione dipendenze npm (prima esecuzione)..."
  cd "$ROOT/frontend-react" && npm install --silent
fi
cd "$ROOT/frontend-react" && npx vite --port 5175 &

echo ""
echo "Tutti i servizi avviati:"
echo "  User Service    → http://localhost:8001/docs"
echo "  Email Service   → http://localhost:8002/docs"
echo "  Frontend React  → http://localhost:5175"
echo ""
echo "Premi Ctrl+C per fermare tutto."

wait
