#Requires -Version 5.1
param([switch]$Stop)
# Windows PowerShell exposes the built-in Windows mobile-hotspot WinRT API.
if ($PSVersionTable.PSEdition -eq 'Core') {
    $arguments = @('-NoProfile','-File',$PSCommandPath)
    if ($Stop) { $arguments += '-Stop' }
    & "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" @arguments
    exit $LASTEXITCODE
}
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$receiptPath = Join-Path $projectRoot 'evidence\wifi-laptop-link.json'
try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $null = [Windows.Networking.Connectivity.NetworkInformation, Windows.Networking.Connectivity, ContentType=WindowsRuntime]
    $null = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager, Windows.Networking.NetworkOperators, ContentType=WindowsRuntime]
    $null = [Windows.Networking.NetworkOperators.TetheringWiFiBand, Windows.Networking.NetworkOperators, ContentType=WindowsRuntime]
    $null = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationResult, Windows.Networking.NetworkOperators, ContentType=WindowsRuntime]
    $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and
        $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    } | Select-Object -First 1
    $asTaskAction = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and -not $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and
        $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction'
    } | Select-Object -First 1
    function Wait-Operation($Operation, [Type]$ResultType) {
        $task = $asTask.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
        if (-not $task.Wait(30000)) { throw 'Windows hotspot operation timed out.' }
        return $task.Result
    }
    $secretsPath = Join-Path $projectRoot 'firmware\helmet_impact\secrets.h'
    $source = [IO.File]::ReadAllText($secretsPath)
    $ssidMatch = [regex]::Match($source, '(?m)^#define WIFI_SSID[ \t]+(".*")[ \t]*\r?$')
    $passwordMatch = [regex]::Match($source, '(?m)^#define WIFI_PASSWORD[ \t]+(".*")[ \t]*\r?$')
    if (-not $ssidMatch.Success -or -not $passwordMatch.Success) { throw 'Missing valid Wi-Fi definitions in secrets.h.' }
    $ssid = $ssidMatch.Groups[1].Value | ConvertFrom-Json
    $password = $passwordMatch.Groups[1].Value | ConvertFrom-Json
    if (-not $ssid -or $ssid.Length -gt 32 -or -not $password -or $password.Length -lt 8 -or $password.Length -gt 63) {
        throw 'Invalid hotspot name or password length; no hotspot configuration was changed.'
    }
    $profile = [Windows.Networking.Connectivity.NetworkInformation]::GetInternetConnectionProfile()
    if (-not $profile) { throw 'Connect the laptop to the venue Wi-Fi first.' }
    if ($ssid -eq $profile.ProfileName) { throw 'The helmet link must have a distinct SSID from the venue network.' }
    $manager = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager]::CreateFromConnectionProfile($profile)
    $config = $manager.GetCurrentAccessPointConfiguration()
    if ($Stop) {
        if ($manager.TetheringOperationalState.ToString() -ne 'Off') {
            if ($config.Ssid -ne $ssid) { throw 'An unrelated laptop hotspot was not stopped.' }
            $result = Wait-Operation $manager.StopTetheringAsync() ([Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationResult])
            $deadline = [DateTime]::UtcNow.AddSeconds(10)
            while ($manager.TetheringOperationalState.ToString() -ne 'Off' -and [DateTime]::UtcNow -lt $deadline) {
                Start-Sleep -Milliseconds 200
            }
        }
        if ($manager.TetheringOperationalState.ToString() -ne 'Off') { throw 'Hotspot did not stop.' }
        @{success=$true; state='Off'; helmet_ssid=$ssid; upstream_profile=$profile.ProfileName;
            checked_at_utc=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json -Compress
        exit 0
    }
    $band = [Windows.Networking.NetworkOperators.TetheringWiFiBand]::TwoPointFourGigahertz
    if (-not $config.IsBandSupported($band)) { throw 'This adapter cannot create a 2.4 GHz helmet link.' }
    if ($manager.TetheringOperationalState.ToString() -ne 'Off' -and $config.Ssid -ne $ssid) {
        throw 'Another laptop hotspot is active; it was not changed.'
    }
    if ($manager.TetheringOperationalState.ToString() -eq 'Off') {
        $config.Ssid = $ssid
        $config.Passphrase = $password
        $config.Band = $band
        $action = $manager.ConfigureAccessPointAsync($config)
        $task = $asTaskAction.Invoke($null, @($action))
        if (-not $task.Wait(30000)) { throw 'Windows hotspot configuration timed out.' }
        $result = Wait-Operation $manager.StartTetheringAsync() ([Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationResult])
        if ($result.Status.ToString() -ne 'Success') {
            throw ('Windows hotspot start: ' + $result.Status.ToString() + '; ' + $result.AdditionalErrorMessage)
        }
    }
    $active = $manager.GetCurrentAccessPointConfiguration()
    if ($manager.TetheringOperationalState.ToString() -ne 'On' -or $active.Ssid -ne $ssid -or
        $active.Band -ne $band -or $active.Passphrase -ne $password) {
        throw 'The active hotspot settings do not match secrets.h and the required 2.4 GHz band.'
    }
    # Windows can otherwise turn the link off five minutes after the board is
    # unplugged for mounting/power changes. Apply only after matching our AP.
    if ([Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager]::IsNoConnectionsTimeoutEnabled()) {
        [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager]::DisableNoConnectionsTimeout()
    }
    $idleAutoOff = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager]::IsNoConnectionsTimeoutEnabled()
    if ($idleAutoOff) { throw 'Windows could not disable idle hotspot shutdown for the demo.' }
    # Internet Connection Sharing can assign IPv4 shortly after Start succeeds.
    $addressDeadline = [DateTime]::UtcNow.AddSeconds(10)
    do {
        $link = Get-NetAdapter -IncludeHidden | Where-Object {
            $_.InterfaceDescription -like '*Wi-Fi Direct Virtual Adapter*' -and $_.Status -eq 'Up'
        } | ForEach-Object {
            Get-NetIPAddress -InterfaceIndex $_.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
                Where-Object { $_.IPAddress -notlike '169.254.*' }
        } | Select-Object -First 1
        if ($link) { break }
        Start-Sleep -Milliseconds 250
    } while ([DateTime]::UtcNow -lt $addressDeadline)
    if (-not $link) { throw 'Hotspot started but IPv4 was not ready after 10 seconds; check Windows Internet Connection Sharing.' }
    $source = [regex]::Replace($source, '(?m)^#define SERVER_HOST[^\r\n]*', ('#define SERVER_HOST "' + $link.IPAddress + '"'))
    [IO.File]::WriteAllText($secretsPath, $source)
    $receipt = @{success=$true; upstream_profile=$profile.ProfileName; helmet_ssid=$ssid;
        band=$manager.GetCurrentAccessPointConfiguration().Band.ToString();
        state=$manager.TetheringOperationalState.ToString(); laptop_listener_ip=$link.IPAddress;
        interface_alias=$link.InterfaceAlias; idle_auto_off=$idleAutoOff;
        connected_clients=$manager.ClientCount; checked_at_utc=[DateTime]::UtcNow.ToString('o')}
    $receipt | ConvertTo-Json | Set-Content -LiteralPath $receiptPath -Encoding utf8
    $receipt | ConvertTo-Json -Compress
} catch {
    $receipt = @{success=$false; error=$_.Exception.Message; checked_at_utc=[DateTime]::UtcNow.ToString('o')}
    $receipt | ConvertTo-Json | Set-Content -LiteralPath $receiptPath -Encoding utf8
    $receipt | ConvertTo-Json -Compress
    exit 1
}
