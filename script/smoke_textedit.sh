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

SMOKE_HOME="$(mktemp -d "${TMPDIR:-/tmp}/operel-textedit-smoke.XXXXXX")"
CONFIG_PATH="$SMOKE_HOME/config.toml"
cat >"$CONFIG_PATH" <<'TOML'
[apps]
allowed = ["TextEdit"]
denied = ["System Settings", "Keychain Access"]

[policy]
require_confirmation_for_risky_actions = true
redact_sensitive_text_in_logs = true
TOML

export OPEREL_COMPUTER_USE_CONFIG="$CONFIG_PATH"
export OPEREL_COMPUTER_USE_HOME="$SMOKE_HOME"

DOCTOR_JSON="$(node dist/cli.js doctor --json)"
echo "$DOCTOR_JSON"

node --input-type=module <<'NODE'
import { createComputerUseServer } from "./dist/mcp/server.js";
import { ArtifactStore } from "./dist/core/artifacts.js";
import { SessionStore } from "./dist/core/session.js";
import { PolicyEngine } from "./dist/core/policy.js";
import { loadConfig } from "./dist/core/config.js";

const config = loadConfig(process.env.OPEREL_COMPUTER_USE_CONFIG);
const server = createComputerUseServer({
  sessionStore: new SessionStore(),
  artifactStore: new ArtifactStore({ root: process.env.OPEREL_COMPUTER_USE_HOME }),
  policy: new PolicyEngine({ apps: config.apps }),
});

const tool = server["_registeredTools"];
async function call(name, args) {
  const registered = tool[name];
  if (!registered) throw new Error(`missing tool: ${name}`);
  const result = await registered.handler(args, {});
  const structured = result.structuredContent;
  if (!structured) {
    throw new Error(`${name} returned no structuredContent: ${JSON.stringify(result)}`);
  }
  if (structured.error) {
    throw new Error(`${name} failed: ${JSON.stringify(structured.error)}`);
  }
  return structured;
}

const status = await call("status", {});
await call("act", {
  trace_id: status.trace_id,
  action: { type: "open_app", app: "TextEdit" },
});
const observation = await call("observe", {
  trace_id: status.trace_id,
  target: { app: "TextEdit" },
  include_screenshot: true,
  include_accessibility_tree: true,
  max_tree_depth: 3,
});
const observedElements = observation.elements ?? [];
if (!observedElements.some((element) => typeof element.element_id === "string" && element.element_id.startsWith("el_"))) {
  throw new Error("observe did not return session-scoped element_id values");
}
await call("act", {
  trace_id: status.trace_id,
  session_id: observation.session_id,
  action: {
    type: "type_text",
    text: `hello from operel smoke ${new Date().toISOString()}`,
  },
});
const exported = await call("log", {
  trace_id: status.trace_id,
  session_id: observation.session_id,
  format: "bundle",
});
await call("stop", {
  trace_id: status.trace_id,
  session_id: observation.session_id,
});

console.log(JSON.stringify({
  trace_id: status.trace_id,
  session_id: observation.session_id,
  export_uri: exported.uri,
  manifest_path: exported.manifest_path,
  audit_path: exported.audit_path,
}, null, 2));

await server.close();
NODE
