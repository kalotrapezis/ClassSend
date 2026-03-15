#!/bin/bash
# ClassSend WiFi Guard — Linux version
# Installed by ClassSend setup (student mode) as a root-level systemd system service.
# Starts at boot, runs indefinitely, and silently reverts any attempt to
# disable the network connection — rfkill/airplane mode or adapter disable.
# Students cannot stop or modify this service (requires root).

while true; do
    # --- Revert rfkill block (airplane mode equivalent) ---
    rfkill unblock wifi 2>/dev/null

    # --- Re-enable any WiFi adapter that has gone DOWN ---
    # Enumerate wireless interfaces (names starting with wl, or common patterns)
    while IFS= read -r line; do
        iface=$(echo "$line" | awk -F': ' '{print $2}' | tr -d ' @0123456789')
        [ -z "$iface" ] && continue
        if ! ip link show "$iface" 2>/dev/null | grep -q '\bUP\b'; then
            ip link set "$iface" up 2>/dev/null
            # Also tell NetworkManager to reconnect if available
            nmcli device connect "$iface" 2>/dev/null
        fi
    done < <(ip -o link show | grep -iE 'wl|wifi|wireless')

    sleep 5
done
