# ADR-0004: Do Not Promise Strong Parallel Desktop Control Without Isolation

## Status

Accepted

## Context

公开资料显示 Codex Computer Use 在 macOS 上有后台使用体验，但内部实现没有公开。普通 macOS 主用户 session 的焦点、键盘、鼠标、剪贴板和系统弹窗是共享资源，仅靠 CGEvent/Accessibility 无法稳定保证多个 Agent 并行且不干扰用户。

## Decision

MVP 只承诺串行动作执行和软隔离：session state、target app/window 校验、audit、ttl、cancel 和 recover。强并发需要未来引入 VM、独立用户会话、虚拟显示或等价隔离层。

## Consequences

- Core 对动作执行使用全局互斥。
- 文档和产品描述不能宣称“并行不干扰”。
- 未来并发能力需要单独 ADR 和测试矩阵。
