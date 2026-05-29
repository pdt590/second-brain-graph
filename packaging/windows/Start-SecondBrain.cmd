@echo off
setlocal EnableExtensions
title Second Brain

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
set "LAUNCHER_LOG=%SCRIPT_DIR%\launcher.log"

> "%LAUNCHER_LOG%" echo [%date% %time%] Second Brain launcher starting.
>> "%LAUNCHER_LOG%" echo Script dir: %SCRIPT_DIR%

call "%SCRIPT_DIR%\Set-SecondBrain-Env.cmd" >> "%LAUNCHER_LOG%" 2>&1
if errorlevel 1 goto fail

if not exist "%SECOND_BRAIN_LOG_DIR%" mkdir "%SECOND_BRAIN_LOG_DIR%" >> "%LAUNCHER_LOG%" 2>&1
if errorlevel 1 goto fail

>> "%LAUNCHER_LOG%" echo Product home: %SECOND_BRAIN_PRODUCT_HOME%
>> "%LAUNCHER_LOG%" echo Node: %NODE_EXE%
>> "%LAUNCHER_LOG%" echo App dir: %APP_DIR%
>> "%LAUNCHER_LOG%" echo Log dir: %SECOND_BRAIN_LOG_DIR%

echo.
echo Starting Second Brain...
echo Product home: %SECOND_BRAIN_PRODUCT_HOME%
echo App URL:      http://127.0.0.1:%SECOND_BRAIN_PORT%
echo Logs:         %SECOND_BRAIN_LOG_DIR%\server.log
echo Launcher log: %LAUNCHER_LOG%
echo.

start "Second Brain Server" /min "%SCRIPT_DIR%\Run-SecondBrain-Server.cmd"
if errorlevel 1 goto fail

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%\Wait-SecondBrain.ps1" -Url "http://127.0.0.1:%SECOND_BRAIN_PORT%/api/health" -TimeoutSeconds 120 -LogPath "%SECOND_BRAIN_LOG_DIR%\server.log" >> "%LAUNCHER_LOG%" 2>&1
if errorlevel 1 goto fail

start "" "http://127.0.0.1:%SECOND_BRAIN_PORT%"

echo Second Brain is running in the background.
echo Close the server window or run Stop-SecondBrain.cmd to stop it.
echo.
pause
exit /b 0

:fail
echo.
echo Second Brain did not start cleanly.
echo Launcher log: %LAUNCHER_LOG%
echo Server log:   %SECOND_BRAIN_LOG_DIR%\server.log
echo Hermes log:   %SECOND_BRAIN_LOG_DIR%\hermes.log
echo.
if exist "%LAUNCHER_LOG%" (
  echo Recent launcher log:
  type "%LAUNCHER_LOG%"
)
echo.
pause
exit /b 1
