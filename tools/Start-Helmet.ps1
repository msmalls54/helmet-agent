#Requires -Version 5.1
# Start the laptop's private 2.4 GHz helmet link and ONE Node server on port 3000.
param(
    [switch]$LocalOnly,
    [switch]$NoAutomaticAlerts,
    [ValidateSet('ngrok','cloudflare','manufact')][string]$TunnelProvider
)
$ErrorActionPreference = 'Stop'
$helmetPriorAlertMode = $env:HELMET_ALERT_MODE
$projectRoot = Split-Path $PSScriptRoot -Parent
$serverRoot = Join-Path $projectRoot 'server'
$windowsPowerShell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$nodeExe = (Get-Command node -ErrorAction Stop).Source
$firmwareSecrets = [IO.File]::ReadAllText((Join-Path $projectRoot 'firmware\helmet_impact\secrets.h'))
$expectedHost = [regex]::Match($firmwareSecrets, '(?m)^#define SERVER_HOST[ \t]+"([^"]+)"').Groups[1].Value

Write-Host 'Starting the private helmet Wi-Fi link (keep the laptop on venue Wi-Fi)...'
& $windowsPowerShell -NoProfile -File (Join-Path $PSScriptRoot 'Start-HelmetWifi.ps1')
if ($LASTEXITCODE -ne 0) { throw 'The private helmet Wi-Fi link could not start.' }
$link = Get-Content -LiteralPath (Join-Path $projectRoot 'evidence\wifi-laptop-link.json') -Raw | ConvertFrom-Json
if (-not $link.success -or $link.laptop_listener_ip -ne $expectedHost) {
    throw 'The hotspot IP changed from the firmware setting. The firmware must be updated before a live demo.'
}

$rule = Get-NetFirewallRule -Name 'HelmetAgent-Node-3000' -ErrorAction SilentlyContinue
$firewallReady = $false
if ($rule) {
    $application = $rule | Get-NetFirewallApplicationFilter
    $ports = $rule | Get-NetFirewallPortFilter
    $addresses = $rule | Get-NetFirewallAddressFilter
    $interfaces = $rule | Get-NetFirewallInterfaceFilter
    $firewallReady = $rule.Enabled.ToString() -eq 'True' -and $rule.Direction.ToString() -eq 'Inbound' -and
        $rule.Action.ToString() -eq 'Allow' -and $application.Program -eq $nodeExe -and
        $ports.LocalPort -eq '3000' -and $ports.Protocol -eq 'TCP' -and
        @($addresses.LocalAddress) -contains $link.laptop_listener_ip -and
        @($addresses.RemoteAddress) -contains 'LocalSubnet' -and
        @($interfaces.InterfaceAlias) -contains $link.interface_alias
}
if (-not $firewallReady) {
    Write-Host 'Windows needs administrator approval to allow Node on the private helmet link only.'
    $firewallScript = Join-Path $PSScriptRoot 'Allow-HelmetServer.ps1'
    $arguments = @('-NoProfile','-File',('"'+$firewallScript+'"'),'-LaptopAddress',$link.laptop_listener_ip,
        '-NodeExe',('"'+$nodeExe+'"'),'-InterfaceAlias',('"'+$link.interface_alias+'"'))
    $process = Start-Process -FilePath $windowsPowerShell -Verb RunAs -WindowStyle Hidden -ArgumentList $arguments -PassThru
    if (-not $process.WaitForExit(30000)) { throw 'Firewall setup is still awaiting Windows approval. Complete it and run Start Helmet again.' }
    $firewall = Get-Content -LiteralPath (Join-Path $projectRoot 'evidence\server-firewall-rule.json') -Raw | ConvertFrom-Json
    if ($process.ExitCode -ne 0 -or -not $firewall.success) { throw 'The scoped Node firewall rule could not be installed.' }
}

$listening = @(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue)
if ($listening.Count -gt 0) {
    try { $health = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/health' -TimeoutSec 3 } catch { $health = $null }
    if ($health.service -eq 'helmet-agent') {
        if ($NoAutomaticAlerts -and $health.automatic_alerts.armed) {
            throw 'Automatic alerts are active in the existing server. Stop its window with Ctrl+C, then rerun with -NoAutomaticAlerts.'
        }
        Write-Host 'Helmet Agent is already running. Inspector: http://localhost:3000/inspector'
        $connectionPath = Join-Path $serverRoot '.mcp-use\state\helmet-connection.json'
        if ($health.remote.enabled -and $health.remote.connected -and (Test-Path -LiteralPath $connectionPath)) {
            $connection = Get-Content -LiteralPath $connectionPath -Raw | ConvertFrom-Json
            if ($connection.public_origin -eq $health.remote.public_origin) {
                Write-Host ('Private MCP connection URL: ' + $connection.mcp_url)
            }
        } elseif (-not $LocalOnly) {
            Write-Host 'This instance has no active tunnel. Stop it with Ctrl+C, then run this launcher again.'
        }
        return
    }
    throw 'Port 3000 is occupied by another program. Close it before starting Helmet Agent.'
}

$env:MCP_USE_ANONYMIZED_TELEMETRY = 'false'
$env:NODE_ENV = 'production'
$env:HELMET_DB_PATH = Join-Path $serverRoot 'data\helmet.sqlite'
$env:HELMET_TUNNEL = '0'
$ngrokSecretPath = Join-Path $env:LOCALAPPDATA 'HelmetAgent\secrets\ngrok.dpapi'
if (-not $TunnelProvider -and $env:HELMET_TUNNEL_PROVIDER) { $TunnelProvider = $env:HELMET_TUNNEL_PROVIDER }
if (-not $TunnelProvider) {
    $TunnelProvider = $(if (Test-Path -LiteralPath $ngrokSecretPath) { 'ngrok' } else { 'cloudflare' })
}
$env:HELMET_TUNNEL_PROVIDER = $TunnelProvider
if (-not $LocalOnly -and $TunnelProvider -eq 'ngrok') {
    if (-not (Test-Path -LiteralPath $ngrokSecretPath)) {
        throw 'Configure the fixed domain once with tools\Set-HelmetNgrok.ps1 before starting ngrok.'
    }
    $ngrokCommand = Get-Command ngrok -ErrorAction SilentlyContinue
    if ($ngrokCommand) { $env:HELMET_NGROK_PATH = $ngrokCommand.Source }
    else {
        $ngrokCandidates = @((Join-Path $env:LOCALAPPDATA 'Programs\Ngrok\ngrok.exe'),
            (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links\ngrok.exe'))
        $env:HELMET_NGROK_PATH = $ngrokCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    }
    if (-not $env:HELMET_NGROK_PATH) { throw 'Install the official Windows agent from https://ngrok.com/download/windows, then rerun.' }
}
if (-not $LocalOnly -and $TunnelProvider -eq 'cloudflare') {
    $cloudflareExe = Get-Command cloudflared -ErrorAction SilentlyContinue
    if ($cloudflareExe) { $env:HELMET_CLOUDFLARED_PATH = $cloudflareExe.Source }
    else {
        $candidates = @((Join-Path $env:ProgramFiles 'cloudflared\cloudflared.exe'),
            (Join-Path ${env:ProgramFiles(x86)} 'cloudflared\cloudflared.exe'),
            (Join-Path $env:LOCALAPPDATA 'Programs\Cloudflared\cloudflared.exe'))
        $env:HELMET_CLOUDFLARED_PATH = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    }
    if (-not $env:HELMET_CLOUDFLARED_PATH) {
        throw 'Install the demo tunnel once: winget install --id Cloudflare.cloudflared --exact'
    }
}
Push-Location $serverRoot
try {
    if (-not (Test-Path -LiteralPath 'node_modules\mcp-use\package.json')) {
        & npm.cmd ci
        if ($LASTEXITCODE -ne 0) { throw 'Dependencies could not be installed.' }
    }
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'The server build failed. No partial build was started.' }
    # Credentials are loaded only after the build tools have finished.
    . (Join-Path $serverRoot 'scripts\Load-Inkbox.ps1')
    $agentSecretPath = Join-Path $env:LOCALAPPDATA 'HelmetAgent\secrets\agent.dpapi'
    if (Test-Path -LiteralPath $agentSecretPath) { . (Join-Path $serverRoot 'scripts\Load-Agent.ps1') -SecretPath $agentSecretPath }
    if ($NoAutomaticAlerts) { $env:HELMET_ALERT_MODE = 'off' }
    # Decrypt only after the build, so build tools never inherit the authtoken.
    if (-not $LocalOnly -and $TunnelProvider -eq 'ngrok') {
        . (Join-Path $serverRoot 'scripts\Load-Ngrok.ps1') -SecretPath $ngrokSecretPath
    }
    $env:HELMET_TUNNEL = $(if ($LocalOnly) { '0' } else { '1' })
    Write-Host 'Helmet Agent starting. Inspector: http://localhost:3000/inspector'
    Write-Host 'Keep this window open. Press Ctrl+C here to stop the server.'
    & $nodeExe 'dist/index.js'
    if ($LASTEXITCODE -ne 0) { throw 'The helmet server exited with an error.' }
} finally {
    Pop-Location
    Get-ChildItem Env:INKBOX_* | Remove-Item
    Remove-Item Env:NGROK_AUTHTOKEN -ErrorAction SilentlyContinue
    Remove-Item Env:HELMET_AGENT_API_KEY -ErrorAction SilentlyContinue
    if ($null -eq $helmetPriorAlertMode) { Remove-Item Env:HELMET_ALERT_MODE -ErrorAction SilentlyContinue }
    else { $env:HELMET_ALERT_MODE = $helmetPriorAlertMode }
}
