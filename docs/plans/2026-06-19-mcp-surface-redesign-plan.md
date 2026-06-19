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

### Task 1: Introduce trace model

- [ ] Add `trace_id` to session/audit artifacts.
- [ ] Auto-create default trace on first tool call.
- [ ] Return `trace_id` from every public tool.
- [ ] Keep `session_id` internally as compatibility state.

### Task 2: Introduce observation model

- [ ] Add `observation_id` to `observe`.
- [ ] Bind `element_id` cache to `observation_id`.
- [ ] Update stale element errors to mention observation refresh.

### Task 3: Add stable tools

- [ ] Add `status`.
- [ ] Add `act` with typed action union.
- [ ] Add `stop`.
- [ ] Add `log`.
- [ ] Keep legacy tools hidden from README happy path.

### Task 4: Move policy/audit to stable tool boundary

- [ ] Ensure `act` handles app policy, action policy, pre/post observe, artifacts, and audit.
- [ ] Ensure `stop` records modifier release and clipboard restoration.
- [ ] Ensure `log` can return summary and export bundle.

### Task 5: Tests and smoke

- [ ] Update MCP `tools/list` contract to include stable tools.
- [ ] Add compatibility tests for legacy tools.
- [ ] Add smoke that completes TextEdit task using only `status`, `observe`, `act`, `log`.
- [ ] Keep current runtime tests unchanged.

### Task 6: Documentation

- [ ] Make README happy path use only stable tools.
- [ ] Move legacy tool schema to a compatibility appendix.
- [ ] Update release gate to include stable-tool smoke.

## Non-goals

- Do not add a high-level autonomous `run_task` loop yet.
- Do not promise background parallel desktop control.
- Do not remove legacy tools before the stable-tool smoke passes.
