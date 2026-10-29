@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo ========================================================
echo   Iniciando Backend FastAPI (Porta 8000)
echo ========================================================
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
pause
