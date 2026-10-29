#!/usr/bin/env bash
set -e

echo "==============================================================================="
echo "        EXPORTAR IMAGENS DOCKER PARA INSTALAÇÃO OFFLINE NO SERVIDOR"
echo "==============================================================================="
echo "Recompilando imagens com arquivos mais recentes..."
docker compose build backend frontend
echo "Exportando imagens: postgres:16-alpine, plannerlogistica-backend:latest, plannerlogistica-frontend:latest"
docker save -o planner_imagens.tar postgres:16-alpine plannerlogistica-backend:latest plannerlogistica-frontend:latest
echo ""
echo "[SUCESSO] Imagens exportadas com sucesso para planner_imagens.tar!"
echo ""
