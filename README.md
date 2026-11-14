# Folio · Chat-first 简历 Agent

通过对话整理简历、管理版本和按岗位定制。

## 本地运行

需要 Node.js 22.12+（推荐 Node 24）和 npm。首次启动无需 Google、Cloudflare 或模型密钥。

```bash
npm ci
cp .env.example .env
npm run db:migrate:local
npm run dev
```

打开 `http://localhost:5173`，在落地页点击“试用示例”。默认演示模式支持聊天、预览、编辑、版本保存、模板切换、PDF 打印与 JSON 导出。生产 live 模式从 Google 登录后进入工作台。

```bash
npm run check        # TypeScript
npm test             # 领域规则测试
npm run test:e2e     # 端到端；使用本机 Google Chrome
npm run build        # Workers SSR + Static Assets 构建
```

## 目录

```text
prototype/                  原型操作手册、页面验收与界面截图
 docs/product/              产品定义、需求、交互与迭代路线
 docs/research/             Astryx 调研、选型依据与一手资料
 docs/harness/              架构、功能契约、开发规范、运维与 Agent 评估
 src/
   components/chat/         assistant-ui 对话界面与 runtime adapter
   components/resume/       简历文档与结构化编辑组件
   domain/                  简历 schema、检索与演示规则
   lib/                     浏览器身份客户端、本机存储与数据导出
   server/                  Better Auth 服务端工厂
   routes/                  TanStack Start 页面及 API
 migrations/                Better Auth D1 数据库迁移
 scripts/                   认证 schema 生成工具
 tests/                     浏览器工作流与 API 测试
```

## 文档入口

- [正式开发技术架构](docs/architecture/technical-architecture.md)：`.env` 统一配置、pi-ai / pi-durable、数据模型、事件协议与开发顺序（pi 双运行时与受控工具已接入，云端业务存储待实施）。
- [产品需求](docs/product/PRD.md)：用户场景、边界、成功标准、版本路线。
- [界面设计约定](docs/product/interface.md)：落地页、工作台、删除确认，以及 UX / DX / AX 的共同约束。
- [产品原型](prototype/README.md)：交互路径、演示步骤、界面记录。
- [Astryx 调研](docs/research/astryx.md)：接入依据、组件分层、版本与参考来源。
- [Harness 总览](docs/harness/README.md)：架构、功能、规范、运维与评估。
- [运维手册](docs/harness/operations.md)：Google OAuth、真实模型、D1、Workers 部署。
- [AGENTS.md](AGENTS.md)：后续编码 Agent 的仓库操作约束。

## 已实现与边界

真实接入 Astryx、assistant-ui、TanStack Start、Vite、Better Auth 和 Cloudflare Vite 插件。Better Auth 使用 D1，并提供 Google 登录入口；需要配置自己的 Google 凭据才能完成授权。

默认演示 Agent 使用确定性规则，不调用大模型。live 使用 pi-ai 的 Responses / Chat Completions adapter，通过 Better Auth session 校验后调用模型并验证工具执行。Google 授权入口已验证，完整 Google 账号授权由用户完成。

普通对话修改与润色保存到当前简历，不增加条目；导入和按岗位定制新增简历，继续修改定制稿仍更新该稿。当前没有逐轮聊天修改历史与回滚，已有副本不会自动删除。

简历库按访客 / Google user ID 在当前浏览器 localStorage 分区。D1 当前只存认证数据；没有云端简历/聊天同步、PDF/DOCX 解析、复杂工具规划或服务端 PDF 渲染。完整对话按身份保存在本机，刷新会恢复，可从侧栏“历史对话”重开；模型接收最近最多 40 条、合计 32,000 字符上下文。JSON 目前只备份简历。`live` 模式会把输入和检索出的事实来源发送给所配置的模型服务。

首次进入工作空间预置一份虚构的“林知夏”示例简历，列表、预览和打印均明确标识。删除整份简历、工作经历和清理重复副本均先确认。整份删除或清理后，在继续修改或刷新前可撤销最近一次操作。删除最后一份后保持空库，刷新不会重新插入示例。侧栏与预览同步当前集合，其他标签页的变更也会同步。

> 当前是可运行、可评审的产品原型。下一阶段优先建设用户隔离的 D1 简历存储、完整事实溯源与评估集。

Agent 模型访问基于 `@earendil-works/pi-ai@1.5.2`。`.env` 的 `AGENT_RUNTIME` 可选 `pi-ai` / `pi-durable`；当前生产配置使用后者，在 SQLite Durable Object 中保存每轮原生 Harness 任务与工具结果，刷新复用原请求。`AI_API` 选择 pi 的 Responses 或 Chat Completions adapter，当前模型需要 Responses + `AI_REASONING_EFFORT=low` 才能调用函数工具。章节移动、内容更新和只读回答共享受校验的工具，章节顺序由所有简历渲染入口读取。
