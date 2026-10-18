# Read-only credential check. This never sends a message or places a call.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$inkboxPrevious = @{}
Get-ChildItem Env:INKBOX_* | ForEach-Object { $inkboxPrevious[$_.Name] = $_.Value }
try {
    . (Join-Path $PSScriptRoot 'Load-Inkbox.ps1')
    $inkboxHeaders = @{'X-API-Key'=$env:INKBOX_API_KEY}
    $inkboxSelf = Invoke-RestMethod -Uri 'https://inkbox.ai/api/v1/api-keys/self' -Headers $inkboxHeaders -TimeoutSec 20
    $inkboxIdentity = Invoke-RestMethod -Uri ('https://inkbox.ai/api/v1/identities/'+[Uri]::EscapeDataString($env:INKBOX_AGENT_HANDLE)) -Headers $inkboxHeaders -TimeoutSec 20
    $inkboxRouter = Invoke-RestMethod -Uri 'https://inkbox.ai/api/v1/imessage/triage-number' -Headers $inkboxHeaders -TimeoutSec 20
    $inkboxAssignments = Invoke-RestMethod -Uri 'https://inkbox.ai/api/v1/imessage/assignments?limit=200' -Headers $inkboxHeaders -TimeoutSec 20
    $inkboxNumbers = Invoke-RestMethod -Uri 'https://inkbox.ai/api/v1/phone/numbers' -Headers $inkboxHeaders -TimeoutSec 20
    if ($inkboxSelf.status -ne 'active' -or $inkboxSelf.scoped_identity_id -ne $inkboxIdentity.id) {
        throw 'The active key must be scoped to the helmet identity.'
    }
    # Historical delivery evidence is separate from the live read-only checks.
    $inkboxDelivery = $null
    $inkboxDeliveryPath = Join-Path $PSScriptRoot '..\..\evidence\inkbox-outbound-test-status.json'
    if (Test-Path -LiteralPath $inkboxDeliveryPath -PathType Leaf) {
        $inkboxDelivery = Get-Content -LiteralPath $inkboxDeliveryPath -Raw | ConvertFrom-Json
        if ($inkboxDelivery.scoped_identity_id -ne $inkboxSelf.scoped_identity_id) {
            $inkboxDelivery = $null
        }
    }
    [ordered]@{
        authenticated = $true
        status = $inkboxSelf.status
        scoped_identity_id = $inkboxSelf.scoped_identity_id
        agent_handle = $env:INKBOX_AGENT_HANDLE
        identity_status = $inkboxIdentity.status
        email_address = $inkboxIdentity.email_address
        mailbox_status = $inkboxIdentity.mailbox.status
        shared_messaging_enabled = $inkboxIdentity.imessage_enabled
        router_number = $inkboxRouter.number
        connect_command = $inkboxRouter.connect_command
        active_recipient_connections = @($inkboxAssignments).Count
        dedicated_phone_numbers = @($inkboxNumbers).Count
        delivery_tested = ($null -ne $inkboxDelivery)
        last_outbound_test_status = $(if ($inkboxDelivery) { $inkboxDelivery.status } else { 'untested' })
        last_outbound_test_checked_at_utc = $(if ($inkboxDelivery) { $inkboxDelivery.checked_at_utc } else { $null })
        checked_at_utc = [DateTime]::UtcNow.ToString('o')
        messages_sent_by_check = 0
        calls_placed_by_check = 0
    } | ConvertTo-Json
} catch {
    # Do not echo provider bodies, request headers, or exception details.
    throw 'Inkbox verification failed. Check the key status in the Inkbox console and network access.'
} finally {
    Get-ChildItem Env:INKBOX_* | Remove-Item
    foreach ($inkboxName in $inkboxPrevious.Keys) {
        [Environment]::SetEnvironmentVariable($inkboxName, $inkboxPrevious[$inkboxName], 'Process')
    }
}
