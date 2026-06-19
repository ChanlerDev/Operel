# 执行引擎设计

## 核心循环

Computer Use 的基本循环是：

1. Observe：获取截图、窗口状态、Accessibility tree。
2. Decide：上层 Agent 决定下一步工具调用。
3. Approve：policy 判断是否允许、拒绝或需要确认。
4. Act：runtime 执行动作。
5. Verify：采集动作后的 observation。
6. Report：返回结构化结果和 artifacts。

Operel 不内置强绑定的模型 loop。它向 Agent 暴露高质量 observation 和动作工具，让上层 Agent 决策。未来可以增加 `run_task` 高阶工具，但不应在 MVP 中替代基础工具。

## Trace, Observation And Session

Agent-facing workflow should not require a public `session_id` for every call. The app can log directly.

Preferred state model:

- `trace_id`: 自动创建的日志/audit/artifact 分组 id。每个 tool result 返回它；调用方只有在要合并日志时才传入。
- `observation_id`: 每次 observe 生成。`element_id` 绑定到 observation，过期后要求重新 observe。
- `session_id`: 仅当产品需要显式桌面控制租约时公开，例如锁定 app/window、用户可见所有权、超时和取消。

Internal session/lease state, if exposed:

```json
{
  "session_id": "sess_...",
  "task": "Verify checkout flow",
  "created_at": "2026-06-18T00:00:00Z",
  "status": "active",
  "active_app_id": "app_...",
  "last_step_id": "step_...",
  "element_cache": {},
  "policy_snapshot": {}
}
```

Lease status:

- `active`
- `waiting_for_approval`
- `blocked`
- `completed`
- `expired`
- `cancelled`

## Step 记录

每次 tool call 生成 step：

```json
{
  "step_id": "step_...",
  "session_id": "sess_...",
  "tool": "click",
  "input": {},
  "policy_decision": "allowed",
  "pre_observation": "artifact_...",
  "action_result": {},
  "post_observation": "artifact_...",
  "duration_ms": 842,
  "error": null
}
```

敏感字段只存 redacted value，并在 audit 中标注 `redacted: true`。

## 目标解析

目标解析优先级：

1. `element_id`：来自最近 observation。
2. explicit selector：role、label、title、value、app/window。
3. text target：模糊匹配可见文本。
4. coordinate：只在上层明确给出坐标或截图场景不可结构化时使用。

多匹配策略：

- 相同 label 多个按钮时返回 `ambiguous_target`。
- 如果一个目标明显处于 active/focused window 且其他目标不可见，可以选择 active window 内目标，但必须在 result 中说明。
- 不允许随机选择第一个匹配项。

过期元素策略：

- `element_id` 关联 tree snapshot 和 frame fingerprint。
- 动作前重新检查元素是否存在、enabled、frame 未明显漂移。
- 如果漂移但仍可唯一匹配同 label/role，可以自动 refresh 并记录。
- 否则返回 `stale_element`。

## 动作后验证

每个动作工具返回：

- `performed`: boolean。
- `changed`: boolean | unknown。
- `post_observation_uri`。
- `warnings[]`。

如果动作无可见效果：

- 不自动重复超过一次。
- 第二次仍无效果时返回 `action_failed` 或 `ui_not_stable`。
- 提供可能原因：app inactive、element disabled、permission issue、modal blocking、target stale。

## 高阶任务工具

MVP 后可以增加：

### `run_task`

让 Operel 内置模型 loop 执行一段任务。这个能力价值高，但风险也高，应在基础工具稳定后实现。

Required capabilities:

- model provider abstraction。
- budget/max steps。
- approval callback。
- stop conditions。
- self-check prompt。
- full audit export。

首版文档把它列为 future，不放进 MVP。

## Artifact 管理

Artifacts:

- screenshot png/jpeg。
- accessibility tree json。
- normalized elements json。
- action video clip，future。
- audit jsonl。
- exported bundle zip。

Retention:

- 默认 14 天。
- 支持 session 完成后手动 export。
- 敏感 session 可配置不保存截图，只保留 redacted metadata。

## 失败恢复

常见失败和恢复：

- 权限缺失：停止动作，返回 `permission_missing`。
- app policy deny：停止动作，返回 `app_denied`。
- app 未响应：尝试 activate 一次，失败后返回。
- 焦点被抢：返回 `focus_stolen`，重新 observe，不继续盲点输入。
- modal 遮挡：observe 返回 modal summary，由 Agent 决定。
- target ambiguous：返回候选元素。
- target stale：要求重新 observe。
- 坐标不可信：返回 transform metadata 和最新 screenshot。
- modifier 卡住：执行 `recover` 释放 modifier 并记录。
- 剪贴板未恢复：返回 `clipboard_unavailable`，提示用户检查当前剪贴板。

## 性能目标

- `list_apps`: < 200ms。
- app-level `observe` without screenshot: < 500ms。
- full screenshot + normalized tree: < 1500ms。
- click/type/keypress action with post observe: < 2000ms。

这些不是硬保证，但应作为 profiling 目标。
