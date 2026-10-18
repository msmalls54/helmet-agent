# Dot-source to decrypt the ngrok settings for this Windows account only.
[CmdletBinding()]
param([string]$SecretPath = (Join-Path $env:LOCALAPPDATA 'HelmetAgent\secrets\ngrok.dpapi'))
$ngrokSecure = $null
$ngrokPointer = [IntPtr]::Zero
try {
    if (-not (Test-Path -LiteralPath $SecretPath -PathType Leaf)) {
        throw 'The encrypted ngrok settings are missing. Run tools\Set-HelmetNgrok.ps1 first.'
    }
    $ngrokSecure = ConvertTo-SecureString ([IO.File]::ReadAllText($SecretPath)) -ErrorAction Stop
    $ngrokPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($ngrokSecure)
    $ngrokValues = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ngrokPointer) | ConvertFrom-Json -ErrorAction Stop
    if (@($ngrokValues.PSObject.Properties.Name).Count -ne 2 -or
        -not ($ngrokValues.PSObject.Properties.Name -contains 'NGROK_AUTHTOKEN') -or
        -not ($ngrokValues.PSObject.Properties.Name -contains 'HELMET_NGROK_DOMAIN') -or
        $ngrokValues.NGROK_AUTHTOKEN -notmatch '^[A-Za-z0-9_-]{20,200}$' -or
        $ngrokValues.HELMET_NGROK_DOMAIN -notmatch '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.(?:ngrok-free\.(?:app|dev)|ngrok\.(?:app|dev|io))$') {
        throw 'The encrypted ngrok settings are invalid. Run tools\Set-HelmetNgrok.ps1 again.'
    }
    $env:NGROK_AUTHTOKEN = [string]$ngrokValues.NGROK_AUTHTOKEN
    $env:HELMET_NGROK_DOMAIN = [string]$ngrokValues.HELMET_NGROK_DOMAIN
} finally {
    if ($ngrokPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ngrokPointer) }
    if ($null -ne $ngrokSecure) { $ngrokSecure.Dispose() }
    Remove-Variable ngrokValues, ngrokPointer, ngrokSecure -ErrorAction SilentlyContinue
}
