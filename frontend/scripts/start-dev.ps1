param(
  [int]$FrontendPort = 5173,
  [int]$BackendPort = 9000
)

# Start dev frontend (Vite) and backend (Node) on LAN addresses
# Detect LAN IP
try {
  $lanIp = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.*' } | Select-Object -First 1 -ExpandProperty IPAddress) -as [string]
} catch {
  try { $lanIp = ([System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) | Where-Object { $_.AddressFamily -eq 'InterNetwork' } | Select-Object -First 1).IPAddressToString } catch { $lanIp = $null }
}
if (-not $lanIp) { Write-Host "Could not detect LAN IPv4 address. Falling back to localhost"; $lanIp = '127.0.0.1' }
Write-Host ("Detected LAN IPv4: {0}" -f $lanIp)

# Set env vars for front/back
$env:VITE_SOCKET_URL = ("http://{0}:{1}" -f $lanIp, $BackendPort)
$env:VITE_HOST = $lanIp
$env:VITE_DEV_SERVER_HOST = $lanIp

# Start backend in separate PowerShell job
$backendDir = (Resolve-Path "..\backend")
Write-Host ("Starting backend on 0.0.0.0:{0} with DEBUG_API=1" -f $BackendPort)
Push-Location $backendDir
$env:DEBUG_API = '1'
$env:PORT = $BackendPort
$env:BIND_ADDR = '0.0.0.0'
# Launch backend
Start-Process -FilePath node -ArgumentList 'index.js' -WorkingDirectory $backendDir -WindowStyle Hidden | Out-Null
Pop-Location

# Wait briefly for backend to start
Start-Sleep -Seconds 1

# Start Vite dev server on all hosts
$frontendDir = (Resolve-Path ".\..")
Write-Host ("Starting frontend Vite dev on http://{0}:{1}" -f $lanIp, $FrontendPort)
Push-Location $frontendDir
# Use npx to ensure local vite installed
Start-Process -FilePath npx -ArgumentList "vite --host 0.0.0.0 --port $FrontendPort" -WorkingDirectory $frontendDir -WindowStyle Normal
Pop-Location

Write-Host ("Frontend dev started on http://{0}:{1}" -f $lanIp, $FrontendPort)
Write-Host ("Backend started on http://{0}:{1} (debug API enabled)" -f $lanIp, $BackendPort)
Write-Host "Remember to open firewall for these ports if needed (requires admin): New-NetFirewallRule -DisplayName 'poker-frontend' -LocalPort $FrontendPort -Direction Inbound -Action Allow; New-NetFirewallRule -DisplayName 'poker-backend' -LocalPort $BackendPort -Direction Inbound -Action Allow" 
