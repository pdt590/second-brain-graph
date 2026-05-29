@echo off

set "PRODUCT_HOME=%~dp0"
if "%PRODUCT_HOME:~-1%"=="\" set "PRODUCT_HOME=%PRODUCT_HOME:~0,-1%"

set "APP_DIR=%PRODUCT_HOME%\app"
set "RUNTIME_DIR=%PRODUCT_HOME%\runtime"
set "CONFIG_DIR=%PRODUCT_HOME%\config"
set "DATA_DIR=%PRODUCT_HOME%\data"
set "LOG_DIR=%PRODUCT_HOME%\logs"

set "NODE_EXE=%RUNTIME_DIR%\node\node.exe"
if not exist "%NODE_EXE%" if exist "%RUNTIME_DIR%\node\win-x64\node.exe" set "NODE_EXE=%RUNTIME_DIR%\node\win-x64\node.exe"
if not exist "%NODE_EXE%" if exist "%RUNTIME_DIR%\node\windows-x64\node.exe" set "NODE_EXE=%RUNTIME_DIR%\node\windows-x64\node.exe"
if not exist "%NODE_EXE%" for /d %%D in ("%RUNTIME_DIR%\node\node-v*") do if exist "%%~fD\node.exe" set "NODE_EXE=%%~fD\node.exe"

if not exist "%NODE_EXE%" (
  echo [ERROR] Bundled Node.js was not found.
  echo Expected one of:
  echo   %RUNTIME_DIR%\node\node.exe
  echo   %RUNTIME_DIR%\node\win-x64\node.exe
  echo   %RUNTIME_DIR%\node\windows-x64\node.exe
  echo   %RUNTIME_DIR%\node\node-v*\node.exe
  exit /b 1
)

if not exist "%APP_DIR%\scripts\start-product.mjs" (
  echo [ERROR] Product app files are missing:
  echo   %APP_DIR%\scripts\start-product.mjs
  exit /b 1
)

if "%SECOND_BRAIN_PORT%"=="" set "SECOND_BRAIN_PORT=3030"
if "%SECOND_BRAIN_HOST%"=="" set "SECOND_BRAIN_HOST=127.0.0.1"

set "SECOND_BRAIN_PRODUCT_MODE=1"
set "SECOND_BRAIN_EMBEDDED_HERMES=1"
set "SECOND_BRAIN_PRODUCT_HOME=%PRODUCT_HOME%"
set "SECOND_BRAIN_RUNTIME_DIR=%RUNTIME_DIR%"
set "SECOND_BRAIN_CONFIG_DIR=%CONFIG_DIR%"
set "SECOND_BRAIN_DATA_DIR=%DATA_DIR%"
set "SECOND_BRAIN_LOG_DIR=%LOG_DIR%"
set "SECOND_BRAIN_PRODUCT_ENV=%CONFIG_DIR%\product.env"
set "SECOND_BRAIN_WIKI_DIR=%RUNTIME_DIR%\llm-wiki"
set "SECOND_BRAIN_HERMES_HOME=%RUNTIME_DIR%\hermes"

exit /b 0
