@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo ========================================================
echo   Iniciando Frontend React + Vite (Porta 5173)
echo ========================================================
npm run dev -- --host 0.0.0.0
pause
