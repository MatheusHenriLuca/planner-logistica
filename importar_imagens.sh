#!/usr/bin/env bash
set -e

echo "==============================================================================="
echo "        IMPORTAR IMAGENS DOCKER OFFLINE NO SERVIDOR"
echo "==============================================================================="
echo ""
if [ ! -f "planner_imagens.tar" ]; then
    echo "[ERRO] Arquivo planner_imagens.tar não encontrado nesta pasta!"
    exit 1
fi

echo "Carregando imagens no Docker..."
docker load -i planner_imagens.tar
echo ""
echo "[SUCESSO] Imagens carregadas com sucesso!"
echo "Agora execute: ./iniciar_servidor.sh"
echo ""
