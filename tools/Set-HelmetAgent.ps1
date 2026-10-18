#Requires -Version 5.1
[CmdletBinding()]
param([switch]$UseConfiguredXai, [string]$Model = 'grok-4.20-0309-non-reasoning')
$ErrorActionPreference = 'Stop'
if ($Model -notmatch '^grok-[a-zA-Z0-9.-]+$') { throw 'Use an xAI Grok model name.' }
$agentKey = $null
$agentPointer = [IntPtr]::Zero
$agentSecure = $null
try {
    if ($UseConfiguredXai) {
        if ($env:OPENAI_BASE_URL -notmatch '^https://api\.x\.ai(?:/v1)?/?$' -or -not $env:OPENAI_API_KEY) {
            throw 'No existing credential configured for the official xAI origin.'
        }
        $agentKey = $env:OPENAI_API_KEY
    } else {
        $agentSecure = Read-Host 'Paste the xAI API key (hidden)' -AsSecureString
        $agentPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($agentSecure)
        $agentKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($agentPointer)
    }
    if ([string]::IsNullOrWhiteSpace($agentKey)) { throw 'The API key is empty.' }
    $agentFolder = Join-Path $env:LOCALAPPDATA 'HelmetAgent\secrets'
    [IO.Directory]::CreateDirectory($agentFolder) | Out-Null
    $agentJson = @{ HELMET_AGENT_API_KEY = $agentKey; HELMET_AGENT_MODEL = $Model } | ConvertTo-Json -Compress
    $agentEncrypted = ConvertTo-SecureString $agentJson -AsPlainText -Force | ConvertFrom-SecureString
    [IO.File]::WriteAllText((Join-Path $agentFolder 'agent.dpapi'), $agentEncrypted)
    Write-Host 'Model credential saved in the Windows encrypted helmet store. No token printed or stored in Git.'
} finally {
    if ($agentPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($agentPointer) }
    if ($null -ne $agentSecure) { $agentSecure.Dispose() }
    Remove-Variable agentKey, agentJson, agentEncrypted, agentSecure, agentPointer -ErrorAction SilentlyContinue
}
