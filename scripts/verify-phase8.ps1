$ErrorActionPreference = "Stop"

$phaseCargoCommand = Get-Command cargo -ErrorAction SilentlyContinue
$phaseCargoFallback = Join-Path $env:USERPROFILE ".cargo\bin\cargo.exe"
$phaseCargoExecutable = if ($phaseCargoCommand) { $phaseCargoCommand.Source } elseif (Test-Path -LiteralPath $phaseCargoFallback) { $phaseCargoFallback } else { $null }

if (-not $phaseCargoExecutable) {
    throw "Rust/Cargo is required. Install rustup and reopen the terminal."
}
if (-not $phaseCargoCommand) {
    $env:Path = "$(Split-Path -Parent $phaseCargoExecutable);$env:Path"
}

Write-Host "[FileForge] Running frontend tests and production build..."
npm run check
if ($LASTEXITCODE -ne 0) { throw "frontend verification failed" }

Write-Host "[FileForge] Testing bandwidth settings, shared throttling, and Drive chunk compatibility..."
& $phaseCargoExecutable fmt --manifest-path src-tauri/Cargo.toml -- --check
if ($LASTEXITCODE -ne 0) { throw "cargo fmt check failed" }
& $phaseCargoExecutable test --manifest-path src-tauri/Cargo.toml
if ($LASTEXITCODE -ne 0) { throw "cargo test failed" }
& $phaseCargoExecutable clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
if ($LASTEXITCODE -ne 0) { throw "cargo clippy failed" }

Write-Host "[FileForge] Compiling the bandwidth-enabled Tauri application..."
npm run tauri:build -- --no-bundle
if ($LASTEXITCODE -ne 0) { throw "Tauri build failed" }

Write-Host "[FileForge] Phase 8 verification passed."
