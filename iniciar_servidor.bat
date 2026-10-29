@echo off
chcp 65001 > nul
cls
echo ===============================================================================
echo                PLANNER LOGÍSTICA - INICIALIZADOR DO SERVIDOR
echo ===============================================================================
echo.

pushd "%~dp0"

echo [1/3] Verificando se o Docker está em execução...
docker info > nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [ERRO] O serviço do Docker não está respondendo!
    echo Por favor, certifique-se de que o Docker Desktop (ou serviço Docker) está iniciado.
    echo.
    popd
    pause
    exit /b 1
)
echo [OK] Docker detectado e operando normalmente.
echo.

echo [2/3] Iniciando os serviços (PostgreSQL, Backend FastAPI, Frontend Nginx)...
docker compose up -d

if %errorlevel% neq 0 (
    echo.
    echo [ERRO] Falha ao iniciar os containers via Docker Compose.
    echo Verifique os logs com: docker compose logs
    echo.
    popd
    pause
    exit /b 1
)

echo [OK] Todos os containers foram iniciados com sucesso!
echo.

echo [3/3] Endereços de acesso ao sistema na rede da empresa:
echo -------------------------------------------------------------------------------
echo  - Acesso Web (Navegadores / TVs):  http://localhost (porta 80)
echo  - Acesso Alternativo (Vite port):  http://localhost:5173
echo  - API Backend / Swagger Docs:     http://localhost:8000/docs
echo.
echo  * Para acessar de OUTROS COMPUTADORES ou TVs na mesma rede corporativa,
echo    substitua "localhost" pelo IP desta máquina (consulte abaixo):
echo.
ipconfig | findstr /i "IPv4"
echo -------------------------------------------------------------------------------
echo.
echo DICAS ÚTEIS:
echo  - Para ver os logs em tempo real:   docker compose logs -f
echo  - Para parar os servidores:         parar_servidor.bat
echo.
popd
echo Pressione qualquer tecla para fechar esta janela (o servidor continuará rodando).
pause > nul
