# 项目规则 (rooftop-hindsight)

## 子 Agent 模型调用限制
- 子 Agent（Subagent）只能调用 Flash 系列的模型（例如 `flash`、`flash_lite`）。
- 严禁调用 Gemini 4 系列的模型。
- 在调用 `invoke_subagent` 或配置子 Agent 时，`Model` 参数必须限定为 Flash 系列（如 `flash` 或 `flash_lite`），不得指定或继承为 Gemini 4 系列模型。
