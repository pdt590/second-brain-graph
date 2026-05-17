@echo off
setlocal
title Second Brain Graph Installer

echo.
echo ============================================
echo  Second Brain Graph - Windows / WSL Installer
echo ============================================
echo.

where wsl.exe >nul 2>nul
if errorlevel 1 (
  echo [ERROR] WSL is not available on this Windows machine.
  echo Please install WSL first, then run this installer again.
  pause
  exit /b 1
)

set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

for /f "usebackq delims=" %%i in (`wsl.exe wslpath -a "%SCRIPT_DIR%"`) do set "WSL_PROJECT_DIR=%%i"

if "%WSL_PROJECT_DIR%"=="" (
  echo [ERROR] Could not translate the project path into WSL.
  pause
  exit /b 1
)

echo Project folder:
echo   Windows: %SCRIPT_DIR%
echo   WSL:     %WSL_PROJECT_DIR%
echo.
echo This will install the app inside WSL at:
echo   ~/second-brain-graph-app
echo.

wsl.exe bash "%WSL_PROJECT_DIR%/scripts/install-wsl.sh" "%WSL_PROJECT_DIR%"
set "INSTALL_EXIT=%ERRORLEVEL%"

echo.
if not "%INSTALL_EXIT%"=="0" (
  echo [ERROR] Installation failed. See the messages above.
  pause
  exit /b %INSTALL_EXIT%
)

echo [OK] Installation finished.
echo The app should be available at http://localhost:3030
echo Login username: admin
echo Login password: 123456
echo.
pause
