# Dot-source to decrypt the helmet agent's model credential for this Windows user.
[CmdletBinding()]
param([string]$SecretPath = (Join-Path $env:LOCALAPPDATA 'HelmetAgent\secrets\agent.dpapi'))
$agentSecure = $null
$agentPointer = [IntPtr]::Zero
try {
    $agentSecure = ConvertTo-SecureString ([IO.File]::ReadAllText($SecretPath)) -ErrorAction Stop
    $agentPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($agentSecure)
    $agentValues = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($agentPointer) | ConvertFrom-Json -ErrorAction Stop
    if (@($agentValues.PSObject.Properties.Name).Count -ne 2 -or
        -not ($agentValues.PSObject.Properties.Name -contains 'HELMET_AGENT_API_KEY') -or
        -not ($agentValues.PSObject.Properties.Name -contains 'HELMET_AGENT_MODEL') -or
        [string]::IsNullOrWhiteSpace($agentValues.HELMET_AGENT_API_KEY) -or
        $agentValues.HELMET_AGENT_MODEL -notmatch '^grok-[a-zA-Z0-9.-]+$') {
        throw 'Invalid encrypted model settings. Run tools\Set-HelmetAgent.ps1.'
    }
    $env:HELMET_AGENT_API_KEY = [string]$agentValues.HELMET_AGENT_API_KEY
    $env:HELMET_AGENT_MODEL = [string]$agentValues.HELMET_AGENT_MODEL
} finally {
    if ($agentPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($agentPointer) }
    if ($null -ne $agentSecure) { $agentSecure.Dispose() }
    Remove-Variable agentValues, agentPointer, agentSecure -ErrorAction SilentlyContinue
}
