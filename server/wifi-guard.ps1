# ClassSend WiFi Guard
# Installed by ClassSend Setup (Student mode) as a SYSTEM-level Scheduled Task.
# Starts at boot, runs indefinitely, and silently reverts any attempt to
# disable the network connection — airplane mode or adapter disable.
# Students cannot stop or modify this process (requires admin/SYSTEM rights).

while ($true) {
    try {
        # --- Revert airplane mode ---
        # SystemRadioState 1 = all radios off (airplane mode on)
        $radioPath = 'HKLM:\SYSTEM\CurrentControlSet\Control\RadioManagement\SystemRadioState'
        if ((Get-ItemPropertyValue -Path $radioPath -Name SystemRadioState -ErrorAction Stop) -eq 1) {
            Set-ItemProperty -Path $radioPath -Name SystemRadioState -Value 0
            # Restart the Radio Management service so the registry change takes effect
            Restart-Service -Name RmSvc -Force -ErrorAction SilentlyContinue
        }
    } catch {}

    try {
        # --- Re-enable any WiFi adapter disabled via Device Manager ---
        Get-NetAdapter -ErrorAction Stop |
            Where-Object { $_.Name -match 'wi-?fi|wireless' -and $_.Status -eq 'Disabled' } |
            ForEach-Object {
                Enable-NetAdapter -Name $_.Name -Confirm:$false -ErrorAction SilentlyContinue
            }
    } catch {}

    Start-Sleep -Seconds 5
}
