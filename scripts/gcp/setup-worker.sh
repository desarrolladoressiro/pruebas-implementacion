#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/opt/siro-automation
SERVICE_NAME=siro-worker

sudo apt-get update
sudo apt-get install -y curl git ca-certificates

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

sudo useradd -m -s /bin/bash siro || true

if [ ! -d "$APP_DIR" ]; then
  sudo mkdir -p "$APP_DIR"
  sudo chown -R siro:siro "$APP_DIR"
fi

echo "Clonar repo manualmente en $APP_DIR o copiar archivos del proyecto."
echo "Luego ejecutar: npm ci && npm run typecheck"

echo "Copiar infra/gcp/siro-worker.service a /etc/systemd/system/$SERVICE_NAME.service"
echo "Crear archivo /opt/siro-automation/.env con variables del proyecto"
echo "Finalmente: sudo systemctl daemon-reload && sudo systemctl enable --now $SERVICE_NAME"
