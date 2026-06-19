# 测试策略

## 测试分层

### Unit Tests

覆盖：

- MCP schema validation。
- config parsing。
- app policy decision。
- action risk classification。
- coordinate transform。
- element matching and ambiguity。
- redaction。
- artifact URI generation。

### Contract Tests

用 MCP client 测试：

- `tools/list` 返回稳定 schema。
- `tools/call` 对必填字段、错误字段、image content、resource URI 的响应符合协议。
- 错误码和 recoverable 字段稳定。

### Runtime Fixture Tests

使用本地 fixture app 或 TextEdit 做低风险验证：

- list apps。
- open app。
- observe app tree。
- click known button。
- type text into blank document。
- press keyboard shortcut。
- export session。

这些测试需要 macOS 权限，默认不放在普通 CI 中。

### Golden Observation Tests

保存 anonymized accessibility tree fixture，验证 normalization 不破坏：

- role/title/label 抽取。
- element id 生成稳定性。
- frame transform。
- tree depth limit。
- sensitive value redaction。

### Real Smoke Tests

手动或专用 Mac runner：

```bash
operel-computer-use doctor
operel-computer-use call status
operel-computer-use call act --args '{"action":{"type":"open_app","app":"TextEdit"}}'
operel-computer-use call observe --args '{"target":{"app":"TextEdit"}}'
operel-computer-use call act --args '{"session_id":"...","action":{"type":"type_text","text":"hello from operel"}}'
operel-computer-use call log --args '{"session_id":"...","format":"bundle"}'
operel-computer-use call stop --args '{"session_id":"..."}'
```

### Permission Matrix

至少覆盖：

| Screen Recording | Accessibility | Code signing | Expected |
| --- | --- | --- | --- |
| missing | missing | stable | `doctor` reports cannot see or control |
| granted | missing | stable | screenshot works, input/tree actions fail |
| missing | granted | stable | tree/input checks may work, screenshot fails |
| granted | granted | stable | TextEdit smoke works |
| granted before rebuild | granted before rebuild | changed identity | `doctor` warns permission may need re-grant |

### Agent Smoke Tests

用真实 MCP client 验证：

- Codex CLI/App 能加载 server。
- Claude Code 能加载 server。
- Gemini CLI 能加载 server。
- Agent 能完成一个 TextEdit 或 Calculator 的低风险任务。

### Entrypoint Smoke Tests

```bash
operel-computer-use --help
operel-computer-use doctor --json
operel-computer-use call status
operel-computer-use mcp
```

For `mcp`, use a minimal MCP client fixture to verify:

- initialize succeeds.
- `tools/list` includes the stable tools: `status`, `observe`, `act`, `stop`, `log`.
- `resources/list` includes session and policy resources.
- `prompts/list` includes safety/operator prompts.

## 不应做的测试

- 不把某张截图坐标写死成通用通过条件。
- 不用 mock runtime 冒充产品级 smoke。
- 不在无权限环境里把失败测试标成通过。
- 不用无限 retry 掩盖 UI 目标解析失败。

## CI 策略

普通 CI：

- TypeScript lint/test。
- Swift unit test。
- MCP contract test with fake runtime。
- fixture normalization test。

Mac 权限 CI 或手动 release gate：

- signed binary doctor。
- real Screen Recording/Accessibility smoke。
- agent smoke。

## 验收标准

MVP 完成时至少满足：

- 无权限时所有动作返回可理解错误。
- 有权限时 TextEdit smoke 成功。
- MCP schema 可被至少两个 client 读取。
- 敏感文本不会明文写入 audit。
- app deny 后动作无法执行。
- session export 包含足够复现失败的 artifact。
