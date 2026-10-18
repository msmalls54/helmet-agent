#Requires -Version 5.1
# One-time setup. The token is hidden while typing and encrypted with CurrentUser DPAPI.
[CmdletBinding()]
param(
    [string]$Domain,
    [Security.SecureString]$Authtoken,
    [string]$SecretPath = (Join-Path $env:LOCALAPPDATA 'HelmetAgent\secrets\ngrok.dpapi')
)
$ErrorActionPreference = 'Stop'
if (-not $Domain) { $Domain = Read-Host 'Paste your claimed ngrok hostname (no /mcp or access key)' }
$Domain = $Domain.Trim().ToLowerInvariant() -replace '^https://','' -replace '/$',''
if ($Domain -notmatch '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.(?:ngrok-free\.(?:app|dev)|ngrok\.(?:app|dev|io))$') {
    throw 'Use the exact ngrok hostname claimed in your account, without a path or query.'
}
if (-not $Authtoken) { $Authtoken = Read-Host 'Paste your ngrok authtoken (hidden)' -AsSecureString }
$ngrokPointer = [IntPtr]::Zero
$ngrokEnvelope = $null
try {
    $ngrokPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Authtoken)
    $ngrokToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ngrokPointer)
    if ($ngrokToken -notmatch '^[A-Za-z0-9_-]{20,200}$') { throw 'The ngrok authtoken format is invalid.' }
    $ngrokJson = @{ NGROK_AUTHTOKEN = $ngrokToken; HELMET_NGROK_DOMAIN = $Domain } | ConvertTo-Json -Compress
    $ngrokEnvelope = ConvertTo-SecureString $ngrokJson -AsPlainText -Force
    $ngrokFolder = Split-Path $SecretPath -Parent
    New-Item -ItemType Directory -Path $ngrokFolder -Force | Out-Null
    # Keep inherited broad ACLs off this private file; DPAPI also ties decryption
    # to this Windows user's sign-in. Do not create ngrok's plaintext token config.
    $ngrokAcl = New-Object Security.AccessControl.FileSecurity
    $ngrokAcl.SetAccessRuleProtection($true, $false)
    $ngrokSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $ngrokAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($ngrokSid, 'FullControl', 'Allow')))
    if (-not (Test-Path -LiteralPath $SecretPath)) { New-Item -ItemType File -Path $SecretPath | Out-Null }
    Set-Acl -LiteralPath $SecretPath -AclObject $ngrokAcl
    [IO.File]::WriteAllText($SecretPath, ($ngrokEnvelope | ConvertFrom-SecureString))
    Write-Host ('Saved encrypted ngrok settings for ' + $Domain + '. The token was not printed or put in Git.')
} finally {
    if ($ngrokPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ngrokPointer) }
    if ($null -ne $ngrokEnvelope) { $ngrokEnvelope.Dispose() }
    Remove-Variable ngrokToken, ngrokJson, ngrokPointer, ngrokEnvelope -ErrorAction SilentlyContinue
}
