#Requires -Version 5.1
# Read-only pre-demo checks. Does not change Wi-Fi, upload firmware or send texts.
$ErrorActionPreference = 'Stop'
$serverRoot = Join-Path (Split-Path $PSScriptRoot -Parent) 'server'
Push-Location $serverRoot
try {
    if (-not (Test-Path -LiteralPath 'node_modules\tsx\dist\cli.mjs')) {
        throw 'Server dependencies are missing. Run Start Helmet.cmd first.'
    }
    & node 'node_modules\tsx\dist\cli.mjs' 'scripts\Check-Demo.ts'
    if ($LASTEXITCODE -ne 0) { throw 'Helmet demo check found an issue. Read the CHECK lines above.' }
} finally { Pop-Location }
