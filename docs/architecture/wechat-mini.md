# Folio 微信小程序首版

小程序与 Web 在 `cn` 分支统一开发，原 `wechat` 分支保留迁移前的历史。原生 WXML/WXSS/TypeScript 客户端位于 `wechat-mini/src`，复用 `src/domain` 的 schema、演示、布局、模板与事实规则。没有通过 web-view 包装网页。

## 已实现

- 显式规则演示；微信登录进入独立用户空间。正式登录通过 `wx.login` → Worker `code2Session` → 应用会话。
- 对话整理、文本导入、JD 定制、简历库、编辑、四种模板的原生文本预览、章节排序、JSON 文件备份/导入。
- 普通修改原位更新，导入/JD 新增；示例标识保留，事实缺口独立展示，导入不带入示例事实。
- 本机身份分区；删空后保持空库，删除确认及当页撤销；后续写入清除撤销。存储失败不显示保存成功，损坏存档不自动覆盖。
- 完整当前对话和 immutable pending request 本机保存；新对话归档旧消息，历史入口列出最近六份归档。切换简历和模板不发起生成。
- 两种服务器 runtime 共用 `server/agent-handler.ts`，沿用服务端额度预留、实际用量与幂等结算。小程序传入的 userId 不参与授权。
- pi-durable 接收 202 后轮询，后台暂停轮询、回前台复用原请求；网络错误保留 pending，明确提供恢复/停止。pi-ai 可复用相同请求查询已有最终结果，不承诺任务中途退出后可继续执行。

## 平台边界

Astryx、assistant-ui 和 React ResumeDocument 是 DOM 组件，无法在原生小程序使用。网页保持原有组件；小程序只有一份 canonical workspace/message 状态，使用同一 ResumeSchema / sectionOrder / template 注册表与原生 document 模板。Markdown 在小程序中投影为安全纯文本，不解释 HTML。原生模板不是网页 A4 打印的像素级复刻。

首版不含 PDF/DOCX 提取、PDF 导出、小程序支付、网站账户自动绑定、跨设备简历/聊天同步。JSON 可备份全部简历，不含完整对话。没有 token streaming。演示模式在设备本机执行；真实模式传输必要事实与上下文给既有服务端及模型，D1/DO 记录留存边界与网页一致。

## 身份与会话

小程序 AppID 与网站扫码 AppID 分开配置。服务端只使用微信已验证的 AppID/openid 派生独立 user ID，插入既有 `user` 表；不根据客户端身份、email 或可选 unionid 自动合并网站账户。`wechat_mini_sessions` 保存 SHA-256 token 摘要、AppID、用户与七天有效期；原始随机 token 仅返回一次，由客户端发送 Authorization Bearer。退出立即删除对应会话，过期会话在登录时清理。微信 session_key 不持久化、不下发。网页仍使用 Better Auth session，未开启通用 Bearer 支持。

API 由自定义 Worker entry 分派 `/api/wechat-mini/{config,login,session,agent}`，不手改 routeTree。配置只公开模式、runtime、登录可用性。除配置和登录外都要求有效小程序会话，跨 AppID token 无效。该接口不提供客户端套餐或余额写入。

## 配置与启动

唯一人工配置源仍为根 `.env`：

```dotenv
WECHAT_MINI_APP_ID=你的小程序AppID
WECHAT_MINI_APP_SECRET=仅服务端使用的小程序AppSecret
BETTER_AUTH_URL=https://www.codeiy.com
```

仅配置 AppID 可构建项目；未配置 AppSecret 时登录明确关闭。运行：

```sh
npm ci
npm run check:wechat
npm run build:wechat
```

在微信开发者工具中导入仓库的 `wechat-mini/`。构建从 `.env` 生成 `project.config.json` 与公开 API origin，编译产物在 `wechat-mini/dist/`，均不手工维护。AppSecret 不进入小程序构建。开发者工具私有配置与产物忽略提交。

后端部署仍通过原有 `.env` → `config:generate` → Cloudflare 流水线，新增 secret 已纳入 allowlist。部署前在**用户指定的环境**执行迁移 `0006_wechat_mini.sql`。不得仅上传小程序前端后宣称登录可用。

## 上线前真实验证

需要对应小程序 AppSecret、后台合法 request 域名、已迁移并部署的 Worker 与微信开发者工具/真机。验证登录、退出撤销、额度不足、网络断开/后台恢复、长消息滚动、键盘不遮挡输入、JSON 文件分享及真实 Agent。应用备案、服务类目及隐私声明按微信后台实际要求配置；不将模拟接口测试描述为微信审核通过。

本地自动化覆盖构建包无 DOM 全局时的执行、导入/删除恢复/存储失败、身份分区、登录 token 哈希/过期/撤销、伪造身份拒绝。此环境未安装微信开发者工具，因此不能替代 WXML 原生编译、模拟器和真机检查。

官方登录契约：<https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/login.html>；code2Session：<https://developers.weixin.qq.com/miniprogram/dev/server/API/user-login/api_code2session.html>。

### 本次本地验证

TypeScript（网页及小程序）、88 项 Vitest 用例及 4 项配置测试通过；72 项现有网页 E2E 在隔离 demo 配置的生产构建预览下通过。直接使用本机 live `.env` 会重定向到正式域名，不能用来跑本地 E2E；当前开发运行器还存在 React 调试 `Console.createTask` 兼容问题，因此本次使用生产 preview。测试后恢复原 `.env` 并重新生成配置，关闭测试服务器。小程序原生 WXML 编译/真机与真实登录尚未验证。

### 官方 CI 验证（2026-11-16）

已使用 `miniprogram-ci@2.1.31` 完成原生编译、预览二维码生成和开发版本上传，两个命令均退出 0。版本 `202611162103-ebe4f8af`，AppID `wx2edf2f89a21fcff6`，产物 SHA-256 为 `97a58706928400d2be2e0c32c1d586acc6f7d6019df24660d013afe6fcd4ca13`。微信编译指出 WXML 属性中的换行字符串不兼容，已将换行连接移入 WXS 函数并重新预览、上传相同产物。记录与二维码保存在 Git 忽略的 `artifacts/wechat/`。这更新了上文“尚未原生编译验证”的阶段状态；仍未进行手机端验证、Cloudflare 后端部署、提审或正式发布。

### CN 手机界面对齐（2026-11-16）

以 `cn` 的 `src/styles.css`、ChatWelcome、ResumeDocument 和手机断点为视觉基线。原生页面使用同样的白底灰黑设计参数、60px 图标侧栏、12px 聊天正文、三张欢迎图示卡片、底部输入框与浮层操作菜单。简历预览、简历库缩略图和四套模板共用 WXML `resume` 模板；排版选项仍通过领域 `setResumePresentation` 更新当前简历，不创建副本。Markdown 经 AST 白名单转换为原生 rich-text 节点，丢弃原始 HTML 与媒体，仅呈现链接文字。不同平台字体、微信导航栏和原生选择器保留平台差异。

首页路径为 **`pages/workspace/index`**。公众平台的体验版入口须填写此路径；`pages/index` 不存在。CI 预览从构建后的 `app.json.pages[0]` 显式设置 pagePath，避免采用错误默认入口。

验证包括原生 TypeScript、数据/交互与 Markdown 安全测试、官方 miniprogram-ci 编译，以及 390px 浏览器近似渲染与 CN 手机网页截图对照。浏览器近似图不是微信运行截图，当前环境没有安装微信开发者工具；不宣称真机像素验收、键盘适配验收或生产后端部署完成。导入文字/JSON 和备份文案按实际能力展示，不冒用网页 PDF/DOCX 提取或导出能力。

### 真机连接排查（2026-11-16）

上传包 API origin 与后台截图一致为 `https://www.codeiy.com`。本机分别通过 IPv4 / IPv6 请求 `/api/wechat-mini/config`，HTTPS 证书校验成功，但服务均返回 HTTP 404 HTML；线上尚未提供此小程序接口。该证据不能解释真机 `wx.request.fail` 的具体传输原因：HTTP 404 通常由 success 回调接收，而旧客户端丢弃了 fail 的 errMsg。

客户端现在区分域名校验、TLS、DNS、超时、HTTP 404 和非 JSON 响应，显示经 URL 脱敏的微信诊断信息，且不记录请求头、token 或简历内容。诊断不关闭合法域名或证书校验，不静默降级为演示。后端上线需将小程序 API、Agent handler 适配与配置变更应用到 CN 环境，并执行 `0006_wechat_mini.sql`；本次排查仅上传诊断客户端，未执行生产迁移或部署。

### 合并开发目录（2026-11-16）

`cn` 现在同时维护 Web、小程序及后端。原生客户端统一放在 `wechat-mini/`，根目录 npm scripts、领域测试、CI staging 和忽略规则均使用新路径。Web `/api/agent` 与小程序 `/api/wechat-mini/agent` 共享 `src/server/agent-handler.ts`，仅认证入口不同；配置、领域规则、计费和 Durable Object 运行时共用，客户端本机库仍按身份隔离。迁移不会自动部署生产 API 或迁移线上数据库。

当前使用已存在的 `worktrees/cn` 工作区，以保留该工作区尚未提交的 Web 文案改动；其本机 `.env` 链接到仓库原有根 `.env`，没有复制另一套密钥。验证通过 Web / 小程序类型检查、94 项单元测试、Web 生产构建和 `wx:prepare`。上传项目目录由 `wechat-mini/project.config.json` 的 `miniprogramRoot` 解析，构建产物为 `wechat-mini/dist/`。

### 真机运行与按钮样式修复（2026-11-16）

真机报告的动态函数 `.apply is not a function` 对应 Zod 对象校验的 JIT 编译。原生 `runtime.ts` 在创建领域 schema 前设置 `z.config({ jitless: true })`，App 和 Page 两个独立 bundle 都先加载配置；Web 与后端保持原配置。新增受限 Function 构造器回归用例，修复前复现 `factory is not a function`，修复后导入、校验和新对话均通过，且动态构造次数为零。

移除 `app.json` 中的微信 `style: v2`，避免平台按钮预设覆盖项目自定义宽度与字重。欢迎卡片明确占满容器，正文使用可收缩的 flex 列，输入框图标保持 30px、JD 按钮按内容宽度显示。错误详情独立滚动，关闭按钮始终可见。95 项单元测试通过；390px 浏览器近似布局验证通过，不能代替微信真机验收。
