#!/usr/bin/env bash
# WSL2 Ubuntu 開発環境セットアップ
# 実行: bash scripts/setup-ubuntu.sh

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="${PROJECT_ROOT}/app"

echo "==> プロジェクトルート: ${PROJECT_ROOT}"

echo "==> システムパッケージ更新"
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
sudo apt-get install -y \
  curl \
  git \
  build-essential \
  ca-certificates \
  gnupg \
  lsb-release \
  unzip

echo "==> Node.js 22 インストール"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v
npm -v

echo "==> Docker インストール"
if ! command -v docker >/dev/null 2>&1; then
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  sudo usermod -aG docker "$USER"
fi

echo "==> Google Cloud CLI インストール（任意・本番デプロイ用）"
if ! command -v gcloud >/dev/null 2>&1; then
  curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg
  echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | \
    sudo tee /etc/apt/sources.list.d/google-cloud-sdk.list >/dev/null
  sudo apt-get update
  sudo apt-get install -y google-cloud-cli
fi

echo "==> PostgreSQL 起動（Docker Compose）"
cd "${PROJECT_ROOT}"
if ! docker info >/dev/null 2>&1; then
  echo "Docker デーモン起動中..."
  sudo service docker start || true
fi
docker compose up -d

echo "==> Next.js プロジェクト作成"
if [ ! -d "${APP_DIR}" ]; then
  npx create-next-app@latest app \
    --typescript \
    --tailwind \
    --eslint \
    --app \
    --src-dir \
    --import-alias "@/*" \
    --use-npm \
    --yes
fi

echo "==> Prisma セットアップ"
cd "${APP_DIR}"
npm install prisma @prisma/client --save-dev
if [ ! -f prisma/schema.prisma ]; then
  npx prisma init
fi

cat > .env <<'EOF'
DATABASE_URL="postgresql://shiro:shiro_dev_password@localhost:5432/shiro_ai_dev?schema=public"
EOF

cat > .env.example <<'EOF'
DATABASE_URL="postgresql://shiro:shiro_dev_password@localhost:5432/shiro_ai_dev?schema=public"
EOF

# schema.prisma を PostgreSQL に設定
if grep -q 'provider = "sqlite"' prisma/schema.prisma 2>/dev/null; then
  sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma
fi

echo "==> 完了"
echo ""
echo "次のステップ:"
echo "  1. 新しい WSL ターミナルを開く（docker グループ反映のため）"
echo "  2. cd ${APP_DIR}"
echo "  3. npm run dev"
echo ""
echo "PostgreSQL: localhost:5432 / DB: shiro_ai_dev / user: shiro"
