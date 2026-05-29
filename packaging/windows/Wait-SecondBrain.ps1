param(
  [string] $Url = "http://127.0.0.1:3030/api/health",
  [int] $TimeoutSeconds = 120,
  [string] $LogPath = ""
)

$ErrorActionPreference = "SilentlyContinue"
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)

Write-Host "Waiting for Second Brain at $Url ..."
while ((Get-Date) -lt $deadline) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2
    if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
      Write-Host "Second Brain is ready."
      exit 0
    }
  } catch {
    Start-Sleep -Seconds 2
  }
}

Write-Host ""
Write-Host "[ERROR] Second Brain did not become ready within $TimeoutSeconds seconds."
if ($LogPath -and (Test-Path $LogPath)) {
  Write-Host "Recent server log:"
  Get-Content -Path $LogPath -Tail 80
}
exit 1
