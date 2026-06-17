# ADR-0003: Combine Visual State With Accessibility

## Status

Accepted

## Context

纯坐标点击脆弱，窗口移动、Retina scale、多显示器和布局变化都会导致漂移。纯 Accessibility 也不可靠，Electron、Canvas、游戏、远程桌面或自绘 UI 可能缺少语义。

## Decision

Observation 同时支持 screenshot 和 Accessibility tree。动作优先使用 element id 或 AX action；无法结构化时才使用坐标，并必须记录坐标系 metadata 和截图 artifact。

## Consequences

- `observe` 默认返回 screenshot URI、display scale、window bounds 和 normalized elements。
- 坐标动作必须可审计、可复现。
- target resolution 必须处理 stale element、ambiguous target 和 coordinate mismatch。
