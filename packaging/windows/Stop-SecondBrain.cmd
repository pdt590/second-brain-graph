@echo off
setlocal

call "%~dp0Set-SecondBrain-Env.cmd"
if errorlevel 1 exit /b 1

echo Stopping Second Brain processes started from:
echo   %APP_DIR%
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$app = [IO.Path]::GetFullPath($env:APP_DIR).ToLowerInvariant(); " ^
  "$procs = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.ToLowerInvariant().Contains('start-product.mjs') -and $_.CommandLine.ToLowerInvariant().Contains($app) }; " ^
  "if (-not $procs) { Write-Host 'No matching Second Brain server process found.'; exit 0 }; " ^
  "$procs | ForEach-Object { Write-Host ('Stopping PID ' + $_.ProcessId); Stop-Process -Id $_.ProcessId -Force }"

echo.
pause
