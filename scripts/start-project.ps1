$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $projectRoot "PFEE\PFE1\PFE\Backend"
$frontendDir = Join-Path $projectRoot "PFEE\PFE1\PFE\Frontend"
$nodeNpm = "C:\Program Files\nodejs\npm.cmd"
$backendUrl = "http://127.0.0.1:3000/"

function Test-KicklyBackend {
  param(
    [string]$Url
  )

  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2
    if (-not $response.Content) {
      return $false
    }

    $payload = $response.Content | ConvertFrom-Json
    return $payload.status -eq "Server is running"
  } catch {
    return $false
  }
}

Write-Host "Verification du backend KICKLY..." -ForegroundColor Cyan

if (-not (Test-KicklyBackend -Url $backendUrl)) {
  Write-Host "Backend inactif. Demarrage..." -ForegroundColor Yellow
  Start-Process -FilePath $nodeNpm -ArgumentList "start" -WorkingDirectory $backendDir

  $backendReady = $false
  for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
    Start-Sleep -Seconds 1
    if (Test-KicklyBackend -Url $backendUrl) {
      $backendReady = $true
      break
    }
  }

  if (-not $backendReady) {
    throw "Le backend ne repond pas sur le port 3000 apres le demarrage."
  }
} else {
  Write-Host "Backend deja actif sur le port 3000." -ForegroundColor Green
}

Write-Host "Lancement du frontend..." -ForegroundColor Cyan
Push-Location $frontendDir
try {
  & $nodeNpm run start:no-open
} finally {
  Pop-Location
}
