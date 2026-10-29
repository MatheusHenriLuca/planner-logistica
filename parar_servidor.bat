@echo off
chcp 65001 > nul
cls
echo ===============================================================================
echo                PLANNER LOGÍSTICA - PARADA DO SERVIDOR
echo ===============================================================================
echo.

pushd "%~dp0"

echo Parando e descarregando os containers do Docker Compose...
docker compose down

if %errorlevel% equ 0 (
    echo.
    echo [OK] Todos os serviços foram desligados com segurança.
    echo O banco de dados e os dados persistidos continuam preservados no volume.
) else (
    echo.
    echo [AVISO] Ocorreu uma inconsistência ao parar os containers.
)

popd
echo.
pause
