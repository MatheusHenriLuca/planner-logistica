@echo off
chcp 65001 > nul
cls
echo ===============================================================================
echo        PLANNER LOGÍSTICA - INICIALIZADOR LOCAL NATIVO (SEM DOCKER)
echo ===============================================================================
echo.
echo Este script inicia o Backend (FastAPI/Uvicorn) e o Frontend em janelas
echo dedicadas para execucao no localhost.
echo.

cd /d "%~dp0"

if not exist "%~dp0backend\planner_logistica.db" (
    echo [1/3] Banco local nao encontrado. Inicializando banco SQLite pre-populado...
    python "%~dp0scripts\init_sqlite.py"
) else (
    echo [1/3] Banco de dados local SQLite detectado: backend\planner_logistica.db
)
echo.

echo [2/3] Iniciando Backend FastAPI (Porta 8000)...
start "Planner Logistica - Backend API" "%~dp0backend\iniciar_backend.bat"

echo [3/3] Iniciando Frontend React (Porta 5173)...
start "Planner Logistica - Frontend Web" "%~dp0frontend\iniciar_frontend.bat"

echo.
echo ===============================================================================
echo [SUCESSO] Backend e Frontend foram iniciados em janelas dedicadas!
echo ===============================================================================
echo.
echo Enderecos de acesso:
echo  - Interface Web:         http://localhost:5173
echo  - Documentacao da API:   http://localhost:8000/docs
echo.
echo Abrindo o navegador...
timeout /t 3 /nobreak > nul
start http://localhost:5173

pause > nul
