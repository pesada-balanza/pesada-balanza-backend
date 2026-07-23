@echo off
REM ============================================================
REM  Arranca el worker de WhatsApp y lo reinicia si se detiene.
REM  Pensado para ejecutarse solo al iniciar sesion en Windows
REM  (ver README: "Para que arranque solo al prender la PC").
REM ============================================================

REM Ubicarse en la carpeta de este archivo (donde esta worker.js)
cd /d "%~dp0"

:loop
echo.
echo [%date% %time%] Iniciando worker de WhatsApp...
node worker.js
echo.
echo [%date% %time%] El worker se detuvo. Reintentando en 10 segundos...
timeout /t 10 /nobreak >nul
goto loop
