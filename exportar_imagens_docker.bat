@echo off
chcp 65001 > nul
cls
echo ===============================================================================
echo        EXPORTAR IMAGENS DOCKER DO PLANNER LOGÍSTICA
echo ===============================================================================
echo.

pushd "%~dp0"

echo [1/2] Verificando imagens necessárias no Docker local...
docker image inspect postgres:16-alpine > nul 2>&1
if %errorlevel% neq 0 (
    echo [AVISO] Baixando postgres:16-alpine...
    docker pull postgres:16-alpine
)

echo [AVISO] Recompilando imagens do Backend e Frontend com os arquivos mais recentes...
docker compose build backend frontend

echo.
echo [2/2] Exportando as 3 imagens para planner_imagens.tar...
echo Isso pode levar cerca de 1 a 2 minutos. Aguarde...
echo.

docker save -o "planner_imagens.tar" postgres:16-alpine plannerlogistica-backend:latest plannerlogistica-frontend:latest

if %errorlevel% equ 0 (
    echo.
    echo ===============================================================================
    echo [SUCESSO] Arquivo 'planner_imagens.tar' gerado com sucesso!
    echo ===============================================================================
    echo Agora você pode copiar este arquivo e a pasta do projeto para o servidor da empresa.
    echo.
) else (
    echo.
    echo [ERRO] Falha ao exportar as imagens. Verifique se o Docker Desktop está aberto.
)

popd
echo.
pause
