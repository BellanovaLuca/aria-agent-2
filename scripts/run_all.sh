#!/bin/bash
# run_all.sh — avvia l'intero stack Aria Agent con Docker Compose.
#
# Wrapper di `docker compose up`: costruisce (se serve) e avvia tutti i servizi
# in container — voce, chat, email, knowledge, ticket, analytics, email
# processor e dashboard. Il canale voce gira in container per una risoluzione
# DNS stabile verso LiveKit Cloud (in locale su WSL il DNS può fallire a
# intermittenza e far cadere la connessione del worker).
#
# Prerequisiti:
#   - Docker + Docker Compose installati e in esecuzione
#   - File .env compilato nella root del progetto (chiavi GOOGLE/LIVEKIT/INTERNAL)

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! docker compose version >/dev/null 2>&1; then
  echo "Errore: Docker Compose non disponibile. Installa Docker Desktop / il plugin compose."
  exit 1
fi

if [ ! -f "$ROOT/.env" ]; then
  echo "Errore: file .env non trovato. Copia .env.example in .env e compila le chiavi."
  exit 1
fi

echo "=== Avvio dello stack Aria Agent (Docker Compose) ==="
docker compose up -d --build

echo ""
echo "Stack avviato. Servizi:"
echo "  Dashboard         → http://localhost:5175"
echo "  User Service      → http://localhost:8001/docs"
echo "  Email Service     → http://localhost:8002/docs"
echo "  Knowledge Service → http://localhost:8003/docs"
echo "  Chat Service      → http://localhost:8004/docs"
echo "  Ticket Service    → http://localhost:8005/docs"
echo "  Analytics Service → http://localhost:8006/docs"
echo "  Voice Agent       → worker LiveKit (nessuna porta: si connette in uscita)"
echo ""
echo "Log in tempo reale:  docker compose logs -f"
echo "Per fermare tutto:   ./scripts/stop_all.sh   (oppure: docker compose down)"
