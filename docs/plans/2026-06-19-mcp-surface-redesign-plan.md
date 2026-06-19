# MCP Surface Redesign Plan

## Goal

Move Operel from a runtime-primitive MCP surface to an app-like Computer Use surface.

Current problem:

- Too many tools expose internal runtime modules.
- Agent has to manage `session_id`, app/window discovery, activation, recovery, and export sequencing.
- Session mostly acts as a log bucket and element cache, which the server can manage without forcing it into every prompt plan.

Target surface:

- `status`
- `observe`
- `act`
- `stop`
- `log`

## Principles

- Agent chooses intent; Operel owns mechanics.
- Trace/logging is automatic.
- `observation_id` owns `element_id` freshness.
- Public `session_id` is only for an explicit desktop-control lease.
- Fine-grained tools remain as compatibility aliases until the new tools are tested through real smoke.

## Migration Tasks

Status: implemented for the MCP server surface. Trace is exposed on stable tools; legacy compatibility tools still use their original session-centered response shape.

### Task 1: Introduce trace model

- [x] Add `trace_id` to stable tool results.
- [x] Auto-create default trace on stable tool calls.
- [x] Keep `session_id` internally as compatibility state.
- [ ] Add trace-native artifact paths if legacy session exports are removed later.

### Task 2: Introduce observation model

- [x] Add `observation_id` to `observe`.
- [x] Return `session_id` from `observe` for compatibility with element cache.
- [x] Update stable stale element errors to mention observation refresh.
- [ ] Bind `element_id` cache directly to `observation_id` after replacing legacy session cache.

### Task 3: Add stable tools

- [x] Add `status`.
- [x] Add `act` with typed action union.
- [x] Add `stop`.
- [x] Add `log`.
- [x] Keep legacy tools out of README happy path.

### Task 4: Move policy/audit to stable tool boundary

- [x] Ensure `act` handles app policy, action policy, post observe, artifacts, and audit through the existing session engine.
- [x] Ensure `stop` records modifier release through the existing session engine when a session is supplied.
- [x] Ensure `log` can return summary and export bundle.

### Task 5: Tests and smoke

- [x] Update MCP `tools/list` contract to include stable tools.
- [x] Keep compatibility tests for legacy tools.
- [x] Update agent smoke to use only `status`, `observe`, `act`, `log`, and `stop`.
- [x] Keep current runtime tests unchanged.

### Task 6: Documentation

- [x] Make README happy path use only stable tools.
- [x] Move legacy tool schema under compatibility section.
- [x] Update release gate to include stable-tool smoke.

## Non-goals

- Do not add a high-level autonomous `run_task` loop yet.
- Do not promise background parallel desktop control.
- Do not remove legacy tools before the stable-tool smoke passes.
