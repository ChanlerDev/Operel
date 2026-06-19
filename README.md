# Operel Computer Use

Mac-first Computer Use runtime for AI agents. Operel exposes a stable MCP server backed by a TypeScript core and a Swift macOS helper for screen observation, Accessibility tree extraction, app/window control, input execution, policy checks, artifacts, and audit export.

## Status

The MVP implementation is complete and verified on macOS with granted Screen Recording and Accessibility permissions.

Implemented today:

- MCP server entrypoint: `operel-computer-use mcp`
- CLI diagnostics: `operel-computer-use doctor`
- Local debug calls: `operel-computer-use call <tool>`
- MCP config installers: `operel-computer-use install codex` and `operel-computer-use install claude`
- Swift runtime helper: permissions, apps/windows, screenshots, scoped screenshots, AX tree, activation, click, type text, key press, scroll, modifier recovery
- Session engine: session lifecycle, element ids, serialized actions, cancel, timeouts, audit/export
- Safety: app policy, sensitive/destructive/external action classification, redacted audit/artifacts
- Smoke gates: signed doctor, TextEdit GUI smoke, MCP agent smoke

Current API shape:

- The stable agent-facing MCP surface is five tools: `status`, `observe`, `act`, `stop`, and `log`.
- The server still exposes fine-grained runtime tools such as `start_session`, `list_apps`, `click`, `type_text`, `press_key`, `scroll`, `recover`, and `export_session` as compatibility/debug tools.
- `session_id` is no longer the preferred happy-path API. Logs and artifacts should be grouped by an automatic `trace_id`; element ids should be scoped by `observation_id`; a public `session_id` only makes sense when it represents an explicit desktop-control lease.
- See [ADR-0005](./docs/decisions/ADR-0005-minimal-agent-facing-mcp-surface.md) and [MCP API](./docs/mcp-api.md).

Target MCP entrypoints:

```text
status  -> check readiness, permissions, active target, policy, current trace
observe -> capture screenshot, accessibility elements, active app/window, observation_id
act     -> execute one atomic UI intent through one policy/audit boundary
stop    -> cancel active work, release modifiers, restore safe runtime state
log     -> read or export trace logs, screenshots, artifacts, and audit events
```

## Tech Stack

- TypeScript + Node.js for CLI, MCP server, policy, sessions, artifacts, tests
- SwiftPM macOS helper using Accessibility, CoreGraphics, ImageIO, AppKit
- MCP SDK for agent integration
- Vitest for TypeScript tests

## Install

```bash
npm install
npm run build
(cd macos && swift build)
```

During local development, commands run from the repo root. The packaged binary name is `operel-computer-use` via `package.json#bin` after building.

## Use

Start the MCP server:

```bash
operel-computer-use mcp
```

Install MCP config for Codex:

```bash
operel-computer-use install codex
```

Install MCP config for Claude Code:

```bash
operel-computer-use install claude
```

Run diagnostics:

```bash
operel-computer-use doctor --json
```

Debug a runtime method locally:

```bash
operel-computer-use call runtime.ping
operel-computer-use call status
operel-computer-use call observe --args '{"target":{"app":"TextEdit"},"include_screenshot":true}'
operel-computer-use call act --args '{"action":{"type":"type_text","text":"hello from operel"}}'
operel-computer-use call log --args '{"format":"summary"}'
```

## Verification

Full local gate:

```bash
npm run typecheck
npm run build
npm test
(cd macos && swift build)
./script/build_and_run.sh --verify
npm run smoke:signed-doctor
npm run smoke:agent
npm run smoke:textedit
```

`smoke:textedit` requires macOS Screen Recording and Accessibility permissions.

## Docs

- [Technical docs](./docs/README.md)
- [MCP API](./docs/mcp-api.md)
- [Runtime protocol](./docs/runtime-protocol.md)
- [macOS runtime](./docs/macos-runtime.md)
- [Security and permissions](./docs/security-permissions.md)
- [Release checklist](./docs/release-notes.md)
- [Implementation plan](./docs/plans/2026-06-18-computer-use-implementation-plan.md)
