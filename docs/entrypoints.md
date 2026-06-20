# 入口与使用方式

## 入口总览

Operel Computer Use 有四类入口：

| Entry | Audience | Stability | Purpose |
| --- | --- | --- | --- |
| `operel-computer-use mcp` | AI Agent / MCP client | Stable | 主要产品入口 |
| `operel-computer-use doctor` | 用户 / 开发者 / Agent | Stable | 权限、签名、运行时诊断 |
| `operel-computer-use call <tool>` | 开发者 / 测试 | Debug stable | 不经过 MCP client 的本地调试 |
| Future macOS App | 用户 | Future | 权限引导、审批、会话监控、安装配置 |

所有入口都必须走同一个 core session engine。禁止让 CLI 或 App 绕过 policy、audit、runtime protocol 直接执行桌面动作。

## MCP 入口

MCP 是首选入口。Agent 配置：

```json
{
  "mcpServers": {
    "operel-computer-use": {
      "command": "operel-computer-use",
      "args": ["mcp"]
    }
  }
}
```

启动行为：

1. 进程以 stdio 方式启动。
2. 读取 `~/.operel/computer-use/config.toml`。
3. 初始化 artifact store。
4. 懒启动 Swift runtime helper。
5. 注册 tools、resources、prompts。
6. 等待 MCP client 调用。

MCP client 不应直接知道 Swift helper 的存在。

### 安装 MCP 配置

Codex:

```bash
operel-computer-use install codex
```

默认写入 `~/.codex/config.toml`，新增或替换：

```toml
[mcp_servers.operel-computer-use]
type = "stdio"
command = "operel-computer-use"
args = ["mcp"]
```

Claude Code:

```bash
operel-computer-use install claude
```

默认写入 `~/.claude/settings.json` 的 `mcpServers.operel-computer-use`：

```json
{
  "command": "operel-computer-use",
  "args": ["mcp"]
}
```

两个安装命令都会在覆盖前创建 `.bak.<timestamp>` 备份。开发或测试时可显式指定路径和命令：

```bash
operel-computer-use install codex --config-path /tmp/codex.toml --command /abs/path/to/operel-computer-use
operel-computer-use install claude --config-path /tmp/settings.json --command /abs/path/to/operel-computer-use
```

## 典型 Agent 调用流

### 低风险观察任务

1. `status({})` 检查权限、active app/window、policy 和当前 `trace_id`。
2. `observe({ "target": { "app": "TextEdit" } })`
3. Agent 根据 screenshot URI、`observation_id` 和 elements 判断状态。
4. 需要导出调试包时调用 `log({ "trace_id": "trace_...", "format": "bundle" })`。

### 输入文本任务

1. `status`
2. `act({ "action": { "type": "open_app", "app": "TextEdit" } })`
3. `observe({ "target": { "app": "TextEdit" } })`
4. `act({ "action": { "type": "click", "target": { "element_id": "el_..." } } })`
5. `act({ "action": { "type": "type_text", "text": "hello from operel" } })`
6. `observe`
7. `log({ "format": "summary" })`

### 风险动作任务

1. Agent 调用 `act`。
2. core policy 判断动作风险。
3. 如果风险高，tool 返回 `approval_required`，不执行动作。
3. Agent 向用户解释动作影响。
4. `confirm_on_retry` 模式下，Agent 重新调用并带回 `confirmation_token`；`manual` 模式交给用户改 CLI/config；`full_access` 模式不拦截。
5. Core 记录 approval event，再执行动作。

`full_access` 是显式 operator 模式。它允许默认执行风险动作，但必须由用户通过 CLI/config 开启。

### 停止/恢复任务

如果动作卡住、焦点不可信或用户要求停止：

```json
stop({ "trace_id": "trace_..." })
```

`stop` 负责取消当前动作、释放 modifier、恢复 Operel 修改过的剪贴板并写入 audit。

## CLI 入口

### `doctor`

```bash
operel-computer-use doctor
```

输出必须包含：

- binary path。
- code signing identity。
- Screen Recording permission。
- Accessibility permission。
- Swift helper 可启动性。
- app/window listing 是否可用。
- artifact store 是否可写。
- 配置文件路径和 policy 摘要。

示例输出：

```text
Operel Computer Use Doctor
Binary: /usr/local/bin/operel-computer-use
Config: /Users/me/.operel/computer-use/config.toml
Screen Recording: granted
Accessibility: missing
Runtime helper: ok
Artifact store: ok

Next step:
Open System Settings > Privacy & Security > Accessibility and allow this binary.
```

机器可读输出：

```bash
operel-computer-use doctor --json
```

`--json` 必须和 MCP `status.permissions` 返回同一组权限字段，方便 Agent 在执行前自检。

### `call`

本地调试入口：

```bash
operel-computer-use call status
operel-computer-use call observe --args '{"target":{"app":"TextEdit"}}'
operel-computer-use call act --args '{"action":{"type":"type_text","text":"hello"}}'
```

`call` 还应支持从 stdin 读取参数，便于脚本和测试：

```bash
echo '{"target":{"app":"TextEdit"}}' | operel-computer-use call observe --stdin
```

`call` 的行为必须和 MCP tool 一致：

### `config`

```bash
operel-computer-use config path
operel-computer-use config print
operel-computer-use config mode manual
operel-computer-use config mode confirm-on-retry
operel-computer-use config mode full-access
```

`manual` 使用 app allow/deny/prompt；`confirm-on-retry` 默认允许 app 但风险动作需要 token retry；`full-access` 不做 app/action policy 拦截。

- 同样读取配置。
- 同样执行 policy。
- 同样写 audit。
- 同样返回结构化 JSON。

### `config`

建议提供：

```bash
operel-computer-use config path
operel-computer-use config init
operel-computer-use config print
```

`config print` 必须隐藏敏感字段。

## Future macOS App

App 不负责核心自动化逻辑。它负责：

- 引导 Screen Recording 和 Accessibility 授权。
- 展示当前 session、调用方、目标 app、最近动作。
- 弹出风险动作确认。
- 提供 Stop 按钮。
- 管理 allow/deny app policy。
- 展示 artifact/session export。

App 可以和 core 通过 local socket、XPC 或同一 helper 协议通信，但不能成为 MCP server 的强依赖。

## 配置入口

默认配置文件：

```text
~/.operel/computer-use/config.toml
```

最小配置：

```toml
[server]
transport = "stdio"

[apps]
allowed = ["TextEdit"]
denied = ["System Settings", "Keychain Access"]

[policy]
require_confirmation_for_risky_actions = true
redact_sensitive_text_in_logs = true
```

环境变量：

| Variable | Purpose |
| --- | --- |
| `OPEREL_COMPUTER_USE_CONFIG` | override config path |
| `OPEREL_COMPUTER_USE_HOME` | override `~/.operel/computer-use` |
| `OPEREL_COMPUTER_USE_LOG_LEVEL` | `error`, `warn`, `info`, `debug` |
| `OPEREL_RUNTIME_HELPER` | override Swift helper path for development |

## 不支持的入口

首版不提供：

- 未授权 HTTP server。
- 浏览器远程调试端口代理。
- 直接暴露 CGEvent/AX 原始函数的 MCP tools。
- 无 policy/audit 的 “unsafe mode”。
- 自动修改 TCC 数据库的安装脚本。

这些入口会扩大安全风险，且对首版业务价值帮助不大。
