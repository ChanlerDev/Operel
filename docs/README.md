# Operel Computer Use 技术文档

Operel 的目标是做一个 Mac 优先的通用 Computer Use 项目，给其他 AI Agent 提供稳定、可审计、可扩展的桌面操作能力。第一入口是 MCP server；本地 CLI 和未来原生 App 作为安装、授权、诊断和可视化控制面。

## 设计原则

- **先结构化，后视觉兜底**：能通过 Accessibility tree、窗口元数据、菜单、URL、DOM 或文件接口完成的任务，不直接走盲点式坐标点击；截图和坐标动作是必要能力，但不是唯一能力。
- **Agent 可用，不等于无限授权**：Computer Use 可以影响项目目录之外的系统状态，默认必须有 app allowlist、风险动作确认、审计日志和可中断会话。
- **Mac 优先**：首版只承诺 macOS。跨平台抽象只保留接口边界，不提前为 Windows/Linux 牺牲 Mac 体验。
- **执行循环可恢复**：每个动作都要产生 observation、action、result、artifact 和 failure metadata，方便上层 Agent 做重试、回滚或交给用户。
- **不把样例写死成产品逻辑**：工具 schema、权限、元素定位和失败恢复要基于通用契约设计，不能针对某个 app、截图或路径做特例化修复。

## 文档地图

- [产品与范围](./product-scope.md)：目标用户、非目标、能力边界和成功标准。
- [系统架构](./architecture.md)：进程模型、模块边界、数据流和推荐技术栈。
- [入口与使用方式](./entrypoints.md)：MCP、CLI、doctor、future App、配置样例和典型调用流。
- [MCP 接口契约](./mcp-api.md)：MCP tools/resources/prompts 的命名、schema、错误模型和会话语义。
- [macOS 运行时](./macos-runtime.md)：截图、Accessibility、输入注入、权限、窗口和 app 控制。
- [运行时协议](./runtime-protocol.md)：Node core 与 Swift helper 之间的 JSON-RPC 协议。
- [执行引擎](./execution-engine.md)：observe-plan-act loop、元素定位、失败恢复、并发和 artifact 管理。
- [安全与权限](./security-permissions.md)：TCC 权限、app policy、敏感动作、人类确认和审计。
- [测试策略](./testing-strategy.md)：单元、契约、fixture、真机 smoke 和回归测试。
- [实现计划](./plans/2026-06-18-computer-use-implementation-plan.md)：MVP 的工程拆解、验收门槛和任务顺序。
- [架构决策](./decisions/ADR-0001-mac-first.md)：Mac 优先、MCP 入口、视觉加 Accessibility、并发边界和精简 MCP surface 的关键 ADR。
- [参考资料](./references.md)：本设计使用的公开资料和需要持续跟踪的上游。

## 当前实现

当前 MVP 已按实现计划落地。产品形态是：

1. 一个 `operel-computer-use mcp` 命令，暴露稳定 MCP tools。
2. 一个 `doctor` 命令，检查 Screen Recording、Accessibility、签名和 app policy。
3. 一个 macOS runtime，支持截图、app/window/rect scoped screenshot、app/window 列表、Accessibility tree、点击、输入、按键、滚动、等待和恢复。
4. 一个 session/action 日志层，支持 element ids、串行动作、cancel、timeout、artifact 保存和 audit export。
5. 一个安全层，默认 app 级 allow/deny，敏感/破坏性/外发风险动作返回 approval，不默认执行。
6. 两个 MCP client 安装入口：`install codex` 和 `install claude`。

设计重审后，稳定 MCP surface 已收敛到 `status`、`observe`、`act`、`stop`、`log`。当前细粒度工具保留为兼容/调试层。见 [ADR-0005](./decisions/ADR-0005-minimal-agent-facing-mcp-surface.md)。

真实验证路径见 [Release Notes](./release-notes.md)。

## 明确不承诺

不要在没有独立 VM、独立 macOS 用户会话、虚拟显示或等价隔离能力之前承诺“多个 Agent 并行操作且不干扰用户”。在主用户 session 里，真实焦点、键盘、剪贴板和部分系统弹窗是共享资源，首版只能提供串行、安全、可审计的执行。

## 当前文档成熟度

这套文档现在同时承担“实现规格”和“工程验收记录”的角色。它已经覆盖：

- 入口：MCP、CLI、doctor、future App。
- 运行时：Swift helper、macOS 权限、截图、AX tree、输入执行。
- 协议：MCP tool/resource 契约和 Node-to-Swift runtime JSON-RPC。
- 安全：app policy、风险动作、人类确认、日志脱敏。
- 验收：MVP release gate、Mac smoke、Agent smoke。

当前实现状态以 [实现计划](./plans/2026-06-18-computer-use-implementation-plan.md) 和 [Release Notes](./release-notes.md) 为准。
