$ErrorActionPreference = "Stop"

Write-Host "[FileForge] Running frontend tests and production build..."
npm run check

if (Get-Command cargo -ErrorAction SilentlyContinue) {
    Write-Host "[FileForge] Running Rust formatting and tests..."
    cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
    cargo test --manifest-path src-tauri/Cargo.toml
} else {
    Write-Warning "Rust is not installed. Install rustup, then rerun this script to verify the Tauri core."
    exit 2
}

Write-Host "[FileForge] Phase 1 verification passed."

