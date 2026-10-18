#Requires -RunAsAdministrator
param(
    [Parameter(Mandatory = $true)][string]$LaptopAddress,
    [Parameter(Mandatory = $true)][string]$PythonExe,
    [string]$InterfaceAlias = 'Wi-Fi'
)
$ErrorActionPreference = 'Stop'
$receiptPath = Join-Path (Split-Path $PSScriptRoot -Parent) 'evidence\wifi-firewall-rule.json'
$ruleName = 'HelmetAgent-Temporary-3000'
try {
    $address = [System.Net.IPAddress]::Parse($LaptopAddress)
    if ($address.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) {
        throw 'Expected an IPv4 laptop address.'
    }
    if (-not (Test-Path -LiteralPath $PythonExe -PathType Leaf)) { throw 'Python executable missing.' }
    $existing = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
    if ($existing) {
        $application = $existing | Get-NetFirewallApplicationFilter
        $ports = $existing | Get-NetFirewallPortFilter
        if ($application.Program -ne $PythonExe -or $ports.LocalPort -ne '3000') {
            throw 'The existing named rule does not match this listener; it was not changed.'
        }
        Set-NetFirewallRule -Name $ruleName -LocalAddress $LaptopAddress -RemoteAddress LocalSubnet `
            -InterfaceAlias $InterfaceAlias -Profile Any -Enabled True | Out-Null
    } else {
        New-NetFirewallRule -Name $ruleName -DisplayName 'Helmet Agent temporary listener TCP 3000' `
            -Description 'Temporary helmet demo. Python only, selected wireless link, laptop IP and local subnet only.' `
            -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000 `
            -LocalAddress $LaptopAddress -RemoteAddress LocalSubnet -InterfaceAlias $InterfaceAlias `
            -Program $PythonExe -Profile Any | Out-Null
    }
    @{success=$true; rule_name=$ruleName; local_ip=$LaptopAddress; port=3000;
      program=$PythonExe; interface=$InterfaceAlias; remote_address='LocalSubnet';
      checked_at_utc=[DateTime]::UtcNow.ToString('o')} |
        ConvertTo-Json | Set-Content -LiteralPath $receiptPath -Encoding utf8
} catch {
    @{success=$false; rule_name=$ruleName; error=$_.Exception.Message;
      checked_at_utc=[DateTime]::UtcNow.ToString('o')} |
        ConvertTo-Json | Set-Content -LiteralPath $receiptPath -Encoding utf8
    exit 1
}
