#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$SCRIPT_DIR"

MODE="validate"
RUNTIME="win-x64"
CONFIGURATION="Release"
OUTPUT_DIR="release/lanka-pos-win-x64"
SKIP_NPM_CI=0
FRAMEWORK_DEPENDENT=0
NO_ZIP=0

usage() {
  cat <<'EOF'
Usage:
  ./setup.sh [options]

Modes:
  --validate             Validate current packaged setup (default)
  --package              Build client package via scripts/package-client.ps1

Options:
  --runtime <value>      Runtime for package mode (default: win-x64)
  --configuration <val>  Build configuration for package mode (default: Release)
  --output-dir <path>    Package output dir relative to repo root (default: release/lanka-pos-win-x64)
  --skip-npm-ci          Skip npm ci in package mode
  --framework-dependent  Build framework-dependent backend package
  --no-zip               Skip zip output in package mode
  -h, --help             Show this help

Notes:
  Setup/install does not prompt for activation code.
  Activation key is used later in the POS activation screen.
EOF
}

log() {
  printf '[setup] %s\n' "$1"
}

warn() {
  printf '[setup] WARN: %s\n' "$1" >&2
}

fail() {
  printf '[setup] ERROR: %s\n' "$1" >&2
  exit 1
}

resolve_pwsh() {
  if command -v pwsh >/dev/null 2>&1; then
    printf '%s\n' "pwsh"
    return 0
  fi

  if command -v powershell >/dev/null 2>&1; then
    printf '%s\n' "powershell"
    return 0
  fi

  return 1
}

require_file() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    warn "Missing file: ${path#$REPO_ROOT/}"
    return 1
  fi

  log "OK file: ${path#$REPO_ROOT/}"
  return 0
}

validate_setup() {
  local package_dir="$REPO_ROOT/$OUTPUT_DIR"
  local install_script="$package_dir/Install-SmartPOS-Service.ps1"
  local pwsh_cmd
  local missing=0

  log "Validating package at ${package_dir#$REPO_ROOT/}"

  if [[ ! -d "$package_dir" ]]; then
    fail "Package directory not found: ${package_dir#$REPO_ROOT/}. Build it with: ./setup.sh --package"
  fi

  local required_files=(
    "$package_dir/app/backend.exe"
    "$package_dir/Install-SmartPOS-Service.ps1"
    "$package_dir/Install-SmartPOS-Service.bat"
    "$package_dir/Start-SmartPOS.bat"
    "$package_dir/Generate-Offline-Activation-Codes.bat"
    "$package_dir/README-CLIENT.txt"
  )

  for file_path in "${required_files[@]}"; do
    if ! require_file "$file_path"; then
      missing=1
    fi
  done

  if ! pwsh_cmd="$(resolve_pwsh)"; then
    fail "PowerShell is required for script validation. Install pwsh and retry."
  fi

  if [[ -f "$install_script" ]]; then
    log "Validating PowerShell syntax for Install-SmartPOS-Service.ps1"
    INSTALL_SCRIPT_PATH="$install_script" \
      "$pwsh_cmd" -NoProfile -Command '$path = [string]$env:INSTALL_SCRIPT_PATH; $null = [scriptblock]::Create((Get-Content -LiteralPath $path -Raw)); "POWERSHELL_PARSE_OK"' >/dev/null
  fi

  if [[ "$missing" -ne 0 ]]; then
    fail "Setup validation failed due to missing required files."
  fi

  log "Validation passed."
  log "Installer setup is separate from activation. Generate keys with Generate-Offline-Activation-Codes.bat and activate inside POS."
}

build_package() {
  local pwsh_cmd
  local package_script="$REPO_ROOT/scripts/package-client.ps1"

  if [[ ! -f "$package_script" ]]; then
    fail "Package script not found: scripts/package-client.ps1"
  fi

  if ! pwsh_cmd="$(resolve_pwsh)"; then
    fail "PowerShell is required to build package. Install pwsh and retry."
  fi

  log "Building client package to $OUTPUT_DIR"
  local args=(
    -NoProfile
    -ExecutionPolicy
    Bypass
    -File
    "$package_script"
    -Runtime
    "$RUNTIME"
    -Configuration
    "$CONFIGURATION"
    -OutputDir
    "$OUTPUT_DIR"
  )

  if [[ "$SKIP_NPM_CI" -eq 1 ]]; then
    args+=(-SkipNpmCi)
  fi
  if [[ "$FRAMEWORK_DEPENDENT" -eq 1 ]]; then
    args+=(-FrameworkDependent)
  fi
  if [[ "$NO_ZIP" -eq 1 ]]; then
    args+=(-NoZip)
  fi

  "$pwsh_cmd" "${args[@]}"
  log "Package build complete."
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --validate)
      MODE="validate"
      shift
      ;;
    --package)
      MODE="package"
      shift
      ;;
    --runtime)
      [[ $# -ge 2 ]] || fail "--runtime requires a value"
      RUNTIME="$2"
      shift 2
      ;;
    --configuration)
      [[ $# -ge 2 ]] || fail "--configuration requires a value"
      CONFIGURATION="$2"
      shift 2
      ;;
    --output-dir)
      [[ $# -ge 2 ]] || fail "--output-dir requires a value"
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --skip-npm-ci)
      SKIP_NPM_CI=1
      shift
      ;;
    --framework-dependent)
      FRAMEWORK_DEPENDENT=1
      shift
      ;;
    --no-zip)
      NO_ZIP=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown option: $1"
      ;;
  esac
done

case "$MODE" in
  validate)
    validate_setup
    ;;
  package)
    build_package
    ;;
  *)
    fail "Unsupported mode: $MODE"
    ;;
esac
