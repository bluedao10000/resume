# Folio 运行状态与转换

范围为 `cn` 分支中 Web、小程序和 Worker 的已实现产品流程。每行按一个可观察的问题组织：谁能推进状态，什么事件能产生副作用，失败后还能做什么。同一行的多个端可能有不同的持久化方式。按钮禁用、缩略图、搜索结果和剩余额度从已有数据派生。

## 入口与身份

| 流程 | 转换、守卫与可见结果 | 实现入口 |
| --- | --- | --- |
| 网页启动 | SSR 读取 cookie 会话 → 客户端接管；公开配置就绪后，以模式、会话和当前标签页的试用选择决定首页或工作台。配置失败可重试。退出、登录其他用户会重新挂载身份分区。 | [Entry](../../src/routes/index.tsx)、[fetchSession](../../src/server/session.ts) |
| 登录窗口与 OAuth | 打开 → 选择已启用方式 → 发起授权 → 回调验证 session → 进入工作台或返回登录窗口重试。邮箱、协议页、二维码可以返回方式列表。关闭窗口会中止窗口属下的请求并恢复焦点。 | [LoginMethods](../../src/components/LoginMethods.tsx)、[回调](../../src/routes/auth/callback.tsx)、[认证配置](../../src/server/auth.ts) |
| 微信网页扫码 | 获取授权地址 → 二维码加载 → 就绪 → 到期；加载超时或失败可重试。仅接收目标 iframe 与微信 origin 的就绪消息，成功登录以会话为准。 | [LoginMethods](../../src/components/LoginMethods.tsx) |
| 邮箱验证码 | 输入邮箱 → 发码 → 等待输入 → 校验 → 回调。冷却后可重发，到期须重新发码。刷新恢复邮箱和截止时间，修改邮箱清除旧挑战。 | [验证码表单](../../src/components/EmailOtpLogin.tsx)、[当前标签页记录](../../src/lib/email-login-state.ts) |
| 小程序会话 | 取配置 → 恢复有效 token 并核对用户，或由用户选择微信登录 / 本机演示。服务端以已验证的 AppID/openid 建立独立会话。作用域切换或页面卸载使旧异步回调失效；已失效的 token 可以完成本机退出。 | [原生页面](../../wechat-mini/src/pages/workspace/index.ts)、[小程序会话](../../src/server/wechat-mini.ts) |

## 简历、对话与编辑

| 流程 | 转换、守卫与可见结果 | 实现入口 |
| --- | --- | --- |
| 库与对话存档恢复 | 按身份读取 → 校验 → 可用或保存受限。网页首次缺键可建示例，已存空数组保持空库，损坏值保留。简历与聊天有各自的读写失败状态。小程序合并存储工作区，写成功后才发布内存变更。 | [网页简历存储](../../src/lib/storage.ts)、[聊天存储](../../src/lib/chat-storage.ts)、[原生存档 schema](../../src/domain/mini-workspace.ts) |
| 跨标签页与选择 | 网页收到简历库 storage 事件 → 重读本分区 → 校正所选 ID、活动对话和预览 → 旧删除确认与撤销失效。运行中的原位修改在应用结果前比较请求来源与当前稿；他处编辑优先，用户可核对后重发。完整聊天按本机存档恢复。 | [Workspace 的 syncLibrary](../../src/routes/index.tsx)、[简历库规则](../../src/domain/resume-library.ts) |
| 工作台导航与弹层 | 对话、库、模板之间导航，手机可在对话与预览间切换。预览可进入编辑。弹窗、输入框菜单、历史和账户有各自开关；打开菜单、选简历、切模板均无生成副作用。网页确认框默认焦点在取消。 | [网页工作台](../../src/routes/index.tsx)、[Modal](../../src/components/Modal.tsx)、[原生导航](../../wechat-mini/src/pages/workspace/index.wxml) |
| 对话与快捷命令 | 空线程 → 引导 → 输入草稿 → 用户发送。填入示例只改空输入框。网页显式导入、润色、JD 提交时把意图绑定到本次 assistant-ui run，入队后消费命令。普通消息重新识别意图，空库遇到 JD 先提示导入。 | [AgentChat](../../src/components/chat/AgentChat.tsx)、[ChatWelcome](../../src/components/chat/ChatWelcome.tsx)、[inferIntent](../../src/domain/resume.ts) |
| 岗位原句选材 | 明确发起定制 → Agent 提交岗位版本名、底稿段号和条号 → 共享工具按段校验并前置原句 → 记录独立版本与首条变动。越界引用不能生成草稿；未选要点继续保留，缺证问题可随成稿核对。 | [选材工具](../../src/server/resume-tools.ts)、[来源核对](../../src/domain/tailor-review.ts) |
| 线程归档与核对卡 | 新对话建立新 ID；打开历史恢复消息。网页线程记录关联简历、最近结果和待恢复请求，核对卡按当前简历匹配。小程序归档消息，新开或打开历史时切换 threadId；当前简历由工作区选择。 | [网页线程](../../src/lib/chat-storage.ts)、[原生页面的 newChat / history](../../wechat-mini/src/pages/workspace/index.ts) |
| 事实来源与版本 | 新请求按意图构建。导入使用空事实、空库与空历史；润色读取选中稿；JD 从当前稿和有界候选检索。校验结果决定原位更新、新增版本或保持原稿。润色和定制延续示例来源，导入个人经历时清除示例标识。 | [resumeRequestContext / finalizeAgentResult](../../src/domain/resume.ts)、[原生结果应用](../../src/domain/mini-workspace.ts) |
| 文件与文本导入 | 选择 → 大小、类型校验 → 提取 → 核对文本 → 显式提交。Web 在本机提取，小程序登录后上传 DOCX / PDF 至服务端临时提取。换文件、关闭、超时、扫描件或超限有各自出口。Web JSON 校验后直接新增副本；小程序 JSON 选择 → 读取 → 确认新增 → 保存。 | [浏览器提取](../../src/lib/document-import.ts)、[小程序鉴权提取](../../src/server/mini-document.ts)、[限制](../../src/domain/document-import.ts)、[原生导入](../../wechat-mini/src/pages/workspace/index.ts) |
| 手工编辑与富文本 | Web 编辑事务将白名单 Markdown 写回选中稿，粘贴时校验字符及条数，失败保留原文与选区外内容。小程序打开编辑创建草稿，保存经 schema 校验后写入，关闭丢弃草稿。删除经历先确认。 | [富文本编辑器](../../src/components/resume/RichTextEditor.tsx)、[ResumeEditor](../../src/components/resume/ResumeEditor.tsx)、[原生编辑](../../wechat-mini/src/pages/workspace/index.ts) |
| 整份删除、清重与撤销 | 选定目标 → 确认或取消 → 按剩余库选择 → 当页可撤销。网页清重保留选中副本，撤销复原原选择及对应线程。撤销只在同身份且库仍是当次操作的结果时有效；原生整份删除保留上次快照。 | [删除确认](../../src/components/ConfirmDelete.tsx)、[工作台撤销](../../src/routes/index.tsx)、[去重规则](../../src/domain/resume-library.ts) |
| 排版、预览与导出 | 选模板采用预设，局部覆盖可重置，重选同模板保留覆盖。章节移动更新 sectionOrder。预览、打印读取同一稿。网页可导出当前稿 JSON；小程序导出整库，写文件成功后进入系统分享。 | [模板](../../src/domain/resume-presentation.ts)、[章节](../../src/domain/resume-layout.ts)、[网页渲染](../../src/components/resume/ResumeDocument.tsx)、[原生渲染](../../wechat-mini/src/presentation.ts) |

## 运行、恢复与计费

| 流程 | 转换、守卫与可见结果 | 实现入口 |
| --- | --- | --- |
| 客户端执行与恢复 | 保存不可变请求 → POST → 直接结果或 202 → 查询终态。网页 durable 刷新复用原请求，轻量运行中断后提示重发。小程序进入后台暂停轮询，前台恢复；提交收到 400/402/413/429 时恢复可编辑原文，连接失败保留同一请求。 | [网页 adapter](../../src/components/chat/AgentChat.tsx)、[原生 resume / poll / cancel](../../wechat-mini/src/pages/workspace/index.ts) |
| 服务端准入与轻量执行 | 校验正文、模式、会话和模型配置 → 预留额度 → pi-ai 调用 → 工具结果或错误。演示走确定性规则。已执行的相同请求可返回缓存结果，同键不同正文冲突。 | [请求入口](../../src/server/agent-handler.ts)、[pi-ai 执行](../../src/server/resume-agent.ts) |
| 持久运行与 alarm | 每个已鉴权的用户、线程、请求对应一个 DO。持久化输入 → 提交 Harness → 任务运行 → 查已校验工具结果或失败。alarm 唤醒任务并核对账本。DELETE 调用 abort 并执行核对；断开连接允许任务继续。 | [Harness](../../src/server/durable-harness.ts)、[DO 宿主](../../src/server/resume-session.ts) |
| 模型工具与事实核对 | 每轮一个受控工具 → 校验参数与意图 → read / unchanged / applied，或拒绝。章节和排版专用工具返回实际变更；JD 事实匹配失败进入待确认项。只读和无变化结果保留当前稿。 | [工具执行](../../src/server/resume-tools.ts)、[JD 事实校验](../../src/domain/tailor-evidence.ts) |
| 用量账本 | 以身份、threadId、requestId 及正文指纹准入 → reserved → settled 或 released。并发和额度以 D1 条件写入判断；收费使用本轮费率快照及实际用量。超出预留或终态不明保留待核对。 | [账本](../../src/server/billing.ts)、[费用换算](../../src/domain/billing.ts)、[D1 约束](../../migrations/0002_billing.sql) |
| 账户用量与购买界面 | 访客读公开套餐，登录后读取本人摘要 → 显示用量或提供重试。购买、查单、关闭结账或管理订阅各有进行中及失败反馈。支付回跳进入查单，套餐由服务端摘要决定。 | [账户摘要](../../src/components/AccountDetails.tsx)、[套餐面板](../../src/components/BillingPanel.tsx)、[支付宝回跳](../../src/routes/billing/alipay-return.tsx) |
| Stripe Checkout 与 Portal | 无结账 → 锁定 attempt → 创建 session → 重用、完成、过期或关闭。已有订阅从 Portal 管理，创建结果不确定时保留待核对状态。 | [checkout / cancelCheckout / portal](../../src/server/stripe.ts) |
| Stripe 回调与订阅 | 验签 → receipt 去重 → 按订阅取得 lease → 获取供应商最新订阅及账单 → 原子提交权益与 receipt。未获 lease 可重试。active 且在有效期内的已付款订阅提供额度。 | [Stripe 同步](../../src/server/stripe.ts)、[权益周期](../../src/server/billing.ts) |
| 微信 Native 订单 | 创建或继续同一 pending 订单 → 扫码、回调或主动查单 → 已核实支付进入 paid，已核实关闭进入 closed。不确定时保留原单。 | [微信订单](../../src/server/wechat-pay.ts)、[订单约束](../../migrations/0003_wechat_pay.sql) |
| 支付宝订单与退款 | pending → paid / closed；paid → refund_pending → refunded。回跳、验签通知和定时补查汇入同一订单，确认全额退款后回收权益。 | [订单与退款](../../src/server/alipay-orders.ts)、[定时入口](../../src/worker.ts)、[订单约束](../../migrations/0004_alipay.sql) |
| 权益有效期 | 订单或订阅满足身份、环境、状态与时间条件 → 使用付费周期；国内也可以有独立有效期的测试授权，付费优先；无有效授权时按市场的 Free 周期计算。 | [billingPeriod](../../src/server/billing.ts)、[测试授权](../../migrations/0005_billing_test_grants.sql) |

## 怎样验证一次转换

| 变化 | 从正常入口观察的证据 |
| --- | --- |
| 导入中包含“工作职责”、导入失败后继续对话 | 捕获请求意图、事实来源、历史、简历数与选中 ID。网页恢复 durable 时比较刷新前后完整请求。见 [工作台端到端测试](../../tests/workspace.spec.ts)。 |
| 身份、前后台、额度或本机写盘在请求中变化 | 延迟响应、切换分区、模拟网络失败或准入拒绝，再检查 pending、原文、所选简历和持久化值。见 [小程序页面回归](../../src/domain/mini-client.test.ts)。 |
| 删除、回退、模板、文件导入 | 观察确认焦点、取消后的原文、撤销后的线程、刷新后的选择、打印与请求次数。见 [工作台](../../tests/workspace.spec.ts)、[文档](../../tests/documents.spec.ts)、[模板](../../tests/templates.spec.ts)。 |
| 重放、真实用量、重复通知 | 检查 Harness 重开后的任务身份、数据库条件更新及相同订单的权益周期。见 [恢复](../../src/server/durable-harness.test.ts)、[账本](../../src/server/billing.test.ts)、[Stripe](../../src/server/stripe.test.ts)、[微信](../../src/server/wechat-pay.test.ts)、[支付宝](../../src/server/alipay-orders.test.ts)。 |

本地测试可控制网络返回、时钟与存储。实际 OAuth 往返、真机前后台、模型供应商和商户结算仍需对应环境的验证。网页停止持久任务时等待 DELETE 回执，未确认时可在当前对话重试停止原请求。pi-ai 相同请求在账本仍有预留时返回 409，可用原请求继续查询；已结算或释放且无缓存结果时返回 410，小程序恢复输入供用户决定是否重新发送。
