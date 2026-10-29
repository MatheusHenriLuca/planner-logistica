@echo off
chcp 65001 > nul
cls
echo ===============================================================================
echo        PLANNER LOGÍSTICA - ATUALIZAR IMAGENS E REINICIAR DOCKER
echo ===============================================================================
echo.
echo Este script recompila as imagens do Backend e Frontend com os arquivos
echo mais recentes da pasta e reinicia os containers sem perder dados do banco.
echo.

pushd "%~dp0"

echo [1/3] Verificando se o Docker está em execução...
docker info > nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [ERRO] O serviço do Docker não está respondendo!
    echo Certifique-se de que o Docker Desktop ou o serviço Docker está aberto nesta máquina.
    echo.
    popd
    pause
    exit /b 1
)
echo [OK] Docker detectado.
echo.

echo [2/3] Recompilando imagens (Backend e Frontend) com as novas alterações...
docker compose up -d --build

if %errorlevel% neq 0 (
    echo.
    echo ===============================================================================
    echo [ERRO] Falha ao recompilar os containers via Docker Compose!
    echo ===============================================================================
    echo Se o erro acima for "TLS handshake timeout" ou falha de conexao com docker.io:
    echo Significa que este servidor corporativo nao tem acesso direto a internet
    echo externa para baixar as imagens base (Python, Node, Nginx) do Docker Hub.
    echo.
    echo SOLUCAO OFICIAL PARA AMBIENTE CORPORATIVO / OFFLINE:
    echo  1. Na sua maquina de desenvolvimento (com internet), rode: exportar_imagens_docker.bat
    echo  2. Copie o arquivo 'planner_imagens.tar' gerado para a pasta deste servidor.
    echo  3. Aqui no servidor, execute: importar_imagens_docker.bat
    echo  4. Em seguida, execute: iniciar_servidor.bat
    echo.
    echo Caso este servidor DEVA ter internet:
    echo  - Configure o Proxy Corporativo no Docker Desktop (Settings -> Resources -> Proxies)
    echo ===============================================================================
    echo.
    popd
    pause
    exit /b 1
)

echo.
echo ===============================================================================
echo [SUCESSO] Containers atualizados e reiniciados com sucesso!
echo ===============================================================================
echo.
echo Endereços de acesso:
echo  - Interface Web (Porta 8080): http://localhost:8080
echo  - Interface Web (Porta 5173): http://localhost:5173
echo  - Documentação da API:        http://localhost:8000/docs
echo.
popd
echo Pressione qualquer tecla para finalizar.
pause > nul