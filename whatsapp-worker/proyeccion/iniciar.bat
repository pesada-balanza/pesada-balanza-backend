@echo off
REM ============================================================
REM  Arranca el enviador del Flujo de Fondos y lo reinicia si
REM  se detiene. Para el Programador de tareas de Windows.
REM
REM  NO reemplaza al worker de balanza: son dos programas
REM  distintos y los dos tienen que estar corriendo.
REM ============================================================

cd /d "%~dp0"

:loop
echo.
echo [%date% %time%] Iniciando enviador del Flujo de Fondos...
node enviar.js

REM Codigo 9 = ya habia otro enviador corriendo. No tiene sentido
REM reintentar: se cierra esta ventana y listo.
if errorlevel 9 goto duplicado

echo.
echo [%date% %time%] Se detuvo. Reintentando en 10 segundos...
timeout /t 10 /nobreak >nul
goto loop

:duplicado
echo.
echo Esta ventana se cierra sola en 15 segundos.
timeout /t 15 /nobreak >nul
