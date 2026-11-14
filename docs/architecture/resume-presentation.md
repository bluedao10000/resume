# 模板与内容排版

当前实现，2026-11-14。调研依据见 [模板市场与内容排版](../research/resume-templates.md)。

## 数据与组件

`domain/resume-presentation.ts` 维护模板 ID、中文名称、描述、预设和 Zod 契约，是所有模板入口的单一来源。

```ts
type Template = 'editorial' | 'minimal' | 'professional' | 'technical'
type Presentation = {
  summary: 'plain' | 'inset'
  skills: 'tags' | 'list' | 'columns'
  experience: 'bullets' | 'ruled'
  density: 'comfortable' | 'compact'
}
```

`Resume` 新增可选 `presentation`，未设置时 `presentationFor` 读取对应模板的预设。旧 localStorage、聊天记录及 Folio JSON 不需要迁移；显式设置存完整四字段对象，未知枚举在边界拒绝。它是每份简历的用户数据，不是服务器环境参数，无新增 `.env` 配置项。

`ResumeLayoutControls` 只接收 `resume / onChange / disabled / onPreview`，不维护第二份简历。模板页使用当前简历预览四种样式，内容排版直接写当前条目；保持 ID、正文、示例来源、章节顺序和列表位置。切换其他模板恢复其预设，重新选择当前模板保留自定义设置。

`ResumeDocument` 根据同一契约输出模板 class 和四个 `data-*` 属性；CSS 控制呈现，不变换正文。`RichText` 始终负责受限 Markdown 渲染。专业技能多段落条目在双列模式占整行。空章节和空联系方式不生成空区块。

屏幕、模板卡片与打印均使用此渲染器。紧凑模式改变行距和块间距，不压缩正文到极小字号；打印中长经历可跨页，条目和章节标题采用局部分页约束。不提供强制单页或自动分页页码；页脚仍沿用既有静态页码。

## Agent

新增共享工具 `resume_set_presentation`，两个 pi 运行时通过现有工具注册机制接入，不新增运行适配器：

```json
{
  "template": "technical",
  "presentation": { "skills": "columns", "density": "compact" }
}
```

工具允许局部设置、选择模板或 `reset: true`，只处理当前稿的 polish 意图。它在服务端校验后返回实际结果与 `resume.setPresentation` receipt；重复请求返回 unchanged，不创建副本或显示虚假更新。

正文工具 `resume_update` 不能覆盖模板和排版，`finalizeAgentResult` 保留来源呈现。排版工具以明确的新呈现作为归一化来源，事实、身份和章节顺序保持不变。模板切换不调用模型；只有用户主动聊天要求排版时才经过既有模型与计费链路。当前仍每轮一个工具，同时改内容、章节和排版需要分轮执行。

演示模式只识别明确的模板名及标签、双列、逐项、重点区块、项目符号、分隔段落、舒展/紧凑等词，不代表完整语义理解。系统提示允许按已有事实组织技能类别，不编造分类能力或评分。没有依据时保留原列表。

## 持久化与验证

排版随原简历 JSON 和聊天结果保存，独立排版差异参与重复副本比较；不改 D1 schema。普通润色保留自定义设置，导入/定制沿用既有来源呈现规则。

验证覆盖旧记录、四模板、JSON 往返、未知输入、内容工具不能覆盖布局、重复排版幂等、空章节、长词、多段经历、390px 手机、打印，以及真实 pi-durable 调用新工具。浏览器常规测试的模型和认证使用 fixture，文档解析测试仍使用真实解析器。
