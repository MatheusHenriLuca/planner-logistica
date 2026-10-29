#!/usr/bin/env bash
set -e

echo "==============================================================================="
echo "                PLANNER LOGÍSTICA - INICIALIZADOR DO SERVIDOR"
echo "==============================================================================="
echo ""

echo "[1/3] Verificando Docker..."
if ! command -v docker &> /dev/null; then
    echo "[ERRO] Docker não foi encontrado. Instale o Docker antes de continuar."
    exit 1
fi

echo "[2/3] Subindo serviços com Docker Compose..."
docker compose up -d

echo ""
echo "[3/3] Serviços ativos com sucesso!"
echo "-------------------------------------------------------------------------------"
echo " - Acesso Web (Navegadores / TVs):  http://localhost (porta 80)"
echo " - Acesso Alternativo:             http://localhost:5173"
echo " - API Backend / Swagger:          http://localhost:8000/docs"
echo ""
echo " * Para acessar pela intranet da empresa, utilize o IP desta máquina:"
hostname -I 2>/dev/null || ip addr show | grep -E 'inet ' | awk '{print $2}'
echo "-------------------------------------------------------------------------------"
echo ""
echo "Dicas:"
echo " - Para acompanhar logs em tempo real: docker compose logs -f"
echo " - Para parar o servidor:              ./parar_servidor.sh"
echo ""
