# BTC script generator dev server
# Usage: .\scripts\start-dev.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$NodeDir = Join-Path $Root ".tools\node"
$AppDir = Join-Path $Root "app"

if (-not (Test-Path (Join-Path $NodeDir "npm.cmd"))) {
    Write-Host "Node.js not found. Set up portable Node in .tools/node first." -ForegroundColor Red
    exit 1
}

$env:Path = "$NodeDir;$env:Path"
Set-Location $AppDir

if (-not (Test-Path "node_modules")) {
    Write-Host "==> Running npm install..." -ForegroundColor Cyan
    npm install
}

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "==> Created .env" -ForegroundColor Yellow
}

# Stop stale dev servers on ports 3000-3005
foreach ($port in 3000..3005) {
    $owners = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($procId in $owners) {
        if ($procId -and $procId -ne 0) {
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        }
    }
}

# Auto-heal corrupted .next cache
$pageJs = Join-Path $AppDir ".next\server\app\page.js"
if ((Test-Path (Join-Path $AppDir ".next")) -and -not (Test-Path $pageJs)) {
    Write-Host "==> Removing corrupted .next cache..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force (Join-Path $AppDir ".next")
}

Write-Host ""
Write-Host "==> Starting dev server: http://localhost:3000" -ForegroundColor Green
Write-Host "    Press Ctrl+C to stop" -ForegroundColor Gray
Write-Host ""

npm run dev
