#!/bin/bash
# ClassSend post-install script — Linux Mint / Debian-based
# Equivalent of the NSIS customInstall macro (installer.nsh).
# Runs as root after the .deb package files are placed on disk.
#
# What this does:
#   1. Asks teacher / student mode via debconf (or defaults to teacher)
#   2. Writes /etc/classsend/mode
#   3. Installs + enables the ClassSend autostart systemd user service
#   4. (Student only) Installs + enables the WiFi guard systemd system service

set -e

INSTALL_DIR="/opt/ClassSend"
CONF_DIR="/etc/classsend"
MODE_FILE="$CONF_DIR/mode"
WIFI_GUARD_SRC="$INSTALL_DIR/resources/wifi-guard.sh"
WIFI_GUARD_DEST="/opt/classsend-wifi-guard.sh"
SYSTEM_SERVICE_DIR="/etc/systemd/system"
WIFI_GUARD_SERVICE="classsend-wifi-guard.service"
AUTOSTART_SERVICE="classsend.service"

# ── 1. Determine install mode via debconf ─────────────────────────────────────
MODE="teacher"

if command -v debconf-get-selections >/dev/null 2>&1 || true; then
    # Try reading previously set debconf value
    DEBCONF_MODE=$(echo GET classsend/install-mode | debconf-communicate 2>/dev/null | awk '{print $2}')
    if [ "$DEBCONF_MODE" = "student" ]; then
        MODE="student"
    fi
fi

# If debconf gave nothing, fall back to interactive prompt (non-apt installs)
if [ "$MODE" = "teacher" ] && [ -t 0 ]; then
    echo ""
    echo "  ClassSend — Installation Type"
    echo "  ─────────────────────────────"
    echo "  Who will use ClassSend on this computer?"
    echo "    1) Teacher  — full control panel and classroom tools  [default]"
    echo "    2) Student  — messaging, file sharing and settings"
    echo ""
    read -r -p "  Enter 1 or 2: " CHOICE
    if [ "$CHOICE" = "2" ]; then
        MODE="student"
    fi
fi

# ── 2. Write mode file ────────────────────────────────────────────────────────
mkdir -p "$CONF_DIR"
echo "$MODE" > "$MODE_FILE"
chmod 644 "$MODE_FILE"
echo "[ClassSend] Install mode: $MODE"

# ── 3. Autostart systemd user service (runs as each logged-in user) ──────────
# Write the service template to the system-wide user-service template dir so
# any user gets autostart. Each user can then enable it themselves via loginctl.
USER_TEMPLATE_DIR="/etc/systemd/user"
mkdir -p "$USER_TEMPLATE_DIR"

cat > "$USER_TEMPLATE_DIR/$AUTOSTART_SERVICE" << EOF
[Unit]
Description=ClassSend Classroom App
After=graphical-session.target

[Service]
Type=simple
ExecStart=$INSTALL_DIR/classsend --hidden
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF

# Enable for all users via preset — individual users can also run:
#   systemctl --user enable classsend.service
systemctl --global enable "$AUTOSTART_SERVICE" 2>/dev/null || true
echo "[ClassSend] Autostart service installed."

# ── 4. Student-only: WiFi guard system service ───────────────────────────────
if [ "$MODE" = "student" ]; then
    # Copy the guard script to a root-owned, non-writable location
    if [ -f "$WIFI_GUARD_SRC" ]; then
        cp "$WIFI_GUARD_SRC" "$WIFI_GUARD_DEST"
    else
        # Fallback: regenerate the script in place
        cat > "$WIFI_GUARD_DEST" << 'GUARDEOF'
#!/bin/bash
while true; do
    rfkill unblock wifi 2>/dev/null
    while IFS= read -r line; do
        iface=$(echo "$line" | awk -F': ' '{print $2}' | tr -d ' @0123456789')
        [ -z "$iface" ] && continue
        if ! ip link show "$iface" 2>/dev/null | grep -q '\bUP\b'; then
            ip link set "$iface" up 2>/dev/null
            nmcli device connect "$iface" 2>/dev/null
        fi
    done < <(ip -o link show | grep -iE 'wl|wifi|wireless')
    sleep 5
done
GUARDEOF
    fi
    chmod 700 "$WIFI_GUARD_DEST"
    chown root:root "$WIFI_GUARD_DEST"

    # Install the systemd system service (runs as root at boot)
    cat > "$SYSTEM_SERVICE_DIR/$WIFI_GUARD_SERVICE" << EOF
[Unit]
Description=ClassSend WiFi Guard
After=network.target

[Service]
Type=simple
ExecStart=/bin/bash $WIFI_GUARD_DEST
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable "$WIFI_GUARD_SERVICE"
    systemctl start "$WIFI_GUARD_SERVICE" 2>/dev/null || true
    echo "[ClassSend] WiFi guard service installed and started (student mode)."
fi

echo "[ClassSend] Installation complete."
