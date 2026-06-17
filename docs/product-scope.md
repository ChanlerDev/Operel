# 产品与范围

## 项目目标

Operel Computer Use 为 AI Agent 提供一个本地 Mac 桌面控制层。它不是替代浏览器自动化、Shell、IDE API 或专用 MCP connector，而是在缺少结构化接口、需要真实 GUI 验证、或任务跨多个桌面应用时提供可靠入口。

## 目标用户

- Codex、Claude Code、Gemini CLI、OpenCode 等支持 MCP 的 Agent。
- 自研 Agent runtime，需要在本地 Mac 上查看、点击、输入、滚动、检查 app 状态。
- 开发者和测试 Agent，需要验证 GUI app、浏览器、模拟器、设计工具或第三方软件中的流程。

## 典型任务

- 打开一个 macOS app，复现只在 UI 中出现的问题。
- 在浏览器、设置页、模拟器和编辑器之间完成多 app 流程。
- 检查一个本地 Web app、桌面 app 或设计工具中的视觉状态。
- 操作不提供 API 或插件的数据源，但仅在用户授权的 app 内执行。
- 在自动化失败时生成包含截图、accessibility tree、动作轨迹的调试 artifact。

## 非目标

- 首版不做 Windows/Linux 支持。
- 不做远程无人值守解锁或绕过 macOS 安全模型。
- 不做通用 RPA 录制器；录制回放可以未来扩展，但不是 MVP。
- 不绕过 CAPTCHA、登录风控、系统安全弹窗或网站防护。
- 不把 Computer Use 当作首选数据访问方式；有 API、文件、数据库、MCP connector 时优先走结构化接口。

## 成功标准

- 任何 MCP client 都能通过配置 `command = "operel-computer-use"`、`args = ["mcp"]` 接入。
- Agent 可以发现当前 app/window、获取截图和 UI tree，并对明确目标执行基础交互。
- 每个动作都有结构化结果、失败原因、截图或文本 artifact。
- 用户可以配置 app allowlist/denylist，并在敏感动作发生前确认。
- 权限缺失时，`doctor` 能明确指出缺什么、为什么需要、怎么修复。

## 关键边界

Computer Use 的价值是补齐“真实 GUI 观察与操作”这层能力。不要把上层 Agent 的推理、业务策略、账号授权和模型供应商绑定进 runtime。Operel 只负责：

- 暴露桌面状态。
- 执行被授权的 UI 动作。
- 报告结果和风险。
- 维护会话、权限、审计和 artifact。

上层 Agent 负责：

- 理解用户意图。
- 决定下一步是否应调用 Computer Use。
- 在风险动作前向用户解释业务影响。
- 根据结果继续规划或停止。
