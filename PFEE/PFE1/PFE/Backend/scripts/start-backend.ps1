$ErrorActionPreference = "Stop"

$backendRoot = Split-Path -Parent $PSScriptRoot
$port = 3000
$backendUrl = "http://127.0.0.1:$port/"

function Get-ListeningPid {
  param(
    [int]$LocalPort
  )

  $line = netstat -ano -p TCP |
    Select-String -Pattern "^\s*TCP\s+\S+:$LocalPort\s+\S+\s+LISTENING\s+(\d+)\s*$" |
    Select-Object -First 1

  if (-not $line) {
    return $null
  }

  if ($line.Matches.Count -eq 0) {
    return $null
  }

  return [int]$line.Matches[0].Groups[1].Value
}

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

$existingPid = Get-ListeningPid -LocalPort $port

if ($existingPid) {
  $existingProcess = Get-Process -Id $existingPid -ErrorAction SilentlyContinue
  $isKicklyBackend = Test-KicklyBackend -Url $backendUrl

  if ($isKicklyBackend -or ($existingProcess -and $existingProcess.ProcessName -eq "node")) {
    Write-Host "Arret du processus existant sur le port $port (PID $existingPid)..." -ForegroundColor Yellow
    Stop-Process -Id $existingPid -Force
    Start-Sleep -Seconds 1
  } else {
    throw "Le port $port est deja utilise par un autre processus (PID $existingPid)."
  }
}

Write-Host "Lancement du backend KICKLY..." -ForegroundColor Cyan
Push-Location $backendRoot
try {
  & node server.js
} finally {
  Pop-Location
}
