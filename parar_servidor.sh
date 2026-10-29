#!/usr/bin/env bash
set -e

echo "==============================================================================="
echo "                PLANNER LOGÍSTICA - PARADA DO SERVIDOR"
echo "==============================================================================="
echo ""
echo "Parando containers do Docker Compose..."
docker compose down
echo ""
echo "[OK] Servidor desligado com segurança. Dados preservados no volume postgres_data."
echo ""
