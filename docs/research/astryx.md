# Astryx 调研与技术选型

调研日期：2026-11-14。项目：Meta Astryx（MIT）；本原型锁定 `@astryxdesign/core@0.7.16`，具体依赖以根目录 package-lock.json 为准。

## 结论

Astryx 是设计系统而非 Agent 框架。它提供 React 组件、设计 token、主题、布局模式以及面向编码 Agent 的 CLI，不提供简历数据模型、LLM 运行时、认证或应用路由。因此本系统基于 Astryx 建立界面基础，简历领域与 Agent 执行层由本仓库独立实现。

官方 README 说明 React 19+ 为前置条件；消费预编译产物时无需配置 StyleX 构建插件。我们导入 `reset.css → astryx.css → theme-neutral/theme.css`，在根路由使用 `Theme` 和 `neutralTheme`，关键动作使用 `Button` 的 typed props：`label`、`isDisabled`、`isLoading`、`icon`、`variant`。CSS 用于领域专属版式和工作台外观。

## 接入策略

1. **设计基础**：Astryx 主题、样式层和通用行动按钮。使用包的子路径导入，避免无谓的 barrel 引入。
2. **领域组件**：`ResumeDocument`、`ResumeSection`、`ResumeEditor` 只接受结构化领域数据，通过普通 CSS 呈现打印版式。
3. **对话基础**：assistant-ui 管理消息、composer、生成与取消生命周期。Astryx 不替代聊天 runtime。
4. **应用基础**：TanStack Start 管理 SSR、文件路由和服务端 API；Vite 构建；Cloudflare 插件产出 Worker 与客户端静态文件。
5. **身份**：Better Auth 处理 Google OAuth 和 session；D1 存储认证表。

没有把所有 HTML 元素机械替换为 Astryx。聊天使用 assistant-ui primitives；打印文档保留语义化 HTML；导入/JD/导出对话框使用原生 `<dialog>` 以获得焦点限制、Escape 与 modal 语义。后续通用组件扩展应先查 Astryx CLI，再决定是否封装。

## 实际研究动作

- 阅读仓库根 README、core README 与预编译 CSS 的接入说明。
- 安装正式 npm 包，通过 `npm run astryx -- component Button` 查证完整 API。
- 检查已安装包的 TypeScript 声明，发现 assistant-ui 当前版本不再导出旧的 `useAssistantRuntime`。最终直接使用 `useLocalRuntime` 的返回值来操作 thread，构建与类型检查均验证该实现。
- 按 TanStack 官方 Cloudflare hosting 配置 `cloudflare({ viteEnvironment: { name: 'ssr' } })`，验证产出中 Static Assets 指向 `dist/client`。
- 使用 Better Auth 自带 `getMigrations` 生成 SQLite schema，并通过 Wrangler 本地 D1 执行；避免手写过时认证字段。

## 取舍与后续

- Astryx 当前处于 beta，根 package.json 使用精确版本，lockfile 纳入版本管理。升级先查看对应 CLI 文档，再做 SSR、交互和打印回归。
- 预编译全量 Astryx CSS 对原型接入友好，但样式体积较大。生产阶段评估官方主题/样式裁剪，不手动删除内部生成规则。
- assistant-ui 当前采用单 thread local runtime。消息流式输出、历史恢复与工具卡片依赖后续协议扩展，本阶段使用 JSON 响应完成后展示。
- 关键词检索是可解释的演示基线，不是语义检索，也不是招聘 ATS 的评分算法。
- 模型结构校验只能保证返回类型，不能证明事实正确。生产工具层还需字段级来源、差异审批和事实验证。

## 一手资料

- [Astryx 仓库](https://github.com/meta/astryx)
- [Astryx Core README](https://github.com/meta/astryx/blob/main/packages/core/README.md)
- [Astryx 官方文档](https://astryx.atmeta.com)
- [TanStack Start / Hosting](https://tanstack.com/start/latest/docs/framework/react/guide/hosting)
- [TanStack Start / Server routes](https://tanstack.com/start/latest/docs/framework/react/guide/server-routes)
- [assistant-ui / Local runtime](https://www.assistant-ui.com/docs/runtimes/custom/local)
- [assistant-ui 文档源码](https://github.com/assistant-ui/assistant-ui/tree/main/apps/docs/content/docs)
- [Better Auth / TanStack integration](https://www.better-auth.com/docs/integrations/tanstack)
- [Better Auth / Google](https://www.better-auth.com/docs/authentication/google)
- [Better Auth / Kysely adapter（含 D1）](https://www.better-auth.com/docs/adapters/other-relational-databases)
- [Cloudflare / TanStack Start](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/)

这些资料用于选型，最终可执行契约以锁定依赖的类型声明、仓库实现与测试为准。
