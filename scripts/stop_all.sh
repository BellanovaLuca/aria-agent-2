#!/bin/bash
# stop_all.sh — ferma l'intero stack Aria Agent avviato con run_all.sh.
#
# Wrapper di `docker compose down`: arresta e rimuove i container dello stack.
# I dati restano nei volumi Docker (utenti, knowledge base, ticket, analisi):
# al successivo run_all.sh li ritrovi. Per cancellare anche i dati: `docker
# compose down -v`.

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! docker compose version >/dev/null 2>&1; then
  echo "Errore: Docker Compose non disponibile."
  exit 1
fi

echo "=== Arresto dello stack Aria Agent (Docker Compose) ==="
docker compose down

echo ""
echo "Stack fermato. I dati restano nei volumi Docker."
echo "Per riavviare: ./scripts/run_all.sh"
