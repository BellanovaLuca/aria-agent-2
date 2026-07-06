#!/bin/bash
# Riavvia i servizi Python HTTP (user_service + email_service) senza toccare il frontend.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVICES="$ROOT/services"
PYTHON="${PYTHON:-python}"

set -a; source "$ROOT/.env"; set +a

fuser -k 8001/tcp 2>/dev/null || true
fuser -k 8002/tcp 2>/dev/null || true
sleep 1

echo "Avvio User Service (8001)..."
cd "$SERVICES/user_service" && "$PYTHON" -m uvicorn main:app --host 0.0.0.0 --port 8001 &

echo "Avvio Email Service (8002)..."
cd "$SERVICES/email_service" && "$PYTHON" -m uvicorn main:app --host 0.0.0.0 --port 8002 &

sleep 2
echo "Servizi avviati. Ctrl+C per fermare."
wait
