#Requires -Version 5.1
<#
Levanta todo el proyecto AOWeb en local: Postgres (Docker), API, Server y Frontend.
Uso: desde la raiz del repo -> .\start-local.ps1
#>

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

function Test-Container($name) {
    $status = docker inspect -f '{{.State.Running}}' $name 2>$null
    return $status -eq 'true'
}

function Test-ContainerExists($name) {
    docker inspect $name *> $null
    return $LASTEXITCODE -eq 0
}

Write-Host "== 1. Postgres ==" -ForegroundColor Cyan
if (Test-Container "aoweb-postgres") {
    Write-Host "aoweb-postgres ya esta corriendo." -ForegroundColor Green
} elseif (Test-ContainerExists "aoweb-postgres") {
    Write-Host "Arrancando contenedor existente aoweb-postgres..." -ForegroundColor Yellow
    docker start aoweb-postgres | Out-Null
} else {
    Write-Host "Creando contenedor aoweb-postgres..." -ForegroundColor Yellow
    docker run --name aoweb-postgres `
        -e POSTGRES_DB=aoweb `
        -e POSTGRES_USER=postgres `
        -e POSTGRES_PASSWORD=postgres `
        -p 127.0.0.1:5432:5432 `
        -d postgres:18-alpine | Out-Null
    Start-Sleep -Seconds 3
    Write-Host "Restaurando dump inicial..." -ForegroundColor Yellow
    Get-Content "$root\database\aoweb.sql" | docker exec -i aoweb-postgres psql -U postgres -d aoweb | Out-Null
}

Write-Host "== 2. API ==" -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\api'; pnpm dev" -WindowStyle Normal

Write-Host "== 3. Server (juego) ==" -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\server'; pnpm dev" -WindowStyle Normal

Write-Host "== 4. Frontend ==" -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\frontend'; pnpm dev" -WindowStyle Normal

Write-Host ""
Write-Host "Listo. Se abrieron 3 ventanas nuevas (API, Server, Frontend)." -ForegroundColor Green
Write-Host "Frontend:  http://localhost:3000"
Write-Host "API:       http://localhost:3002"
Write-Host "WS Server: ws://localhost:7666"
