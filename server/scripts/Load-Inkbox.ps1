# Dot-source this file to load the private Inkbox variable set into this process.
# Windows encrypts the file for this Windows account using DPAPI.
[CmdletBinding()]
param(
    [string]$SecretPath = (Join-Path $env:LOCALAPPDATA 'HelmetAgent\secrets\inkbox.dpapi')
)

$inkboxSecure = $null
$inkboxPointer = [IntPtr]::Zero
try {
    if (-not (Test-Path -LiteralPath $SecretPath -PathType Leaf)) {
        throw 'The encrypted Inkbox variable set is missing.'
    }
    $inkboxSecure = ConvertTo-SecureString ([IO.File]::ReadAllText($SecretPath)) -ErrorAction Stop
    $inkboxPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($inkboxSecure)
    $inkboxValues = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($inkboxPointer) | ConvertFrom-Json -ErrorAction Stop
    if ([string]::IsNullOrWhiteSpace($inkboxValues.INKBOX_API_KEY)) {
        throw 'The Inkbox variable set has no API key.'
    }
    foreach ($inkboxItem in $inkboxValues.PSObject.Properties) {
        if ($inkboxItem.Name -notmatch '^INKBOX_[A-Z0-9_]+$') {
            throw 'Unexpected variable name in the Inkbox variable set.'
        }
    }
    foreach ($inkboxItem in $inkboxValues.PSObject.Properties) {
        [Environment]::SetEnvironmentVariable($inkboxItem.Name, [string]$inkboxItem.Value, 'Process')
    }
    # The connected conversation UUID is nonsecret and was verified during START.
    # Pin the intended conversation; never guess a recipient from a phone number.
    if (-not $env:INKBOX_CONVERSATION_ID) {
        $inkboxConnectionPath = Join-Path $PSScriptRoot '..\..\evidence\inkbox-phone-connection-status.json'
        $inkboxConnection = Get-Content -LiteralPath $inkboxConnectionPath -Raw | ConvertFrom-Json
        if ($inkboxConnection.agent_handle -ne $env:INKBOX_AGENT_HANDLE -or
            -not $inkboxConnection.inbound_start_received -or
            $inkboxConnection.conversation_id -notmatch '^[0-9a-f-]{36}$') {
            throw 'The saved connected Inkbox conversation does not match this agent.'
        }
        $env:INKBOX_CONVERSATION_ID = $inkboxConnection.conversation_id
    }
} finally {
    if ($inkboxPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($inkboxPointer)
    }
    if ($null -ne $inkboxSecure) { $inkboxSecure.Dispose() }
    Remove-Variable inkboxValues, inkboxItem, inkboxPointer, inkboxSecure, inkboxConnection, inkboxConnectionPath -ErrorAction SilentlyContinue
}
