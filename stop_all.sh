#!/bin/bash
# stop_all.sh — ferma tutti i processi del sistema Password Reset Agent.
#
# Termina in ordine inverso rispetto a run_all.sh:
#   1. Frontend React (Vite)
#   2. Voice Agent
#   3. Email Processor
#   4. Email Service
#   5. User Service
#
# Sicuro da eseguire anche se alcuni processi non sono in esecuzione.

echo "Arresto del sistema Password Reset Agent..."
echo ""

_kill() {
  local name="$1"
  local pattern="$2"
  local pids
  pids=$(pgrep -f "$pattern" 2>/dev/null)
  if [ -n "$pids" ]; then
    echo "  Fermando $name (PID: $pids)..."
    kill $pids 2>/dev/null
    sleep 1
    # SIGKILL se ancora in esecuzione dopo SIGTERM
    pids=$(pgrep -f "$pattern" 2>/dev/null)
    [ -n "$pids" ] && kill -9 $pids 2>/dev/null
    echo "  $name fermato."
  else
    echo "  $name non era in esecuzione."
  fi
}

_kill "Frontend React"      "vite --port 5175"
_kill "Voice Agent"         "voice_agent/agent.py"
_kill "Email Processor"     "email_processor/processor.py"
_kill "Knowledge Service"   "uvicorn main:app.*8003"
_kill "Email Service"       "uvicorn main:app.*8002"
_kill "User Service"        "uvicorn main:app.*8001"

# Pulizia residua: qualsiasi processo rimasto sulle porte dei servizi
for port in 8001 8002 8003 5175; do
  pid=$(lsof -ti tcp:$port 2>/dev/null)
  if [ -n "$pid" ]; then
    echo "  Processo residuo su porta $port (PID: $pid) — terminato."
    kill $pid 2>/dev/null
  fi
done

echo ""
echo "Sistema fermato. Per riavviare: ./run_all.sh"
