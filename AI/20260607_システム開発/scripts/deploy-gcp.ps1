# Deploy to Google Cloud Run
# Usage:
#   .\scripts\deploy-gcp.ps1
#   .\scripts\deploy-gcp.ps1 -ProjectId "your-gcp-project" -Region "asia-northeast1"

param(
  [string]$ProjectId = $env:GCP_PROJECT_ID,
  [string]$Region = "asia-northeast1",
  [string]$ServiceName = "shiro-research-app"
)

$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $PSScriptRoot
$Gcloud = Join-Path $Root ".tools\google-cloud-sdk\bin\gcloud.cmd"
$EnvFile = Join-Path $Root "app\.env"

$pythonCandidates = @(
  "$env:LOCALAPPDATA\Programs\Python\Python312-arm64\python.exe",
  "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe"
)
foreach ($py in $pythonCandidates) {
  if (Test-Path $py) {
    $env:CLOUDSDK_PYTHON = $py
    break
  }
}

if (-not (Test-Path $Gcloud)) {
  $systemGcloud = Get-Command gcloud -ErrorAction SilentlyContinue
  if ($systemGcloud) {
    $Gcloud = $systemGcloud.Source
  } else {
    Write-Host "gcloud CLI not found. Run setup first or install Google Cloud SDK." -ForegroundColor Red
    exit 1
  }
}

$account = & $Gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>$null
if (-not $account) {
  Write-Host "GCP login required. Run:" -ForegroundColor Yellow
  Write-Host "  & `"$Gcloud`" auth login" -ForegroundColor Gray
  exit 1
}

if (-not $ProjectId) {
  $ProjectId = & $Gcloud config get-value project 2>$null
}
if (-not $ProjectId) {
  Write-Host "GCP project is not set. Example:" -ForegroundColor Yellow
  Write-Host '  $env:GCP_PROJECT_ID="your-project-id"; .\scripts\deploy-gcp.ps1' -ForegroundColor Gray
  exit 1
}

Write-Host "==> Project: $ProjectId" -ForegroundColor Cyan
Write-Host "==> Region : $Region" -ForegroundColor Cyan
Write-Host "==> Service: $ServiceName" -ForegroundColor Cyan

& $Gcloud config set project $ProjectId *>&1 | Out-Null

Write-Host "==> Enabling required APIs..." -ForegroundColor Cyan
& $Gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com storage.googleapis.com --quiet *>&1 | Out-Null

# --- GCS 永続ストレージ（Cloud Run の再起動・デプロイ後もレポートを保持） ---
$BucketName = "$ProjectId-shiro-app-data"
Write-Host "==> GCS bucket: $BucketName" -ForegroundColor Cyan
& $Gcloud storage buckets describe "gs://$BucketName" --quiet *>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  & $Gcloud storage buckets create "gs://$BucketName" --location=$Region --uniform-bucket-level-access *>&1 | Out-Null
}

$ProjectNumber = & $Gcloud projects describe $ProjectId --format="value(projectNumber)" 2>$null
if ($ProjectNumber) {
  $RunSA = "$ProjectNumber-compute@developer.gserviceaccount.com"
  & $Gcloud storage buckets add-iam-policy-binding "gs://$BucketName" `
    --member="serviceAccount:$RunSA" `
    --role="roles/storage.objectAdmin" `
    --quiet *>&1 | Out-Null
}

$envVars = @(
  "LLM_PROVIDER=openai",
  "DATABASE_URL=file:./data/store.json",
  "GCS_BUCKET_NAME=$BucketName",
  "GCS_OBJECT_NAME=data/store.json"
)

if (Test-Path $EnvFile) {
  foreach ($line in Get-Content $EnvFile) {
    if ($line -match '^\s*#' -or $line -notmatch '^([^#=]+)=(.*)$') { continue }
    $key = $matches[1].Trim()
    $val = $matches[2].Trim().Trim('"')
    if ($key -in @("DATABASE_URL", "TECHNICAL_WORKSPACE_PATH", "TECHNICAL_OUTPUT_PATH")) { continue }
    if ([string]::IsNullOrWhiteSpace($val)) { continue }
    $escaped = $val -replace ',', '\,'
    $envVars += "$key=$escaped"
  }
}

$envFlag = $envVars -join ","

Write-Host "==> Deploying to Cloud Run (build in GCP)..." -ForegroundColor Green
Set-Location $Root

& $Gcloud run deploy $ServiceName `
  --source . `
  --region $Region `
  --platform managed `
  --quiet `
  --allow-unauthenticated `
  --memory 1Gi `
  --cpu 1 `
  --timeout 900 `
  --min-instances 0 `
  --max-instances 3 `
  --set-env-vars $envFlag

if ($LASTEXITCODE -ne 0) {
  Write-Host "Deploy failed." -ForegroundColor Red
  exit $LASTEXITCODE
}

$url = & $Gcloud run services describe $ServiceName --region $Region --format "value(status.url)"
Write-Host ""
Write-Host "Deployed successfully!" -ForegroundColor Green
Write-Host "URL: $url" -ForegroundColor Green
