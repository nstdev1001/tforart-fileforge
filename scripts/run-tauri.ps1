param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $TauriArguments
)

$ErrorActionPreference = "Stop"

$phaseCargoCommand = Get-Command cargo -ErrorAction SilentlyContinue
$phaseRustBin = Join-Path $env:USERPROFILE ".cargo\bin"
$phaseCargoFallback = Join-Path $phaseRustBin "cargo.exe"

if (-not $phaseCargoCommand) {
    if (-not (Test-Path -LiteralPath $phaseCargoFallback)) {
        throw "Cargo was not found. Install Rust with rustup from https://rustup.rs/ and reopen the terminal."
    }

    # The Codex/terminal process may predate the rustup installation. Updating
    # PATH only for this child process lets the Tauri CLI resolve cargo without
    # requiring a Windows restart or changing machine-wide configuration.
    $env:Path = "$phaseRustBin;$env:Path"
}

$phaseWorkspace = Split-Path -Parent $PSScriptRoot
$phaseTauriCli = Join-Path $phaseWorkspace "node_modules\.bin\tauri.cmd"

if (-not (Test-Path -LiteralPath $phaseTauriCli)) {
    throw "The local Tauri CLI is missing. Run npm install first."
}

& $phaseTauriCli @TauriArguments
exit $LASTEXITCODE

