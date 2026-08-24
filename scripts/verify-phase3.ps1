$ErrorActionPreference = "Stop"

$phaseCargoCommand = Get-Command cargo -ErrorAction SilentlyContinue
$phaseCargoFallback = Join-Path $env:USERPROFILE ".cargo\bin\cargo.exe"
$phaseCargoExecutable = if ($phaseCargoCommand) { $phaseCargoCommand.Source } elseif (Test-Path -LiteralPath $phaseCargoFallback) { $phaseCargoFallback } else { $null }
$phaseSevenZip = "C:\Program Files\7-Zip\7z.exe"

if (-not $phaseCargoExecutable) {
    throw "Rust/Cargo is required. Install rustup and reopen the terminal."
}
if (-not $phaseCargoCommand) {
    $env:Path = "$(Split-Path -Parent $phaseCargoExecutable);$env:Path"
}
if (-not (Test-Path -LiteralPath $phaseSevenZip)) {
    Write-Warning "7-Zip was not found at the standard path. Configure 7z.exe in FileForge Settings."
} else {
    Write-Host "[FileForge] Found 7-Zip at $phaseSevenZip"
}

Write-Host "[FileForge] Running frontend tests and production build..."
npm run check

Write-Host "[FileForge] Running Rust formatting, protocol, database, and real 7-Zip tests..."
& $phaseCargoExecutable fmt --manifest-path src-tauri/Cargo.toml -- --check
if ($LASTEXITCODE -ne 0) { throw "cargo fmt check failed" }
& $phaseCargoExecutable test --manifest-path src-tauri/Cargo.toml
if ($LASTEXITCODE -ne 0) { throw "cargo test failed" }

Write-Host "[FileForge] Compiling the Phase 3 Tauri application..."
npm run tauri:build -- --no-bundle
if ($LASTEXITCODE -ne 0) { throw "Tauri build failed" }

Write-Host "[FileForge] Phase 3 verification passed."
