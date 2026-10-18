#Requires -RunAsAdministrator
param(
    [Parameter(Mandatory=$true)][string]$LaptopAddress,
    [Parameter(Mandatory=$true)][string]$NodeExe,
    [Parameter(Mandatory=$true)][string]$InterfaceAlias
)
$ErrorActionPreference = 'Stop'
$receiptPath = Join-Path (Split-Path $PSScriptRoot -Parent) 'evidence\server-firewall-rule.json'
$ruleName = 'HelmetAgent-Node-3000'
try {
    $address = [Net.IPAddress]::Parse($LaptopAddress)
    if ($address.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork) { throw 'IPv4 required.' }
    if (-not (Test-Path -LiteralPath $NodeExe -PathType Leaf) -or (Split-Path $NodeExe -Leaf) -ne 'node.exe') { throw 'Node executable required.' }
    $existing = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
    if ($existing) {
        $application = $existing | Get-NetFirewallApplicationFilter
        $ports = $existing | Get-NetFirewallPortFilter
        if ($application.Program -ne $NodeExe -or $ports.LocalPort -ne '3000') { throw 'Existing rule differs; it was not changed.' }
        Set-NetFirewallRule -Name $ruleName -LocalAddress $LaptopAddress -RemoteAddress LocalSubnet `
            -InterfaceAlias $InterfaceAlias -Profile Any -Enabled True | Out-Null
    } else {
        New-NetFirewallRule -Name $ruleName -DisplayName 'Helmet Agent server TCP 3000' `
            -Description 'Node only; private helmet Wi-Fi link, local address and subnet, TCP 3000 only.' `
            -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000 -LocalAddress $LaptopAddress `
            -RemoteAddress LocalSubnet -InterfaceAlias $InterfaceAlias -Program $NodeExe -Profile Any | Out-Null
    }
    # Retire only the explicitly named rule belonging to the replaced Python listener.
    Get-NetFirewallRule -Name 'HelmetAgent-Temporary-3000' -ErrorAction SilentlyContinue |
        Disable-NetFirewallRule | Out-Null
    @{success=$true; rule_name=$ruleName; local_ip=$LaptopAddress; port=3000;
      program=$NodeExe; interface=$InterfaceAlias; remote_address='LocalSubnet';
      checked_at_utc=[DateTime]::UtcNow.ToString('o')} |
        ConvertTo-Json | Set-Content -LiteralPath $receiptPath -Encoding utf8
} catch {
    @{success=$false; error=$_.Exception.Message; checked_at_utc=[DateTime]::UtcNow.ToString('o')} |
        ConvertTo-Json | Set-Content -LiteralPath $receiptPath -Encoding utf8
    exit 1
}
