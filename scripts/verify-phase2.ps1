$ErrorActionPreference = "Stop"

$phaseCargoCommand = Get-Command cargo -ErrorAction SilentlyContinue
$phaseCargoFallback = Join-Path $env:USERPROFILE ".cargo\bin\cargo.exe"
$phaseCargoExecutable = if ($phaseCargoCommand) { $phaseCargoCommand.Source } elseif (Test-Path -LiteralPath $phaseCargoFallback) { $phaseCargoFallback } else { $null }

if (-not $phaseCargoExecutable) {
    throw "Rust/Cargo is required. Install rustup and restart the terminal."
}

if (-not $phaseCargoCommand) {
    $env:Path = "$(Split-Path -Parent $phaseCargoExecutable);$env:Path"
}

Write-Host "[FileForge] Running frontend tests and production build..."
npm run check

Write-Host "[FileForge] Checking Rust formatting and native tests..."
& $phaseCargoExecutable fmt --manifest-path src-tauri/Cargo.toml -- --check
& $phaseCargoExecutable test --manifest-path src-tauri/Cargo.toml

Write-Host "[FileForge] Compiling the Tauri desktop application..."
npm run tauri:build -- --debug --no-bundle

if (-not $env:GOOGLE_CLIENT_ID -or -not $env:GOOGLE_CLIENT_SECRET) {
    Write-Warning "Build verification passed. Live OAuth requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env."
}

Write-Host "[FileForge] Phase 2 static verification passed."
