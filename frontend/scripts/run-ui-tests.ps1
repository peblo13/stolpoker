param(
  [int]$Port = 0,
  [string]$BindAddr = '127.0.0.1',
  [switch]$ForceNodeMismatch,
  [switch]$Headed,
  [switch]$AutoOpenFirewall
)

# Helper: find a free TCP port by trying to bind on a random port
function Get-FreeTcpPort {
  param(
    [int]$start = 9000,
    [int]$end = 9999
  )
  for ($i = $start; $i -le $end; $i++) {
    try {
      $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $i)
      $listener.Start()
      $listener.Stop()
      return $i
    } catch {
      # in use, continue
      continue
    }
  }
  throw "No free TCP port found in range $start-$end"
}

# Pick free port(s) if Port == 0
if ($Port -eq 0) {
  $Port = Get-FreeTcpPort -start 9000 -end 9999
  Write-Host "Picked free backend port: $Port"

  # Validate Node version: project expects Node 18.x per package.json engines
  try {
    $nodeVer = (& node -v) -replace 'v',''
    $nodeMajor = [int]($nodeVer.Split('.')[0])
    Write-Host "Detected Node version: $nodeVer"
    if (($nodeMajor -ne 18) -and (-not $ForceNodeMismatch)) {
      Write-Host "ERROR: Node major version mismatch: expected 18.x but found $nodeVer" -ForegroundColor Red
      Write-Host "Please switch to Node 18 (nvm/Volta recommended) or re-run script with -ForceNodeMismatch to bypass this check." -ForegroundColor Yellow
      Write-Host "nvm-windows example (install nvm-windows, then):" -ForegroundColor Yellow
      Write-Host "  nvm install 18.20.1`n  nvm use 18.20.1" -ForegroundColor Yellow
      Write-Host "Volta example (Windows/UNIX):" -ForegroundColor Yellow
      Write-Host "  volta install node@18`n  volta pin node@18" -ForegroundColor Yellow
      Exit 1
    }
  } catch {
    Write-Host "Could not detect Node version. Please ensure Node >= 18 is installed and available in PATH." -ForegroundColor Yellow
    if (-not $ForceNodeMismatch) { Exit 1 }
  }
}

# Detect LAN IP so we can provide an accessible link for iPhone in the same network
try {
  $lanIp = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.*' } | Select-Object -First 1 -ExpandProperty IPAddress) -as [string]
} catch {
  try { $lanIp = ([System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) | Where-Object { $_.AddressFamily -eq 'InterNetwork' -and $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.*' } | Select-Object -First 1).IPAddressToString } catch { $lanIp = $null }
}
if ($lanIp) { Write-Host "Detected LAN IPv4: $lanIp" }

# Build frontend in test mode, start backend in debug mode, run Playwright tests
$repoRoot = (Resolve-Path "$PSScriptRoot\..\..\")
Set-Location -Path $repoRoot
Write-Host "Installing repo dependencies (root npm ci)"
function Retry-Command([scriptblock]$cmd, [int]$retries = 3, [int]$backoffSec = 2) {
  for ($i=1; $i -le $retries; $i++) {
    try {
      & $cmd
      return $true
    } catch {
      Write-Host "Command failed (attempt $i/$retries): $_" -ForegroundColor Yellow
      if ($i -lt $retries) { Start-Sleep -Seconds ($backoffSec * $i) }
    }
  }
  return $false
}

# Helper: ensure npm ci runs successfully, cleaning up node_modules on EBUSY / lock errors
function Ensure-NodeDeps([string]$path) {
  $cwd = Get-Location
  try {
    Set-Location -Path $path
    $ok = Retry-Command { npm ci } 3 3
    if (-not $ok) {
      Write-Host "npm ci failed; attempting to remove node_modules and retry" -ForegroundColor Yellow
      try { Remove-Item -Recurse -Force -Path "$path\node_modules" -ErrorAction SilentlyContinue } catch {}
      try { Remove-Item -Force -Path "$path\package-lock.json" -ErrorAction SilentlyContinue } catch {}
      $ok2 = Retry-Command { npm ci } 3 3
      if (-not $ok2) { Write-Host "npm ci still failed; falling back to npm install" -ForegroundColor Yellow; Retry-Command { npm install } 3 3 }
    }
  } finally {
    Set-Location -Path $cwd
  }
}

# Avoid engine strict failures under newer Node versions (developer may still need Node 18 for production parity)
npm config set ignore-engines true
Retry-Command { npm ci } 3 3
# Ensure backend and frontend dependencies are installed (workspaces may have separate package.json)
Set-Location -Path "$PSScriptRoot\..\..\backend"
Write-Host "Installing backend dependencies (npm ci or npm install in backend)"
if (Test-Path -Path "$PSScriptRoot\..\..\backend\package-lock.json") { Retry-Command { npm ci } 3 3 } else { Retry-Command { npm install } 3 3 }
if (!(Test-Path -Path "$PSScriptRoot\..\..\backend\node_modules\express")) { Write-Host "Backend dependencies may not have installed (express missing). Will attempt npm install and continue"; Retry-Command { npm install } 3 3 }
Set-Location -Path "$PSScriptRoot\..\..\frontend"
Write-Host "Installing frontend dependencies (npm ci in frontend)"
Retry-Command { npm ci } 3 3
Write-Host "Building frontend with VITE_TEST_MODE=1"
$env:VITE_TEST_MODE = '1'
Set-Location -Path "$PSScriptRoot\.."
# Ensure TypeScript is installed locally; use npx for tsc and retry if not available
try { npx tsc --noEmit } catch { Write-Host "Local typescript not found, attempting npm ci/npm install then retry"; Retry-Command { npm ci } 3 3; try { npx tsc --noEmit } catch { Write-Host "TypeScript not available, proceeding with npm run build which uses local tsc if present" } }
Retry-Command { npm run build } 3 3

# Start backend in debug mode
Write-Host "Starting backend (programmatic Node start-test-server, DEBUG_API=1)"
# Stop any existing backend node process that seems to be running our backend (index.js or start-test-server.js)
try {
  $procList = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*backend\\index.js*' -or $_.CommandLine -like '*start-test-server.js*' }
  foreach ($p in $procList) {
    Write-Host ("Stopping existing backend process: {0} Cmd: {1}" -f $p.ProcessId, $p.CommandLine)
    Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
  }
} catch {}
# Ensure backend npm dependencies are installed in backend directory
Set-Location -Path "$PSScriptRoot\..\..\backend"
Write-Host "Installing backend dependencies (npm ci in backend; will fallback to npm install)"
if (Test-Path -Path "$PSScriptRoot\..\..\backend\package-lock.json") { npm ci } else { npm install }
if (!(Test-Path -Path "$PSScriptRoot\..\..\backend\node_modules\express")) {
  Write-Host "Backend dependencies may not have installed (express missing). Will attempt npm install and continue";
  npm install
}
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
# If BindAddr is left as 127.0.0.1 and we have a LAN IP, bind server to 0.0.0.0 to expose LAN
if ($BindAddr -eq '127.0.0.1' -and $lanIp) { $BindAddrToUse = '0.0.0.0' } else { $BindAddrToUse = $BindAddr }
$env:ADMIN_CODE = 'testadmin'
$env:DEBUG_API = '1'
$env:DEAL_DELAY_MS = '100'
$env:PORT = "$Port"
$env:BIND_ADDR = "$BindAddrToUse"
Write-Host "Launching backend start-test-server.js (node) in backend working directory"
$stdOutLog = "$PSScriptRoot\..\..\backend\server_stdout.log"
$stdErrLog = "$PSScriptRoot\..\..\backend\server_stderr.log"
$startProc = Start-Process -FilePath node -ArgumentList @(
  "$PSScriptRoot\..\..\backend\start-test-server.js",
  "$Port",
  "$BindAddrToUse",
  "100"
) -WorkingDirectory "$PSScriptRoot\..\..\backend" -NoNewWindow -PassThru -RedirectStandardOutput $stdOutLog -RedirectStandardError $stdErrLog
Start-Sleep -Seconds 2

# Wait for server readiness (health endpoint)
$ready = $false
for ($i=0; $i -lt 20; $i++) {
  try {
    # use localhost/127.0.0.1 for health check because the server is bound to 0.0.0.0 which is accessible locally via localhost
    $r = Invoke-WebRequest -Uri ("http://127.0.0.1:{0}/health" -f $Port) -UseBasicParsing -TimeoutSec 2
    if ($r.StatusCode -eq 200) { $ready = $true; break }
  } catch { Start-Sleep -Seconds 1 }
}
if (-not $ready) {
  Write-Host "Failed to start server: Did not respond on health endpoint" -ForegroundColor Red
  # Print last 200 lines of stdErr/stdOut logs to aid in diagnosis
  try {
    if (Test-Path -Path $stdErrLog) { Write-Host "---- Last lines of server stderr:"; Get-Content -Path $stdErrLog -Tail 200 }
    if (Test-Path -Path $stdOutLog) { Write-Host "---- Last lines of server stdout:"; Get-Content -Path $stdOutLog -Tail 200 }
  } catch { Write-Host "Could not read backend logs: $_" }
} else {
  Write-Host "Server reported healthy; verifying HTTP base URL is reachable"
}

# Wait for base URL to be reachable (serve index)
$baseUrl = ("http://127.0.0.1:{0}" -f $Port)
for ($i=0; $i -lt 20; $i++) {
  try {
    $rb = Invoke-WebRequest -Uri $baseUrl -UseBasicParsing -TimeoutSec 2 -Method Head
    if ($rb.StatusCode -eq 200) { Write-Host "Base URL reachable"; break }
  } catch { Start-Sleep -Seconds 1 }
}

# Run Playwright tests (single invocation; ensure PW_URL is set before running)
Write-Host "Running Playwright tests (tracing enabled)"
if ($BindAddrToUse -eq '0.0.0.0' -and $lanIp) { $displayHost = $lanIp } else { $displayHost = $BindAddrToUse }
$env:PW_URL = ("http://{0}:{1}" -f $displayHost, $Port)
Set-Location -Path "$PSScriptRoot\.."
Write-Host "Ensuring Playwright browsers and dependencies are installed"
Retry-Command { npx playwright install --with-deps } 3 5
Retry-Command { npx playwright install-deps } 2 5
Write-Host "Playwright base URL: $env:PW_URL"
 # print local accessible IPs
 $localIPs = [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) | Where-Object { $_.AddressFamily -eq 'InterNetwork' } | ForEach-Object { $_.ToString() }
 foreach ($ip in $localIPs) { Write-Host ("Accessible via: http://{0}:{1}" -f $ip, $Port) }
Write-Host ("LAN Link (open on iPhone): http://{0}:{1}" -f $displayHost, $Port)
if ($AutoOpenFirewall) {
  try {
    $ruleName = "poker-table-$Port"
    $exists = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    if (-not $exists) {
      Write-Host "Creating firewall rule '$ruleName' to allow TCP port $Port" -ForegroundColor Yellow
      New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -LocalPort $Port -Protocol TCP -Action Allow -Profile Any -Enabled True
    } else { Write-Host "Firewall rule '$ruleName' already exists" }
  } catch { Write-Host "Auto firewall rule creation failed (are you an admin?): $_" -ForegroundColor Yellow }
}
if ($displayHost -and $displayHost -ne '127.0.0.1') { Write-Host ("QR: https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=http://{0}:{1}" -f $displayHost, $Port) }
Set-Location -Path "$PSScriptRoot\.."
# Run Playwright with trace enabled and output folder per run
$traceDir = "${PSScriptRoot}\..\..\frontend\test-traces"
if (!(Test-Path -Path $traceDir)) { New-Item -ItemType Directory -Force -Path $traceDir | Out-Null }
# Build Playwright flags
$pwFlags = @("--trace=on", "--retries=2", "--workers=1", "--reporter=list")
if ($Headed) { $pwFlags += "--headed"; Write-Host 'Playwright: Running in headed mode (slow-mo disabled, use PWDEBUG or devtools)'; }
Write-Host "Running Playwright with trace directory: $traceDir"
# ensure environment variable PW_REPORT_DIR null override and pass args as array
$pwArgs = @("playwright", "test") + $pwFlags + @("--output", $traceDir)
Write-Host "Running: npx $($pwArgs -join ' ')"
Retry-Command { & npx @pwArgs } 2 5

Write-Host "UI Tests finished"

# Cleanup: stop backend start-process if it was started by us
try { if ($startProc -and -not $startProc.HasExited) { $startProc | Stop-Process -Force } } catch {}
