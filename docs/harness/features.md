# 功能与接口契约

## 前端领域组件

| 组件                    | Props                                                                                 | 职责                                          |
| ----------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------- |
| ResumeDocument          | `resume: Resume`                                                                      | 语义化文档、预览、模板、打印；无内部事实状态  |
| ResumeSection（模块内） | `title, english, children`                                                            | 标题层级、section 间距和版式                  |
| ResumeEditor            | `resume, onChange`                                                                    | 修改基本资料、技能、经历与教育；添加/移除经历 |
| AgentChat               | `resume, hasResume, library, intent, command, onCommandConsumed, onResult, onBusy...` | runtime、消息、composer、一次性快捷命令、取消 |
| Modal                   | `title, onClose, children, initialFocusRef?`                                          | 原生模态对话框、焦点管理、Escape              |
| ConfirmDelete           | `title, name, confirmLabel?, onCancel, onConfirm`                                     | 默认取消聚焦，确认后才调用删除动作            |
| LandingPage             | `canLogin, isLoading, error, onLogin, onDemo?`                                        | 未登录产品页、Google 登录及显式演示入口       |

组件路径在 `src/components/`。聊天返回数据不拼接 HTML、不执行模型给出的 JSX；富文本通过受限 Markdown 节点渲染，不插入原始 HTML。

## Resume 数据契约

```ts
type Resume = {
  id: string
  name: string
  title: string
  email: string
  location: string
  summary: string
  skills: string[]
  experience: {
    company: string
    role: string
    period: string
    bullets: string[]
  }[]
  education: string
  label: string
  updatedAt: string
  template: 'editorial' | 'minimal' | 'professional' | 'technical'
  presentation?: {
    summary: 'plain' | 'inset'
    skills: 'tags' | 'list' | 'columns'
    experience: 'bullets' | 'ruled'
    density: 'comfortable' | 'compact'
  }
  isExample?: boolean
  sectionOrder?: ('summary' | 'experience' | 'skills' | 'education')[]
}
```

完整约束以 `ResumeSchema` 为准。email 当前允许空字符串和普通文本，避免模型不能解析时被强迫编造邮箱；前端不宣称邮箱真实性。数组限制为技能 30、经历 15、每段要点 12。

## API

### GET /api/config

返回 `{ mode: 'demo' | 'live', authConfigured: boolean, runtime: 'pi-ai' | 'pi-durable' }`。另包含公开的 `importLimits: { maxFileBytes, maxPages, maxTextCharacters, timeoutMs, maxExpandedBytes }` 与现有计费公开参数。不返回密钥，配置失败显示重试。

### GET|POST /api/auth/$

委托 Better Auth handler。Google callback 是 `/api/auth/callback/google`。缺少凭据时 session 查询返回 `null`（访客），登录请求返回 503 提示。具体 OAuth/CSRF/session 语义由锁定版本 Better Auth 实现。

### POST /api/agent

```json
{
  "intent": "tailor",
  "text": "岗位职责和任职要求…",
  "resume": { "...": "符合 ResumeSchema 的当前简历" },
  "library": [{ "...": "候选简历，最多 20 个" }]
}
```

请求另带 `threadId`、`requestId` 和 `history:[{role,content}]`。history 最多 40 条，每条 20,000 字符，服务端限制为最近合计 32,000 字符；import 不把历史发给模型。

结果：`{ message, resume, changes, keywords, missing, applied, operation? }`。operation 含 tool/status/fields，来自领域执行；`applied:false` 不写简历。pi-ai 返回 JSON 结果；pi-durable POST 返回 202 `{status:"running"}`，GET `/api/agent?threadId=…&requestId=…` 查询 running/completed/failed 快照，completed 的 result 为同一结果结构。DELETE 同地址取消。所有 live 请求经 session 鉴权，同 ID 不同输入返回 409。没有 token streaming。

等待状态由 assistant-ui 当前助手消息显示，仅一个头像和一条状态；响应后原位替换，取消后隐藏空消息。

| 状态 | 语义                                                          |
| ---- | ------------------------------------------------------------- |
| 200  | 生成完成，返回经校验的草稿                                    |
| 400  | JSON 无法解析或 schema 校验失败                               |
| 401  | live 模式未登录                                               |
| 413  | 请求声明大于 100,000 bytes 或读取后的正文大于 100,000 JS 字符 |
| 503  | live 模型配置不完整                                           |
| 502  | 模型失败、超时、无效返回或认证服务异常                        |

text 最多 20,000 JS 字符，模型超时读取 `.env` 的 AGENT_TIMEOUT_MS（当前 45 秒）。正文读取仍是 `request.text()`，未实现流式读入限额。响应不泄露 provider 原始报错。

## 模板与内容排版

四模板：经典叙事、极简留白、标准单栏、技术清单。注册表 `domain/resume-presentation.ts` 提供统一 ID、名称、描述与预设。模板页的 `ResumeLayoutControls` 支持简介正文/重点区块、技能标签/逐项/双列、工作要点项目符号/分隔段落、舒展/紧凑密度。设置随每份简历保存；切换其他模板使用其预设，重新选当前模板保持自定义。恢复模板排版不删除正文。模板卡片隐藏重复文档的无障碍树，仅暴露动作与名称。

`resume_set_presentation` 接收可选 template、局部 presentation 或 reset；仅用于 polish。两种 pi 运行时共用校验及执行结果，实际变更返回 `resume.setPresentation`。重复设置 unchanged，不创建简历；内容工具保留来源呈现。打印允许长经历跨页，空联系方式与章节不产生占位区块。详见 [模板与内容排版](../architecture/resume-presentation.md)。

## 导入与定制规则

有简历时，输入框底栏常驻“按 JD 定制”，共用现有 `open('jd')` / `run('tailor')`，无需先打开“＋”菜单；生成期间禁用，空库只展示导入引导。JD 弹窗说明来源候选人、独立生成和保留原稿，空输入不能提交；打开或取消不调用 Agent。普通对话占位文字提示可粘贴 JD。显式 tailor 意图优先于正文中偶然出现的邮箱，避免招聘联系邮箱被误判为新简历导入。

富文本框的 PDF 粘贴先净化 HTML 并将可恢复的字体强调、预格式换行和文本项目符号转换为语义格式；HTML 单段与纯文本分行在文字一致时合并两者信息。纯文本不猜测缺失的强调或标题。选区外内容保留，支持撤销，超限恢复原稿；样式随 Markdown 保存并用于预览、打印和刷新。没有新增模型调用。详见 [PDF 剪贴板](../architecture/document-import.md#pdf-剪贴板)。

演示导入首行作为姓名、第二行作为职位，提取邮箱与出现的已知技能，将其余内容保留在 summary。清空旧工作经历、教育、城市，不把示例事实串入新简历。支持 PDF、DOCX、TXT、MD 和 Folio JSON。PDF.js 在本地提取 PDF 文字，Mammoth 在专用 Web Worker 中提取 DOCX 标题、强调与列表；用户核对原文后才发送 Agent。默认限制 10MB、PDF 30 页、提取 20,000 字符、20 秒、DOCX 声明解压大小 50MB，均由 `.env` 配置。失败、超限与取消不覆盖原文或自动创建简历；不静默截断。扫描件提示先 OCR，密码文档需先解锁，旧 DOC 需另存 DOCX。详细边界见 [文档导入架构](../architecture/document-import.md)。

关键词检索在当前简历与最近 20 个候选中，先限定同名且邮箱不冲突的候选，再根据预设技能词表与原文大小写归一匹配选取最高命中来源；平分时优先当前简历。不是多文档合并，没有语义召回。tailor 可重排事实来源已有的技能、经历和同段工作要点，允许 Markdown 强调与可判为等义的小幅改写。共享工具会把无法确认等义的改动，以及新增职责、技术细节及因果表述放入核对卡，请用户确认后再加入；版本名与投递正文分开。零命中时也允许草稿，但不宣称匹配度高。

普通对话和 polish 更新当前简历，保持 ID、名称、模板及列表位置；import 与 tailor 才创建新 ID 和新条目。后续修改定制稿仍在该稿原位保存。demo/live 共享 `finalizeAgentResult`，模型无权分配条目身份；前端按 ID 更新或插入。已有副本不自动删除，取消或失败不更新原稿。演示 polish 仅替换部分动作动词，不理解任意聊天指令。live 的模型执行更完整润色，但结构校验不等于事实核验，仍须用户审阅。

## 状态与持久化

Entry 等待配置与 session 后选择入口。live 未登录展示落地页，不挂载工作台或读取简历库；demo 可通过“试用示例”显式进入 guest，标签页 sessionStorage 仅记住试用选择。登录后以 userId 为工作台 key；退出后回到落地页。配置失败显示重试，OAuth 失败可再次尝试，不自动降级 demo。

简历 key：`folio:resumes:v1:<guest|userId>`。恢复时执行 Zod 校验；无法解析时不覆盖旧数据，并提示用户备份。写入失败时显示未保存状态。

`null`（key 不存在）才预置示例；`[]` 表示用户删空，刷新仍保持空库。`emptyResume` 仅作为空库导入请求的空白上下文，不存入简历库。空库隐藏编辑与润色入口、禁用导出按钮，聊天默认任务为导入；JD 入口引导先导入。

示例使用 `isExample` 标识，在侧栏、列表、画布、预览及打印中注明。旧版原始示例通过 seed ID、姓名和邮箱组合补标，不把同名用户标为示例。JSON 导出/导入保留显式标识。示例的润色和 JD 版本由服务端及 demo 规则保留标识，新文本导入强制清除。人工编辑示例事实后清除标识，原始“示例简历”版本名改为“我的简历”；仅切换模板不清除。

删除入口位于简历库卡片和画布工具栏。整份简历、编辑中的工作经历和重复副本清理先通过 ConfirmDelete；默认聚焦取消，Escape、取消与关闭不修改数据。删除当前项选择剩余第一份；删除非当前项不改变选择；最后一份删除后进入空库。整份删除与清理共享最近一次操作快照；只有同 scope、集合仍为操作后快照、非生成中时可撤销。编辑、生成、导入、刷新或切换身份后撤销失效。工作经历确认后直接更新当前版本。删除不请求模型，不修改认证数据库。

导航与当前文档从同一 resumes 集合派生，选择只接受集合内 ID。当前 scope 的 storage 事件同步其他标签页的修改；清除旧结果、命令、删除请求及撤销快照并取消旧 runtime。损坏的存储事件不覆盖已有数据，显示失败状态。

聊天字号使用统一变量 `--chat-font-size: 12px`；文档字号独立。更新卡片使用原生 details / summary，默认折叠修改明细和关键词，待补充事实始终显示，不随折叠隐藏。

工作台与集合页面均使用完整视口高度，不再减去页头或手机切换条的固定高度。消息区顶部不渲染标题、快捷动作或来源卡片。`chat-scroll` 独立滚动，`composer-container` 为不收缩的兄弟节点。输入框“简历操作”使用 Astryx Popover，包含原有导入、润色、JD 动作；弹层打开不改变布局，Escape 关闭并恢复触发按钮焦点。当前来源只在输入框底部同行展示。手机预览切换、账户入口及演示状态放在侧栏。

登录/退出切换时按账户重新装载本机集合，加载身份与数据的 scope 一致后才允许持久化。旧请求的结果不能写入新账户 scope。访客空间不会自动迁移。

对话不持久化。点击“开启新对话”重建 runtime，保留简历库。生成期间禁止切换来源、模板、开启新任务和直接编辑。停止时通过 assistant-ui abortSignal 取消客户端 fetch，不提交返回的修改或新条目；Worker 侧已经发出的 provider 请求可能继续执行到超时，生产需增强端到端取消传播与成本控制。

快捷操作命令是一次性事件。聊天组件追加命令后调用 `onCommandConsumed(id)`，父组件仅在 ID 相符时清除待执行命令。选择简历同样清空待执行命令。进入简历库、返回聊天、选择最近简历或切换模板均不得发起 Agent 请求，也不得新增版本；手机选择简历后直接显示预览。

简历库检测完全重复副本时仅忽略 `id` 与 `updatedAt`，正文、事实、版本名称、模板和数组顺序均参与比较。检测到重复时显示“清理 N 份重复副本”，由用户主动执行，不自动删除。每组优先保留当前选中的副本，否则保留列表中第一份。清理在当前账户分区内保存，支持本次页面中撤销；继续编辑、生成、导入、刷新或切换账户后撤销失效，避免恢复旧快照覆盖后续修改。

## 导出

PDF 通过浏览器打印的 A4 样式，打印树使用相同 ResumeDocument，隐藏应用侧栏、弹窗和聊天。长内容自动分页，经历块尽量避免跨页。打印面板的纸张/比例/页眉页脚仍由用户控制。JSON 用 Blob 下载并释放 Object URL，可重新导入备份。

## 计费

侧栏“套餐与用量”展示三档月价、余额、预留、周期和四类 Token。live 调用先通过 D1 原子准入，额度不足 402、并发占用 429、同请求不同输入 409。两种 pi 运行时按实际 usage 幂等结算；失败或取消仍结算已报告用量。支付回跳不授予权益。详见 [计费架构](../architecture/billing.md) 和 [套餐规则](../product/billing.md)。

## 新对话功能引导

assistant-ui 当前线程为空、未生成时，在消息区显示 ChatWelcome。三张淡色 HTML 图示卡分别介绍导入、对话修改与 JD 定制，使用原生按钮和装饰性 CSS 图示，不依赖图片下载或新增状态存储。导入、定制共用 onImport/onJD；打开与取消不发送请求、不改简历。修改仅在 composer 为空时填入示例并聚焦，保留已有输入，由用户发送。空库禁用修改和定制，有示例即可试用；有个人简历时导入项显示“导入另一份简历”。开始发送后收起，历史恢复时不显示，开启新对话再次显示。消息区自行滚动，短屏和手机不遮挡输入框。
