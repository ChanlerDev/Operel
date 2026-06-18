#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-run}"
APP_NAME="OperelRuntime"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ensure_node_tools() {
  if command -v npm >/dev/null 2>&1; then
    return
  fi

  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [[ -s "$NVM_DIR/nvm.sh" ]]; then
    # shellcheck disable=SC1091
    source "$NVM_DIR/nvm.sh"
  fi
}

build_all() {
  ensure_node_tools
  npm install
  npm run build
  (cd macos && swift build)
}

pkill -x "$APP_NAME" >/dev/null 2>&1 || true

case "$MODE" in
  run)
    build_all
    node dist/cli.js doctor --json
    ;;
  --debug|debug)
    build_all
    lldb -- "$(cd macos && swift build --show-bin-path)/$APP_NAME"
    ;;
  --logs|logs)
    build_all
    node dist/cli.js doctor --json
    /usr/bin/log stream --info --style compact --predicate "process == \"$APP_NAME\""
    ;;
  --telemetry|telemetry)
    build_all
    node dist/cli.js doctor --json
    /usr/bin/log stream --info --style compact --predicate "process == \"$APP_NAME\""
    ;;
  --verify|verify)
    build_all
    node dist/cli.js --help >/dev/null
    node dist/cli.js call runtime.ping >/dev/null
    ;;
  *)
    echo "usage: $0 [run|--debug|--logs|--telemetry|--verify]" >&2
    exit 2
    ;;
esac
