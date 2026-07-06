#!/bin/bash
# run_all.sh — avvia tutti i processi del sistema Aria Agent.
#
# Ordine di avvio:
#   1. User Service      (porta 8001) — dipendenza di voice agent ed email processor
#   2. Email Service     (porta 8002) — dipendenza di email processor e frontend
#   3. Knowledge Service (porta 8003) — base di conoscenza per la Q&A dell'agente
#   4. Chat Service      (porta 8004) — canale chat testuale
#   5. Ticket Service    (porta 8005) — ticketing (mock ServiceNow)
#   6. Analytics Service (porta 8006) — analisi AI post-chiamata
#   7. Email Processor                — polling email, richiede 1 e 2 attivi
#   8. Voice Agent                    — si connette a LiveKit Cloud, richiede 1 e 3 attivi
#   9. Frontend          (porta 5175) — dashboard, avviato per ultimo
#
# Tutti i processi vengono terminati con Ctrl+C (trap su EXIT/INT/TERM).
#
# Prerequisiti:
#   - Ambiente Python attivo con le dipendenze installate (es. `conda activate aria-agent`)
#   - File .env compilato nella root del progetto

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVICES="$ROOT/services"

# Usa python/uvicorn dall'ambiente attivo (nessun path hardcoded). Override con PYTHON=...
PYTHON="${PYTHON:-python}"
if ! "$PYTHON" -c "import uvicorn" 2>/dev/null; then
  echo "Errore: 'uvicorn' non disponibile per '$PYTHON'. Attiva l'ambiente (es. conda activate aria-agent)"
  echo "e installa le dipendenze, oppure esporta PYTHON=/path/di/python."
  exit 1
fi

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

serve() {  # serve <dir> <porta>
  cd "$1" && "$PYTHON" -m uvicorn main:app --host 0.0.0.0 --port "$2" &
}

echo "=== Avvio User Service (8001) ===";      serve "$SERVICES/user_service" 8001
echo "=== Avvio Email Service (8002) ===";     serve "$SERVICES/email_service" 8002
echo "=== Avvio Knowledge Service (8003) ==="; serve "$SERVICES/knowledge_service" 8003
echo "=== Avvio Chat Service (8004) ===";      serve "$SERVICES/chat_service" 8004
echo "=== Avvio Ticket Service (8005) ===";    serve "$SERVICES/ticket_service" 8005
echo "=== Avvio Analytics Service (8006) ==="; serve "$SERVICES/analytics_service" 8006

# Breve attesa per dare tempo ai servizi HTTP di avviarsi prima che
# email processor e voice agent tentino la prima connessione
sleep 2

echo "=== Avvio Email Processor ==="
cd "$ROOT" && "$PYTHON" "$SERVICES/email_processor/processor.py" &

# `dev` avvia un worker locale che si registra su LiveKit Cloud e resta in ascolto
# di job in ingresso. Richiede LIVEKIT_URL/API_KEY/API_SECRET e GOOGLE_API_KEY nel .env.
echo "=== Avvio Voice Agent ==="
cd "$ROOT" && "$PYTHON" "$SERVICES/voice_agent/agent.py" dev &

echo "=== Avvio Frontend (5175) ==="
if [ ! -d "$ROOT/frontend/node_modules" ]; then
  echo "  Installazione dipendenze npm (prima esecuzione)..."
  cd "$ROOT/frontend" && npm install --silent
fi
cd "$ROOT/frontend" && npx vite --port 5175 &

echo ""
echo "Tutti i servizi avviati:"
echo "  User Service      → http://localhost:8001/docs"
echo "  Email Service     → http://localhost:8002/docs"
echo "  Knowledge Service → http://localhost:8003/docs"
echo "  Chat Service      → http://localhost:8004/docs"
echo "  Ticket Service    → http://localhost:8005/docs"
echo "  Analytics Service → http://localhost:8006/docs"
echo "  Frontend          → http://localhost:5175"
echo ""
echo "Premi Ctrl+C per fermare tutto."

wait
