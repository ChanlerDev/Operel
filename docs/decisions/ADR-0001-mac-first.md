# ADR-0001: Mac First

## Status

Accepted

## Context

Computer Use 的核心难点在 runtime：截图、窗口、Accessibility、输入、权限和安全提示都高度依赖操作系统。为了尽快得到真实可用的产品，不应在 MVP 同时抽象多个平台。

## Decision

Operel Computer Use 首版只支持 macOS。跨平台只保留极薄接口边界，不承诺 Windows/Linux 行为。

## Consequences

- 可以直接使用 ScreenCaptureKit、ApplicationServices Accessibility API、CoreGraphics CGEvent 和 NSWorkspace。
- 文档、测试和权限引导都围绕 macOS TCC。
- 未来支持其他系统时，需要新增 runtime adapter，而不是修改 MCP 契约。
