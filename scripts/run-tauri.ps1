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
$phaseEnvFile = Join-Path $phaseWorkspace ".env"

if (Test-Path -LiteralPath $phaseEnvFile) {
    Get-Content -LiteralPath $phaseEnvFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
            $name, $value = $line -split "=", 2
            $name = $name.Trim()
            $value = $value.Trim()
            if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
                $value = $value.Substring(1, $value.Length - 2)
            }
            if (-not [string]::IsNullOrEmpty($name)) {
                [Environment]::SetEnvironmentVariable($name, $value, "Process")
                Set-Item -Path "env:$name" -Value $value
            }
        }
    }

    if ($env:TAURI_SIGNING_PRIVATE_KEY_PATH -and -not $env:TAURI_SIGNING_PRIVATE_KEY) {
        $env:TAURI_SIGNING_PRIVATE_KEY = $env:TAURI_SIGNING_PRIVATE_KEY_PATH
        [Environment]::SetEnvironmentVariable("TAURI_SIGNING_PRIVATE_KEY", $env:TAURI_SIGNING_PRIVATE_KEY_PATH, "Process")
    }
}

if (-not (Test-Path -LiteralPath $phaseTauriCli)) {
    throw "The local Tauri CLI is missing. Run npm install first."
}

& $phaseTauriCli @TauriArguments
exit $LASTEXITCODE

