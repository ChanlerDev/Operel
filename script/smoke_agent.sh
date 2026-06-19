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

SMOKE_HOME="$(mktemp -d "${TMPDIR:-/tmp}/operel-agent-smoke.XXXXXX")"
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
export OPEREL_RUNTIME_HELPER="$ROOT_DIR/macos/.build/debug/OperelRuntime"

node --input-type=module <<'NODE'
import { existsSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const env = Object.fromEntries(
  Object.entries(process.env).filter((entry) => typeof entry[1] === "string"),
);
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/cli.js", "mcp"],
  cwd: process.cwd(),
  env,
  stderr: "pipe",
});
const client = new Client(
  { name: "operel-agent-smoke", version: "0.1.0" },
  { capabilities: {} },
);

async function call(name, args) {
  const result = await client.callTool({ name, arguments: args });
  const structured = result.structuredContent;
  if (!structured) {
    throw new Error(`${name} returned no structuredContent: ${JSON.stringify(result)}`);
  }
  if (structured?.error) {
    throw new Error(`${name} failed: ${JSON.stringify(structured.error)}`);
  }
  return structured;
}

try {
  await client.connect(transport);

  const tools = await client.listTools();
  const toolNames = new Set(tools.tools.map((tool) => tool.name));
  for (const name of ["status", "observe", "act", "stop", "log"]) {
    if (!toolNames.has(name)) {
      throw new Error(`missing MCP tool: ${name}`);
    }
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
      text: `hello from operel agent smoke ${new Date().toISOString()}`,
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

  if (!existsSync(exported.manifest_path) || !existsSync(exported.audit_path)) {
    throw new Error("log did not write manifest and audit files");
  }

  console.log(JSON.stringify({
    trace_id: status.trace_id,
    session_id: observation.session_id,
    export_uri: exported.uri,
    manifest_path: exported.manifest_path,
    audit_path: exported.audit_path,
  }, null, 2));
} finally {
  await client.close();
}
NODE
