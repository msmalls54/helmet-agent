param([switch]$Upload, [string]$Port = 'COM3')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$configuration = Get-Content -LiteralPath (Join-Path $projectRoot 'setup.json') -Raw | ConvertFrom-Json
$compilerPath = $configuration.arduino_cli.executable
$boardProfile = $configuration.board.fqbn_for_future_builds
$buildDirectory = Join-Path $projectRoot '.cache\tap-build'
$sketchDirectory = Join-Path $projectRoot 'firmware\helmet_impact'
if (-not (Test-Path -LiteralPath $compilerPath)) { throw 'Arduino compiler is unavailable at its recorded path.' }
& $compilerPath compile --fqbn $boardProfile --build-path $buildDirectory --jobs 4 $sketchDirectory
if ($LASTEXITCODE -ne 0) { throw 'Firmware build failed; nothing uploaded.' }
if ($Upload) {
    & $compilerPath upload --fqbn $boardProfile --port $Port --input-dir $buildDirectory
    if ($LASTEXITCODE -ne 0) { throw 'Upload failed; check the laptop USB cable and port.' }
    Write-Output 'Uploaded. Keep the helmet still at startup; verify saved calibration and normal detection before the test.'
} else {
    Write-Output 'Build complete. No board was changed. Use -Upload when the helmet is connected to laptop USB.'
}
