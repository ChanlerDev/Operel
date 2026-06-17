# ADR-0002: MCP Is The Primary Agent Entry

## Status

Accepted

## Context

目标用户是其他 AI Agent。自定义 HTTP API 或私有 SDK 会让每个 Agent 重复集成。MCP 已经提供 tools、resources、prompts、structuredContent 和 resource links，足够承载 Computer Use 的动作和观察。

## Decision

首个稳定入口是 `operel-computer-use mcp`。CLI `call` 只用于调试，未来 macOS App 只做权限、审批、监控和安装辅助。

## Consequences

- 所有能力必须先有 MCP tool/resource 契约。
- 大截图和日志通过 resources 暴露，避免 tool result 过重。
- 任何高阶 SDK 都应包裹 MCP/core，而不是绕过 core。
