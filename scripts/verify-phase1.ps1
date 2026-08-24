$ErrorActionPreference = "Stop"

Write-Host "[FileForge] Running frontend tests and production build..."
npm run check

$phaseCargoCommand = Get-Command cargo -ErrorAction SilentlyContinue
$phaseCargoFallback = Join-Path $env:USERPROFILE ".cargo\bin\cargo.exe"
$phaseCargoExecutable = if ($phaseCargoCommand) { $phaseCargoCommand.Source } elseif (Test-Path -LiteralPath $phaseCargoFallback) { $phaseCargoFallback } else { $null }

if ($phaseCargoExecutable) {
    Write-Host "[FileForge] Running Rust formatting and tests..."
    & $phaseCargoExecutable fmt --manifest-path src-tauri/Cargo.toml -- --check
    & $phaseCargoExecutable test --manifest-path src-tauri/Cargo.toml
} else {
    Write-Warning "Rust is not installed. Install rustup, then rerun this script to verify the Tauri core."
    exit 2
}

Write-Host "[FileForge] Phase 1 verification passed."

