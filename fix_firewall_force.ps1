$port = 3000
$ruleName = "ClassSend Server (Port 3000)"

Write-Host "Cleaning up old firewall rules..." -ForegroundColor Yellow
Remove-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
Remove-NetFirewallRule -DisplayName "ClassSend Server" -ErrorAction SilentlyContinue

Write-Host "Adding FRESH Allow Rule for Port $port..." -ForegroundColor Cyan
New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -LocalPort $port -Protocol TCP -Action Allow -Profile Any

Write-Host "SUCCESS. Firewall reset for ClassSend." -ForegroundColor Green
Write-Host "IMPORTANT: Please close and restart the ClassSend app now." -ForegroundColor Magenta
Read-Host "Press Enter to exit"
