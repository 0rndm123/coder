@echo off
setlocal
cd /d "%~dp0"
where cloudflared >nul 2>&1
if errorlevel 1 (
  echo ERRO: cloudflared nao encontrado no PATH.
  echo Instale cloudflared: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
  pause
  exit /b 1
)
echo Cloudflare Tunnel para http://localhost:8200
echo Inicie primeiro a aplicacao com start.bat noutra janela.
if defined QR_TUNNEL_TOKEN (
  echo A iniciar tunel permanente com token recebido por variavel de ambiente...
  cloudflared tunnel run --token "%QR_TUNNEL_TOKEN%"
) else (
  echo A iniciar tunel temporario HTTPS para testes...
  cloudflared tunnel --url http://localhost:8200
)
if errorlevel 1 (
  echo O tunel terminou com erro.
  pause
)
endlocal
