param (
  [int]$Port = 8086,
  [string]$BindAddr = '0.0.0.0',
  [string]$AdminCode = 'admin123',
  [switch]$AllowFirewall,
  [switch]$DebugMode,
  [int]$DealDelayMs = 0
)

# Set env vars for Node
$env:PORT = $Port
$env:BIND_ADDR = $BindAddr
$env:ADMIN_CODE = $AdminCode
if ($DebugMode) { $env:DEBUG_API = '1'; Write-Host "Debug API enabled (DEBUG_API=1)" }
if ($DealDelayMs -gt 0) { $env:DEAL_DELAY_MS = $DealDelayMs; Write-Host "Deal delay set: ${DealDelayMs}ms" }
# (DEAL_DELAY_MS is used for dealing delay; legacy variable removed)

Write-Host ("Starting server on {0}:{1} (ADMIN_CODE={2})" -f $BindAddr, $Port, $AdminCode)

if ($AllowFirewall) {
  Write-Host "Allowing inbound TCP $Port in Windows Firewall (profile: Any)"
  try {
    New-NetFirewallRule -DisplayName "AllowPoker$Port" -Direction Inbound -LocalPort $Port -Protocol TCP -Action Allow -Profile Any -ErrorAction Stop | Out-Null
  } catch {
    Write-Host "Firewall rule may already exist or failed: $_"
  }
}

# Launch node in the backend directory
Push-Location -Path $PSScriptRoot
try {
  node .\index.js
} finally {
  Pop-Location
}
