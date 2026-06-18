#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v npm >/dev/null 2>&1; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [[ -s "$NVM_DIR/nvm.sh" ]]; then
    # shellcheck disable=SC1091
    source "$NVM_DIR/nvm.sh"
  fi
fi

npm install >/dev/null
npm run build >/dev/null
(cd macos && swift build >/dev/null)

HELPER_PATH="$(cd macos && swift build --show-bin-path)/OperelRuntime"
IDENTITY="${OPEREL_CODESIGN_IDENTITY:--}"

run_codesign_with_timeout() {
  local timeout_seconds="${OPEREL_CODESIGN_TIMEOUT_SECONDS:-30}"
  /usr/bin/codesign --force --timestamp=none --sign "$IDENTITY" "$HELPER_PATH" >/dev/null &
  local pid="$!"
  local elapsed=0

  while kill -0 "$pid" >/dev/null 2>&1; do
    if (( elapsed >= timeout_seconds )); then
      kill "$pid" >/dev/null 2>&1 || true
      wait "$pid" >/dev/null 2>&1 || true
      echo "codesign timed out after ${timeout_seconds}s for $HELPER_PATH" >&2
      exit 2
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done

  wait "$pid"
}

run_codesign_with_timeout

DOCTOR_JSON="$(node dist/cli.js doctor --json)"
echo "$DOCTOR_JSON"

DOCTOR_JSON="$DOCTOR_JSON" node --input-type=module <<'NODE'
const result = JSON.parse(process.env.DOCTOR_JSON ?? "{}");
if (result?.helper_status !== "ok") {
  throw new Error(`expected helper_status=ok, got ${result?.helper_status}`);
}
const expectedStatus = process.env.OPEREL_CODESIGN_IDENTITY ? "signed" : "adhoc";
if (result?.code_signing?.status !== expectedStatus) {
  throw new Error(`expected code_signing.status=${expectedStatus}, got ${result?.code_signing?.status}`);
}
if (expectedStatus === "signed" && (!result?.code_signing?.identity || result.code_signing.identity === "adhoc")) {
  throw new Error(`expected non-ad-hoc signing identity, got ${result?.code_signing?.identity}`);
}
NODE
