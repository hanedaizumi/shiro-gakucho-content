# WSL2 + Ubuntu 初回セットアップ（Windows側）
# 管理者 PowerShell または通常 PowerShell で実行
# ※ WSL インストール後は PC 再起動が必要

$ErrorActionPreference = "Stop"
$ProjectRoot = "C:\Users\takah\OneDrive\デスクトップ\シロ学長\AI\20260607_システム開発"

Write-Host "==> WSL 状態確認" -ForegroundColor Cyan
try {
    wsl --status
} catch {
    Write-Host "WSL がまだ有効化されていません。PC を再起動してから再実行してください。" -ForegroundColor Yellow
    exit 1
}

Write-Host "==> WSL2 をデフォルトに設定" -ForegroundColor Cyan
wsl --set-default-version 2

Write-Host "==> Ubuntu ディストリビューション確認" -ForegroundColor Cyan
$distros = wsl -l -q 2>$null
if ($distros -notmatch "Ubuntu") {
    Write-Host "Ubuntu をインストールします..."
    wsl --install -d Ubuntu-24.04 --no-launch
}

Write-Host ""
Write-Host "初回のみ: スタートメニューから 'Ubuntu 24.04' を起動し、" -ForegroundColor Yellow
Write-Host "ユーザー名とパスワードを設定してください。" -ForegroundColor Yellow
Write-Host ""
Read-Host "Ubuntu の初期設定が完了したら Enter を押してください"

Write-Host "==> Ubuntu 内でセットアップスクリプト実行" -ForegroundColor Cyan
$wslProjectRoot = "/mnt/c/Users/takah/OneDrive/デスクトップ/シロ学長/AI/20260607_システム開発"
wsl bash -lc "chmod +x '${wslProjectRoot}/scripts/setup-ubuntu.sh' && bash '${wslProjectRoot}/scripts/setup-ubuntu.sh'"

Write-Host ""
Write-Host "==> セットアップ完了" -ForegroundColor Green
Write-Host "開発開始: wsl -> cd app -> npm run dev" -ForegroundColor Green
