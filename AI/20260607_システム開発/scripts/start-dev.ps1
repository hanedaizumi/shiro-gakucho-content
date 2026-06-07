# BTC台本ジェネレーター 開発サーバー起動スクリプト
# 使い方: PowerShell で .\scripts\start-dev.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$NodeDir = Join-Path $Root ".tools\node"
$AppDir = Join-Path $Root "app"

if (-not (Test-Path (Join-Path $NodeDir "npm.cmd"))) {
    Write-Host "Node.js が見つかりません。先に portable Node をセットアップしてください。" -ForegroundColor Red
    exit 1
}

$env:Path = "$NodeDir;$env:Path"

Set-Location $AppDir

if (-not (Test-Path "node_modules")) {
    Write-Host "==> npm install を実行中..." -ForegroundColor Cyan
    npm install
}

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "==> .env を作成しました" -ForegroundColor Yellow
}

if (-not (Test-Path "prisma\dev.db")) {
    Write-Host "==> データベースを初期化中..." -ForegroundColor Cyan
    npx prisma db push
}

# ポート3000を占有している古い Node プロセスを停止
$portProc = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique
foreach ($procId in $portProc) {
  if ($procId -and $procId -ne 0) {
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
  }
}

Write-Host ""
Write-Host "==> 開発サーバーを起動します: http://localhost:3000" -ForegroundColor Green
Write-Host "    停止するには Ctrl+C" -ForegroundColor Gray
Write-Host ""

npm run dev
