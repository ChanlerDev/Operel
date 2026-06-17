# 参考资料

## OpenAI / Codex Computer Use

- [Computer Use - Codex app](https://developers.openai.com/codex/app/computer-use)
  - Codex Computer Use 在 macOS/Windows 上通过 Screen Recording 和 Accessibility 等权限观察和操作桌面。
  - 官方建议只在 GUI 必需、结构化集成不足时使用，并对 app 使用和敏感动作做权限控制。
- [Computer use - OpenAI API](https://developers.openai.com/api/docs/guides/tools-computer-use)
  - 描述 Computer Use loop：模型根据截图返回 UI action，harness 执行动作，再提交新的截图继续循环。
  - 强调隔离环境、人类确认、第三方内容不可信和敏感动作确认。
- [Computer-Using Agent - OpenAI](https://openai.com/index/computer-using-agent/)
  - 提供 CUA 的感知、推理和动作基本模型。

## MCP

- [Model Context Protocol introduction](https://modelcontextprotocol.io/docs/getting-started/intro)
  - MCP 是连接 AI app/agent 与外部系统的开放协议。
- [MCP Tools specification 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
  - Tools 是模型可发现和调用的动作入口；2025-06-18 版本明确了 structuredContent、outputSchema、resource links 和工具安全注意事项。
- [MCP Resources specification 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/server/resources)
  - Resources 适合暴露截图、日志、会话和其他可读取 artifact，并支持订阅和 list changed capability。

## macOS APIs

- [Accessibility API - Apple Developer Documentation](https://developer.apple.com/documentation/accessibility/accessibility-api)
- [AXIsProcessTrustedWithOptions - Apple Developer Documentation](https://developer.apple.com/documentation/applicationservices/1459186-axisprocesstrustedwithoptions)
- [ScreenCaptureKit - Apple Developer Documentation](https://developer.apple.com/documentation/screencapturekit/)
- [Meet ScreenCaptureKit - WWDC22](https://developer.apple.com/videos/play/wwdc2022/10156/)

## 开源参考

- [iFurySt/open-codex-computer-use](https://github.com/iFurySt/open-codex-computer-use)
  - 一个以 MCP 包装 Computer Use 的开源参考，支持 CLI 安装到 Codex、Claude、Gemini、OpenCode 等 client。
- [Cua: Build Your Own Operator on macOS](https://cua.ai/blog/build-your-own-operator-on-macos-1)
  - 展示 macOS sandbox、截图、Responses API computer action 和反馈循环。

## 需要持续跟踪

- OpenAI Computer Use guide 中 `computer` tool 与旧 `computer-use-preview` 的迁移差异。
- Codex Computer Use app/plugin 的公开 MCP 行为变化。
- macOS 新版本对 ScreenCaptureKit、Accessibility、CGEvent 和 TCC 权限提示的变化。
- MCP spec 的 tool result、resources、elicitation/approval 相关能力演进。
