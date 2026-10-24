@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "PORT=8200"
set "URL=http://127.0.0.1:%PORT%/"
set "CLOUDFLARED=%~dp0.tools\cloudflared.exe"

echo.
echo [1/4] A verificar Python...
where py >nul 2>&1
if not errorlevel 1 (
    py -3 -c "import sys" >nul 2>&1
    if not errorlevel 1 (
        set "PYTHON_CMD=py -3"
        goto :python_ready
    )
)
where python >nul 2>&1
if not errorlevel 1 (
    python -c "import sys" >nul 2>&1
    if not errorlevel 1 (
        set "PYTHON_CMD=python"
        goto :python_ready
    )
)
echo ERRO: Python 3 nao instalado ou indisponivel no PATH.
echo Instale Python 3 e volte a executar este ficheiro.
goto :fail

:python_ready
echo [2/4] A iniciar servidor local na porta %PORT%...
powershell -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing -Uri '%URL%' -TimeoutSec 2; if($r.Content -notmatch 'Leitor de c.digos|Registo de entradas e sa.das') { exit 2 }; exit 0 } catch {exit 1}" >nul 2>&1
if not errorlevel 1 (
    echo Servidor da aplicacao ja activo em %URL%
    goto :server_ready
)
powershell -NoProfile -Command "try { $c=New-Object Net.Sockets.TcpClient; $a=$c.BeginConnect('127.0.0.1',%PORT%,$null,$null); if($a.AsyncWaitHandle.WaitOne(800)) { $c.EndConnect($a); exit 1 }; exit 0 } catch {exit 0} finally {if($c){$c.Close()}}" >nul 2>&1
if errorlevel 1 (
    echo ERRO: porta %PORT% ocupada por outro processo. Nao sera iniciado um tunel para esse servico.
    goto :fail
)
start "QR Scanner - Servidor 8200" /min cmd /k "cd /d ""%~dp0"" && %PYTHON_CMD% -m http.server %PORT% --bind 127.0.0.1"
set "SERVER_OK="
for /l %%I in (1,1,15) do (
    if not defined SERVER_OK (
        powershell -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing -Uri '%URL%' -TimeoutSec 2; if($r.StatusCode -eq 200 -and $r.Content -match 'Leitor de c.digos|Registo de entradas e sa.das'){exit 0}; exit 1 } catch {exit 1}" >nul 2>&1
        if not errorlevel 1 set "SERVER_OK=1"
        if not defined SERVER_OK timeout /t 1 /nobreak >nul
    )
)
if not defined SERVER_OK (
    echo ERRO: servidor nao ficou disponivel em %URL%.
    goto :fail
)
:server_ready
echo Servidor local OK: %URL%
echo [3/4] A verificar cloudflared...
if defined QR_TUNNEL_TOKEN goto :resolve_cloudflared
:resolve_cloudflared
where cloudflared >nul 2>&1
if not errorlevel 1 (
    set "CLOUDFLARED=cloudflared"
    goto :cloudflared_ready
)
if exist "%CLOUDFLARED%" goto :cloudflared_ready
if not exist ".tools" mkdir ".tools"
echo A descarregar cloudflared do repositorio oficial Cloudflare...
powershell -NoProfile -Command "$ErrorActionPreference='Stop'; $u='https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'; Invoke-WebRequest -Uri $u -OutFile '%CLOUDFLARED%' -UseBasicParsing; if((Get-Item '%CLOUDFLARED%').Length -lt 1000000){throw 'Ficheiro incompleto'}" 
if errorlevel 1 (
    if exist "%CLOUDFLARED%" del /q "%CLOUDFLARED%"
    echo ERRO: nao foi possivel obter cloudflared. Verifique a ligacao a Internet.
    goto :fail
)
:cloudflared_ready
echo [4/4] A abrir tunel HTTPS Cloudflare...
echo.
echo App local: %URL%
echo Mantenha esta janela aberta enquanto usa o telemovel.
echo O endereco HTTPS aparece abaixo quando o tunel ficar activo.
echo.
if defined QR_TUNNEL_TOKEN (
    echo A usar tunel persistente preconfigurado pela variavel QR_TUNNEL_TOKEN.
    "%CLOUDFLARED%" tunnel run --token "%QR_TUNNEL_TOKEN%"
) else (
    echo A usar tunel temporario. O endereco muda em cada arranque.
    "%CLOUDFLARED%" tunnel --url %URL%
)
echo.
echo Tunel terminado. O servidor local podera continuar em execucao.
goto :end

:fail
echo.
echo Processo interrompido. Consulte o erro acima.
pause
:end
endlocal
