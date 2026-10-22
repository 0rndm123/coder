@echo off
setlocal
cd /d "%~dp0"
set "PORT=8200"
echo Leitor de codigos: http://localhost:%PORT%/
where py >nul 2>&1
if %errorlevel%==0 (
    py -3 -m http.server %PORT% --bind 0.0.0.0
) else (
    python -m http.server %PORT% --bind 0.0.0.0
)
if errorlevel 1 (
    echo Erro ao iniciar o servidor. Verifique se Python esta instalado e se a porta %PORT% esta livre.
    pause
)
endlocal
