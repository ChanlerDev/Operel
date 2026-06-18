# Computer Use Implementation Plan

> **For agentic workers:** REQUIRED: Use subagent-driven development if subagents are available. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Mac-first Computer Use runtime exposed through MCP, with safe app-scoped desktop observation and action execution.

**Architecture:** A TypeScript MCP/CLI layer owns protocol, configuration, audit, and packaging. A Swift macOS helper owns ScreenCaptureKit, Accessibility, input injection, app/window control, and permission checks. The core session engine sits between them and records every action as an auditable step.

**Tech Stack:** TypeScript, Node.js, MCP SDK, Swift Package Manager, ScreenCaptureKit, ApplicationServices Accessibility API, CoreGraphics CGEvent, TOML config, JSONL audit logs.

---

## File Structure

Expected future files:

- `package.json`: Node CLI and test scripts.
- `src/cli.ts`: command router for `mcp`, `doctor`, `call`, install commands.
- `src/mcp/server.ts`: MCP server adapter and tool/resource registration.
- `src/core/session.ts`: session lifecycle and step orchestration.
- `src/core/policy.ts`: app/action policy.
- `src/core/artifacts.ts`: artifact URI, storage and export.
- `src/runtime/client.ts`: JSON-RPC client for Swift helper.
- `macos/Package.swift`: Swift package.
- `macos/Sources/OperelRuntime/main.swift`: helper entrypoint.
- `macos/Sources/OperelRuntime/Permissions.swift`: TCC checks.
- `macos/Sources/OperelRuntime/ScreenCapture.swift`: screenshot capture.
- `macos/Sources/OperelRuntime/AccessibilityTree.swift`: AX tree extraction.
- `macos/Sources/OperelRuntime/InputExecutor.swift`: click, key, scroll, drag, type.
- `tests/`: unit and MCP contract tests.
- `fixtures/`: accessibility tree and policy fixtures.

Before coding, implementers must read:

- [入口与使用方式](../entrypoints.md)
- [MCP 接口契约](../mcp-api.md)
- [运行时协议](../runtime-protocol.md)
- [macOS 运行时](../macos-runtime.md)
- [安全与权限设计](../security-permissions.md)

## Chunk 1: Project Bootstrap

### Task 1: Create CLI skeleton

- [x] Create Node package with TypeScript build.
- [x] Add `operel-computer-use` bin.
- [x] Implement `--help`, `mcp`, `doctor`, `call` command routing.
- [x] Add unit test for command parsing.
- [x] Commit: `feat: scaffold computer use cli`

### Task 2: Create Swift runtime helper skeleton

- [x] Create Swift package under `macos/`.
- [x] Implement JSON line request/response loop over stdio.
- [x] Add `runtime.ping` method.
- [x] Add Node runtime client that starts helper subprocess.
- [x] Add integration test for ping.
- [x] Commit: `feat: add macos runtime helper`

## Chunk 2: MCP Surface

### Task 3: Register MCP tools and resources

- [x] Add MCP SDK.
- [x] Implement tools from [MCP 接口契约](../mcp-api.md).
- [ ] Start with fake runtime only for contract tests.
- [x] Return stable error shape.
- [x] Add `tools/list` snapshot tests.
- [x] Commit: `feat: expose computer use mcp tools`

### Task 4: Implement session engine

- [x] Create session ids, step ids and status transitions.
- [x] Add per-session element cache placeholder.
- [x] Ensure same session actions are serialized.
- [x] Add timeout and cancel support.
- [ ] Commit: `feat: add computer use sessions`

## Chunk 3: macOS Observation

### Task 5: Permission doctor

- [x] Implement Screen Recording permission check.
- [x] Implement Accessibility trust check.
- [x] Implement window listing capability check.
- [x] Print actionable `doctor` output.
- [x] Add tests for parsing helper responses.
- [x] Commit: `feat: add macos permission doctor`

### Task 6: Screenshot capture

- [x] Implement full display screenshot.
- [ ] Add window/app screenshot if available.
- [x] Return dimensions, scale and artifact bytes.
- [x] Store screenshot artifacts from Node core.
- [x] Commit: `feat: capture macos screenshots`

### Task 7: Accessibility tree extraction

- [x] Read active app/window tree.
- [x] Normalize role, label, title, value, frame and enabled state.
- [x] Apply depth/node limits.
- [x] Redact sensitive values.
- [x] Generate short-lived element ids.
- [x] Commit: `feat: observe macos accessibility tree`

## Chunk 4: Actions

### Task 8: App and window activation

- [x] List running apps and windows.
- [x] Activate app by name or bundle id.
- [x] Wait for active app/window.
- [x] Enforce app policy before activation.
- [x] Commit: `feat: control macos app activation`

### Task 9: Basic input execution

- [x] Implement `click`, `press_key`, `type_text`, `scroll`.
- [x] Prefer Accessibility action when target has element id.
- [x] Fall back to CGEvent only when target is coordinate-based.
- [x] Add post-action observe.
- [x] Commit: `feat: execute basic desktop actions`

### Task 10: Target resolution

- [x] Resolve element id, selector, text target and coordinates.
- [x] Return ambiguity with candidates.
- [x] Detect stale elements.
- [x] Add fixture tests for common ambiguity cases.
- [x] Commit: `feat: resolve computer use targets`

## Chunk 5: Safety and Audit

### Task 11: App and action policy

- [x] Parse `~/.operel/computer-use/config.toml`.
- [x] Implement allow/deny/prompt policy.
- [ ] Add risk classifier for sensitive and destructive actions.
- [x] Return `approval_required` without executing risky actions.
- [x] Commit: `feat: enforce computer use policy`

### Task 12: Artifact and audit store

- [x] Write audit JSONL per session.
- [x] Save screenshots and tree snapshots.
- [x] Redact sensitive tool inputs.
- [x] Implement `export_session`.
- [x] Commit: `feat: record computer use audit artifacts`

## Chunk 6: Verification and Packaging

### Task 13: Real Mac smoke

- [ ] Run `doctor` on a signed local build.
- [x] Grant Screen Recording and Accessibility.
- [x] Run TextEdit observe/type smoke.
- [x] Export session and inspect artifacts.
- [ ] Document exact commands in release notes.
- [ ] Commit: `test: add macos smoke checklist`

### Task 14: Agent integration smoke

- [ ] Install MCP config for Codex.
- [ ] Install MCP config for Claude Code or another MCP client.
- [x] Verify `tools/list`.
- [x] Run one low-risk GUI task.
- [x] Commit: `test: add agent integration smoke`

## Release Gate

Do not call the project usable until:

- `doctor` explains missing permissions correctly.
- `list_apps`, `observe`, `click`, `type_text`, `press_key`, `scroll`, `export_session` work through MCP.
- TextEdit smoke passes on a real Mac.
- app deny blocks execution.
- risky action returns approval instead of executing.
- session export contains audit and artifacts.

## MVP Definition

MVP is exactly this slice:

- `operel-computer-use mcp` starts a valid MCP server over stdio.
- `operel-computer-use doctor` reports Screen Recording and Accessibility state.
- `start_session`, `list_apps`, `observe`, `open_app`, `click`, `type_text`, `press_key`, `scroll`, `wait`, `recover`, `export_session`, `close_session`, `cancel_session` work through MCP.
- Swift helper supports `runtime.ping`, `permissions.check`, `apps.list`, `app.activate`, `screen.capture`, `ax.read_tree`, `input.click`, `input.type_text`, `input.press_key`, `input.scroll`, `input.release_modifiers`.
- TextEdit smoke passes on a real Mac with granted permissions.
- Denied app action is blocked before runtime execution.
- Sensitive text and clipboard content are redacted from audit.
