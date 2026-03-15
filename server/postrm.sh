#!/bin/bash
# ClassSend post-remove script — Linux Mint / Debian-based
# Equivalent of the NSIS customUnInstall macro (installer.nsh).
# Runs as root when the .deb package is removed.

set -e

CONF_DIR="/etc/classsend"
MODE_FILE="$CONF_DIR/mode"
WIFI_GUARD_DEST="/opt/classsend-wifi-guard.sh"
SYSTEM_SERVICE_DIR="/etc/systemd/system"
WIFI_GUARD_SERVICE="classsend-wifi-guard.service"
AUTOSTART_SERVICE="classsend.service"

# Read the mode before we delete everything
MODE="teacher"
if [ -f "$MODE_FILE" ]; then
    MODE=$(cat "$MODE_FILE" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')
fi

# ── Disable and remove autostart user service ─────────────────────────────────
systemctl --global disable "$AUTOSTART_SERVICE" 2>/dev/null || true
rm -f "/etc/systemd/user/$AUTOSTART_SERVICE"

# ── Student: stop and remove WiFi guard system service ───────────────────────
if [ "$MODE" = "student" ]; then
    systemctl stop "$WIFI_GUARD_SERVICE" 2>/dev/null || true
    systemctl disable "$WIFI_GUARD_SERVICE" 2>/dev/null || true
    rm -f "$SYSTEM_SERVICE_DIR/$WIFI_GUARD_SERVICE"
    rm -f "$WIFI_GUARD_DEST"
    systemctl daemon-reload
    echo "[ClassSend] WiFi guard service removed."
fi

# ── Remove config directory ───────────────────────────────────────────────────
rm -rf "$CONF_DIR"

echo "[ClassSend] Uninstall complete."
