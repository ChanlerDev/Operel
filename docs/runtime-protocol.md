# 运行时协议

## 目标

Node/TypeScript core 负责 MCP、policy、session、artifact 和 audit。Swift helper 负责 macOS 原生能力。两者之间使用一条稳定的 JSON line RPC 协议，方便测试、替换和独立调试。

## Transport

首版使用 stdio：

- Node 作为 parent process 启动 Swift helper。
- 每行一个 JSON request 或 response。
- 所有 payload 必须 UTF-8。
- 大二进制不要直接塞进 JSON；截图以临时文件路径或 base64 chunk 返回，Node 写入 artifact store。

Future options:

- XPC service：适合 signed app bundle。
- Unix domain socket：适合长期 daemon。

## Request

```json
{
  "jsonrpc": "2.0",
  "id": "req_...",
  "method": "screen.capture",
  "params": {
    "scope": "active_window"
  }
}
```

## Response

```json
{
  "jsonrpc": "2.0",
  "id": "req_...",
  "result": {
    "ok": true
  }
}
```

Error:

```json
{
  "jsonrpc": "2.0",
  "id": "req_...",
  "error": {
    "code": "permission_missing",
    "message": "Screen Recording permission is missing.",
    "details": {
      "permission": "screen_recording"
    }
  }
}
```

Runtime error codes must map directly to MCP error codes where possible.

## Methods

### `runtime.ping`

Health check.

Result:

```json
{
  "version": "0.1.0",
  "platform": "macos",
  "pid": 12345
}
```

### `permissions.check`

Checks system permission state.

Result:

```json
{
  "screen_recording": "granted",
  "accessibility": "missing",
  "automation": "unknown",
  "input_monitoring": "not_requested"
}
```

### `apps.list`

Lists running apps and windows.

Result:

```json
{
  "apps": [
    {
      "app_id": "app_...",
      "name": "TextEdit",
      "bundle_id": "com.apple.TextEdit",
      "pid": 123,
      "is_active": true,
      "windows": [
        {
          "window_id": "win_...",
          "title": "Untitled",
          "bounds": { "x": 100, "y": 80, "width": 900, "height": 700 }
        }
      ]
    }
  ]
}
```

### `app.activate`

Params:

```json
{
  "app": "TextEdit",
  "bundle_id": "com.apple.TextEdit",
  "window_id": "win_..."
}
```

Result:

```json
{
  "active_app": "TextEdit",
  "active_window_id": "win_..."
}
```

### `screen.capture`

Params:

```json
{
  "scope": "display | app | window | rect",
  "app": "TextEdit",
  "window_id": "win_...",
  "rect": { "x": 0, "y": 0, "width": 800, "height": 600 },
  "format": "png"
}
```

Result:

```json
{
  "tmp_path": "/var/folders/.../capture.png",
  "width": 1512,
  "height": 982,
  "pixel_width": 3024,
  "pixel_height": 1964,
  "scale": 2,
  "display_id": 1,
  "coordinate_space": "logical_points"
}
```

### `ax.read_tree`

Params:

```json
{
  "app": "TextEdit",
  "window_id": "win_...",
  "max_depth": 8,
  "max_nodes": 1000
}
```

Result:

```json
{
  "tree_id": "tree_...",
  "nodes": [
    {
      "runtime_handle": "ax_...",
      "role": "AXButton",
      "label": "Save",
      "value": null,
      "enabled": true,
      "frame": { "x": 100, "y": 88, "width": 72, "height": 28 },
      "children": []
    }
  ]
}
```

`runtime_handle` is opaque and only valid inside the helper process for the current session.

### `input.click`

Params:

```json
{
  "runtime_handle": "ax_...",
  "x": 120,
  "y": 100,
  "button": "left",
  "click_count": 1
}
```

If `runtime_handle` is present, helper should prefer AX action. If only coordinates are present, helper uses CGEvent.

### `input.type_text`

Params:

```json
{
  "runtime_handle": "ax_...",
  "text": "hello",
  "strategy": "auto | ax_set_value | paste | key_events",
  "sensitive": false
}
```

Result:

```json
{
  "strategy_used": "paste",
  "clipboard_restored": true
}
```

### `input.press_key`

Params:

```json
{
  "key": "S",
  "modifiers": ["cmd"]
}
```

### `input.scroll`

Params:

```json
{
  "x": 400,
  "y": 500,
  "delta_x": 0,
  "delta_y": -500
}
```

### `input.drag`

Params:

```json
{
  "from": { "x": 100, "y": 100 },
  "to": { "x": 500, "y": 500 },
  "duration_ms": 300
}
```

### `input.release_modifiers`

Best-effort recovery method. Must be safe to call multiple times.

Result:

```json
{
  "released": ["cmd", "shift", "option", "control"]
}
```

## Invariants

- Helper never applies product policy. Policy belongs in Node core.
- Helper never writes audit logs. Node core records all calls and results.
- Helper must not click or type if app/window focus no longer matches request metadata.
- Node must not expose `runtime_handle` directly as stable public API; MCP gets `element_id`.
- All helper methods must be timeout-bound.

## Development Debugging

```bash
OPEREL_RUNTIME_HELPER=./macos/.build/debug/OperelRuntime \
  operel-computer-use call runtime.ping
```

The debug command should print raw request/response only when `OPEREL_COMPUTER_USE_LOG_LEVEL=debug`.
