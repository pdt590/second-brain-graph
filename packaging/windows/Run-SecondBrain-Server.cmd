@echo off
setlocal EnableExtensions

call "%~dp0Set-SecondBrain-Env.cmd"
if errorlevel 1 exit /b 1

if not exist "%SECOND_BRAIN_LOG_DIR%" mkdir "%SECOND_BRAIN_LOG_DIR%" 2>nul

echo.>> "%SECOND_BRAIN_LOG_DIR%\server.log"
echo [%date% %time%] Second Brain server runner starting.>> "%SECOND_BRAIN_LOG_DIR%\server.log"
echo Node: %NODE_EXE%>> "%SECOND_BRAIN_LOG_DIR%\server.log"
echo App:  %APP_DIR%\scripts\start-product.mjs>> "%SECOND_BRAIN_LOG_DIR%\server.log"

"%NODE_EXE%" "%APP_DIR%\scripts\start-product.mjs" >> "%SECOND_BRAIN_LOG_DIR%\server.log" 2>&1
set "EXIT_CODE=%ERRORLEVEL%"

echo [%date% %time%] Second Brain server exited with code %EXIT_CODE%.>> "%SECOND_BRAIN_LOG_DIR%\server.log"
exit /b %EXIT_CODE%
