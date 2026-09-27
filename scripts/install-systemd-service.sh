#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
SYSTEMD_USER_DIR="$HOME/.config/systemd/user"
SERVICE_NAME="codex-desktop-nexus.service"
SERVICE_PATH="$SYSTEMD_USER_DIR/$SERVICE_NAME"
NODE_BIN="$(command -v node || echo "/usr/bin/node")"

ACTION="${1:-install}"

mkdir -p "$SYSTEMD_USER_DIR"

if [[ "$ACTION" == "uninstall" || "$ACTION" == "remove" ]]; then
  systemctl --user stop "$SERVICE_NAME" 2>/dev/null || true
  systemctl --user disable "$SERVICE_NAME" 2>/dev/null || true
  rm -f "$SERVICE_PATH"
  systemctl --user daemon-reload
  printf '✓ Codex Desktop Nexus background service removed.\n'
  exit 0
fi

cat << SERVICE > "$SERVICE_PATH"
[Unit]
Description=Codex Desktop Nexus — Standalone Model Manager & Dashboard
After=network.target

[Service]
Type=simple
WorkingDirectory=$ROOT_DIR
ExecStart=$NODE_BIN $ROOT_DIR/scripts/serve-dashboard.js --port 4321
Restart=on-failure
RestartSec=3
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
SERVICE

systemctl --user daemon-reload
systemctl --user enable "$SERVICE_NAME"
systemctl --user restart "$SERVICE_NAME"

printf '✓ Codex Desktop Nexus background service installed and started.\n'
printf '  Dashboard URL: http://127.0.0.1:4321\n'
printf '  Service status: systemctl --user status %s\n' "$SERVICE_NAME"
