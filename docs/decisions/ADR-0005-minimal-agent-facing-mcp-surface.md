# ADR-0005: Keep The Agent-Facing MCP Surface Small

## Status

Accepted

## Context

The first implementation exposed many low-level runtime operations as MCP tools:

- `start_session`
- `close_session`
- `cancel_session`
- `list_apps`
- `list_windows`
- `observe`
- `open_app`
- `activate_window`
- `click`
- `type_text`
- `press_key`
- `scroll`
- `wait`
- `recover`
- `export_session`
- `permission_check`

This is mechanically convenient, but it is not a good product surface for an AI Agent. It makes the agent manage implementation details that a Computer Use app should own: session ids, active-window bookkeeping, recovery sequencing, modifier cleanup, audit grouping, app/window listing, and artifact export.

A Computer Use app is not a bag of OS primitives. Its product job is to let an agent observe the desktop, request a UI action, get a verified result, stop safely, and retrieve logs. The app should hide runtime internals behind a small set of stable intent-level tools.

## Decision

The stable agent-facing MCP surface should converge to these tools:

| Tool | Purpose |
| --- | --- |
| `status` | Return readiness, permissions, active app/window, policy summary, and current trace id. Replaces `permission_check`, most `list_apps`, and most `list_windows` usage. |
| `observe` | Return the current desktop/app/window observation: screenshot artifact, normalized elements, active target, observation id, and warnings. |
| `act` | Execute one atomic UI intent: `open_app`, `focus`, `click`, `type_text`, `press_key`, `scroll`, `wait`, or `recover`. Replaces separate action tools. |
| `stop` | Cancel the current action, release modifiers, and put the runtime into a safe state. Replaces public `cancel_session` plus most explicit `recover` usage. |
| `log` | Return or export trace/audit/artifact information. Replaces public `export_session`. |

The legacy fine-grained tools can remain temporarily as compatibility aliases or debug tools, but they should not be documented as the preferred product surface.

## Session And Log Semantics

Public `session_id` should not be part of the happy-path agent workflow.

Instead:

- The server creates a `trace_id` automatically for each MCP connection or first tool call.
- Every tool result includes `trace_id`.
- Logs, artifacts, policy decisions, and failures are grouped by `trace_id`.
- The caller may pass `trace_id` only when it explicitly wants to join an existing trace.
- `observe` returns an `observation_id`; element ids are valid within that observation or until the next observation invalidates them.
- A real public `session_id` is only justified if it represents an explicit desktop-control lease: app/window lock, policy snapshot, timeout, cancellation, and human-visible ownership.

In other words: logging does not require user-managed sessions. If logs are the only reason for a session, the server should just log.

## Tool Boundary

`act` should accept a typed action object:

```json
{
  "trace_id": "trace_...",
  "action": {
    "type": "click",
    "target": { "element_id": "el_...", "label": "Save" }
  }
}
```

Examples:

- `{ "type": "open_app", "app": "TextEdit" }`
- `{ "type": "focus", "window_id": "win_..." }`
- `{ "type": "click", "target": { "element_id": "el_..." } }`
- `{ "type": "type_text", "text": "hello", "sensitive": false }`
- `{ "type": "press_key", "key": "S", "modifiers": ["cmd"] }`
- `{ "type": "scroll", "delta_y": -400 }`
- `{ "type": "wait", "seconds": 1 }`
- `{ "type": "recover" }`

This preserves expressiveness without exposing each primitive as its own public tool.

## Consequences

- Fewer tools means less agent planning overhead and less schema confusion.
- App/window listing becomes observation/status data, not a separate common workflow.
- `session_id` becomes an internal implementation detail or an optional trace/lease concept.
- Audit remains complete because every call is still recorded under `trace_id`.
- The runtime can still keep internal primitives; they just stop being the main MCP product contract.
- Migration should keep current tools for compatibility until tests and docs are updated to the small surface.
