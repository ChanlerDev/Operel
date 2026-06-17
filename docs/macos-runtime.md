# macOS 运行时设计

## 权限

首版需要两个核心 TCC 权限：

- Screen Recording：读取屏幕、窗口截图和像素状态。
- Accessibility：读取 UI 元素、激活控件、点击、输入和导航。

`doctor` 必须检查：

- 当前 binary 是否有 Screen Recording 权限。
- 当前 binary 是否是 trusted accessibility client。
- 是否能列出窗口。
- 是否能对测试 app 执行一次无害 observe。
- 是否签名一致；macOS TCC 权限绑定到 app/binary identity，开发构建频繁变化会导致权限状态混乱。

## 截图

优先使用 ScreenCaptureKit：

- 性能更好。
- 更适合窗口级/显示器级捕获。
- 更符合现代 macOS 的 screen capture 方向。

CoreGraphics 可作为兼容兜底，但不应成为长期唯一方案。

截图输出要求：

- PNG 默认，必要时 JPEG 降低 artifact 体积。
- 返回 logical size、pixel size、scale factor、display id。
- 支持全屏、app/window、指定 rect。
- 写入 artifact store，并在 tool result 中只返回 URI 和摘要。

## Accessibility Tree

使用 ApplicationServices Accessibility API 读取：

- system-wide element。
- app element。
- focused window。
- role、subrole、title、label、value、description。
- frame、enabled、focused、selected。
- children，带最大深度和节点数量限制。

Tree normalization：

- 过滤空 frame、不可见、重复或明显无交互意义的节点，但保留原始 dump artifact 以便调试。
- 生成短期 `element_id`，映射到 AXUIElement reference、frame fingerprint 和 tree snapshot id。
- 对密码框、token 字段等可能敏感值做 redaction。

## 输入执行

动作层支持：

- mouse move/click/double click/right click。
- scroll wheel。
- drag。
- keyboard press/chord。
- text typing。
- app activation。

实现选择：

- 坐标和键盘事件使用 CGEvent。
- 能通过 Accessibility action 完成的控件操作优先用 AXPress、AXSetValue 等结构化动作。
- 文本输入可优先走 pasteboard paste，但必须避免破坏用户剪贴板；需要保存/恢复剪贴板，并在失败时报告。
- 对安全输入框，不应绕过系统限制读取内容。
- modifier 键必须用 `defer` 或等价机制释放；`recover` 也要提供 release-all-modifiers 能力，避免失败后系统停留在 Cmd/Shift/Option 按下状态。

## App 和窗口

需要维护：

- running apps。
- bundle id、localized name、pid。
- active app/window。
- window title、bounds、minimized/hidden 状态。
- per-app policy state。

App activation 流程：

1. 检查 app policy。
2. 通过 NSWorkspace 激活 app。
3. 等待 active app/window 变化。
4. 重新 observe。
5. 如果失败，返回可恢复错误。

## 坐标系统

必须统一处理：

- macOS global coordinate。
- display logical point。
- screenshot pixel coordinate。
- Retina scale factor。
- 多显示器 origin 和负坐标。

对 MCP 暴露时推荐使用 screenshot logical coordinate，并在每次 observe 中返回 transform metadata。动作执行前用 metadata 转换到 CGEvent 坐标。

## 稳定性判断

动作后不应固定 sleep 后盲目返回。建议组合：

- 最短等待 100-300ms。
- 截图 hash 或局部变化检测。
- active window/focused element 是否变化。
- AX tree generation 是否变化。
- 最大等待超时。

`wait` tool 允许上层 Agent 显式等待，但普通动作也要做轻量稳定检查。

## 会话隔离现实边界

在普通 macOS 主用户 session 中，以下资源是共享的：

- frontmost app/window focus。
- 系统键盘和鼠标事件队列。
- pasteboard。
- 菜单栏、系统弹窗、全屏 Space。

因此首版只能做“串行、目标 app/window 校验、动作前后观察、可取消”的软隔离。真正强隔离需要独立 VM、独立 macOS 用户图形会话、虚拟显示或专用远程 Mac worker。没有这些基础设施时，文档、产品文案和 API 都不能承诺后台并行不干扰。

## 权限引导

`doctor` 输出应清晰区分：

- 缺 Screen Recording：无法看见屏幕。
- 缺 Accessibility：无法读取 UI 元素或控制输入。
- app 被 policy deny：用户配置拒绝，不应提示去系统设置。
- target app 不响应 AX：可能是 Electron/WebView/游戏/远程桌面等，需要截图+坐标降级。

不要尝试自动写 TCC 数据库或绕过用户授权。
