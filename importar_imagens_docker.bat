@echo off
chcp 65001 > nul
cls
echo ===============================================================================
echo        IMPORTAR IMAGENS DOCKER OFFLINE NO SERVIDOR
echo ===============================================================================
echo.

pushd "%~dp0"

if not exist "planner_imagens.tar" (
    echo [ERRO] O arquivo "planner_imagens.tar" não foi encontrado nesta pasta!
    echo Diretório atual: %CD%
    echo Certifique-se de que exportou as imagens na máquina de origem e copiou o arquivo para cá.
    echo.
    popd
    pause
    exit /b 1
)

echo [1/2] Verificando se o serviço do Docker está em execução...
docker info > nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [ERRO] O serviço do Docker não está rodando nesta máquina!
    echo Certifique-se de que o Docker Desktop (ou serviço Docker) está instalado e iniciado.
    echo.
    popd
    pause
    exit /b 1
)
echo [OK] Docker detectado.
echo.

echo [2/2] Importando imagens do arquivo planner_imagens.tar...
echo Isso pode levar de 30 a 60 segundos. Aguarde...
echo.

docker load -i "planner_imagens.tar"

if %errorlevel% equ 0 (
    echo.
    echo ===============================================================================
    echo [SUCESSO] Todas as imagens foram carregadas no Docker deste servidor!
    echo ===============================================================================
    echo Agora você já pode iniciar o sistema executando:
    echo   iniciar_servidor.bat
    echo.
) else (
    echo.
    echo [ERRO] Falha ao carregar as imagens no Docker.
)

popd
echo.
pause
