# 运维手册

更新：2026-11-14。所有命令从仓库根目录运行。

本手册描述当前已实现的运行方式。`.env` 唯一配置入口、D1 认证与计费存储、Worker Secrets 同步和自定义域名部署已实现；[技术架构设计](../architecture/technical-architecture.md) 中的 pi 双运行时已实施，云端简历/对话同步仍待实施。

## 本地开发

```bash
npm ci
cp .env.example .env
npm run db:migrate:local
npm run dev
```

默认地址 `http://localhost:5173`，若端口占用 Vite 会另选端口；OAuth 本地回调地址必须一致。开发服务器使用 Cloudflare Vite 插件的 Workers 环境，不需要自建 Node 后端。

默认 `APP_MODE=demo`、Google 凭据为空，可直接演示。要配置本地服务：

```bash
npm run config:generate
```

编辑根目录 `.env` 后重启开发服务器。该文件已被 gitignore 排除。开发时保持 `BETTER_AUTH_URL=http://localhost:5173`，并将 `CLOUDFLARE_CUSTOM_DOMAIN` 留空；生产使用真实 HTTPS origin 和对应域名。使用至少 32 个字符的随机 `BETTER_AUTH_SECRET`，例如 `openssl rand -base64 32`。

`predev` / `prebuild` 自动校验 `.env` 并生成 `wrangler.jsonc`，不再手工维护 Wrangler vars。脚本拒绝并存的 `.dev.vars`、`.env.local` 等配置文件。Vite 插件仅加载声明的运行密钥；生产部署前删除插件生成的预览专用 `dist/server/.dev.vars`。

## 配置表

| 配置                             | 默认/要求                                         | 用途                              |
| -------------------------------- | ------------------------------------------------- | --------------------------------- |
| APP_MODE                         | demo 或 live                                      | demo 不调用模型；live 要求登录    |
| BETTER_AUTH_URL                  | 完整应用 origin                                   | Better Auth 基础地址与 OAuth 回调 |
| BETTER_AUTH_SECRET               | 至少 32 字符随机值                                | session 和认证签名                |
| GOOGLE_CLIENT_ID                 | Google Web OAuth client                           | Google 登录                       |
| GOOGLE_CLIENT_SECRET             | Google OAuth secret                               | 仅服务端                          |
| DB                               | D1 binding                                        | 认证数据与 OAuth state            |
| AI_BASE_URL                      | 兼容 Chat Completions 的 `/v1` 地址               | 不自动添加 `/v1`                  |
| AI_API_KEY                       | provider 密钥                                     | 仅服务端                          |
| AGENT_RUNTIME                    | pi-ai / pi-durable                                | 轻量或持久化执行                  |
| AGENT_TIMEOUT_MS                 | 正整数毫秒                                        | provider 超时                     |
| AI_API                           | openai-responses / openai-completions             | pi API adapter                    |
| AI_CONTEXT_WINDOW                | 正整数 tokens                                     | 模型上下文声明                    |
| AI_MAX_OUTPUT_TOKENS             | 正整数 tokens                                     | 输出上限                          |
| AI_MODEL_REASONING               | true / false                                      | 推理能力                          |
| AI_REASONING_EFFORT              | off / minimal / low / medium / high / xhigh / max | 推理级别                          |
| AI_MODEL                         | provider 实际可用模型 ID                          | 不硬编码会过期的默认模型          |
| CLOUDFLARE_ACCOUNT_ID            | 账号 ID                                           | Wrangler 部署账号                 |
| CLOUDFLARE_API_TOKEN             | `.env` 或部署 shell 注入                          | 仅部署使用，不同步给 Worker       |
| CLOUDFLARE_WORKER_NAME           | Worker 名称                                       | 生成部署配置                      |
| CLOUDFLARE_COMPATIBILITY_DATE    | YYYY-MM-DD                                        | Workers 兼容日期                  |
| CLOUDFLARE_D1_DATABASE_NAME      | 数据库名称                                        | D1 配置                           |
| CLOUDFLARE_D1_DATABASE_ID        | 真实数据库 UUID                                   | 全零值只用于本地开发              |
| CLOUDFLARE_CUSTOM_DOMAIN         | 生产域名，开发留空                                | 自定义域名与 HTTPS origin 校验    |
| CLOUDFLARE_OBSERVABILITY_ENABLED | true / false                                      | Worker 观测开关                   |

## Google OAuth

1. 在 Google Cloud Console 创建或选择项目，配置 Google Auth Platform 的品牌、受众及测试用户（测试状态下）。
2. 创建“Web application” OAuth client。
3. 本地授权 JavaScript origin 配置 `http://localhost:5173`，redirect URI 精确配置 `http://localhost:5173/api/auth/callback/google`。
4. 生产追加真实 HTTPS origin 与 `https://<你的域名>/api/auth/callback/google`；不要以示例占位域名投产。
5. 设置 client ID / secret / Better Auth secret 与基础地址，执行 D1 迁移后重启。
6. 点击页面登录，Google 授权后回到工作台；检查用户名、刷新 session、退出登录。该完整流程需要真实 Google 项目，本次没有使用用户凭据进行外部授权。

登录后读取 `folio:resumes:v1:<userId>`，访客草稿保留在 guest 分区。原型不自动合并，建议导出/导入 JSON。D1 的认证数据不等于云端简历库。

PDF/DOCX 在浏览器本地提取。导入限额统一写入 `.env` 的 `IMPORT_*` 参数，经配置生成后由 `/api/config` 公开数字值；dev/build 自动复制 PDF.js 静态资源和许可证。文件解析失败时检查浏览器 Worker 与 `/pdfjs/` 资源，再核对密码、扫描件、损坏和超限，勿记录用户原文。完整参数和排障边界见 [文档导入与富文本](../architecture/document-import.md)。

## 真实模型

设置 `APP_MODE=live`，配置 `AI_BASE_URL`、`AI_API_KEY`、`AI_MODEL` 和 `AI_API`。所有模型调用经 pi-ai；`openai-responses` 调用 `/responses`，`openai-completions` 调用 `/chat/completions`。供应商须支持对应的函数工具调用，不再依赖 JSON object 模式。

当前模型实测：Chat Completions + 函数工具返回 400，推理 `none` 也被拒绝；`AI_API=openai-responses`、`AI_REASONING_EFFORT=low` 已通过 pi-ai 和原生 pi-durable 的真实工具执行。未更换模型，不固定发送 temperature。更改模型/端点后使用虚构数据执行 `npm run test:live`；该检查会真实调用配置的模型并产生用量，普通 `npm test` 跳过它。

`AGENT_RUNTIME=pi-ai` 在当前请求内完成一项工具操作，断开会取消请求；刷新显示中断信息，不自动重发。`pi-durable` 在原生 Harness 中运行，POST 返回 202 后通过 GET 查询结果，刷新恢复同一 pendingRequest，停止按钮独立调用 DELETE。断开浏览器不会取消持久化任务。授权以服务端 session userId 绑定 DO，客户端不能指定其他所有者。

`AGENT_TIMEOUT_MS` 控制单次 provider stream 超时（当前 45,000ms），`AI_CONTEXT_WINDOW` / `AI_MAX_OUTPUT_TOKENS` 声明上下文与输出上限，`AI_MODEL_REASONING` 声明模型能力，`AI_REASONING_EFFORT` 设置推理级别。模型失败或无效工具不更新原稿。轻量 API 返回安全错误与参考编号，durable 失败快照返回安全说明；日志不写入密钥、简历或供应商原始响应。

DO 使用 `ResumeAgentSession` 类和官方 `openDurableObjectSqliteStorage`。构造时预置 alarm，打开 Harness 后根据 `onWake` / `wake()` 设置最早唤醒或一分钟活动心跳，alarm 中先重设再 resume。任务空闲才删除 alarm。部署新增 SQLite class migration `resume-agent-v1`，由生成的 Wrangler 配置管理；计费另需 `0002_billing.sql` 迁移。每轮 actor 会保留执行数据，当前没有自动过期/服务端删除入口。

本机完整对话保存在 `folio:chats:v1:<guest|userId>`。清理浏览器存储会丢失 UI 历史；目前 JSON 仅备份简历。DO 记录不是跨设备完整聊天档案。退出登录保留本机分区，损坏数据不自动覆盖；历史版本未存储的对话无法恢复。

## Cloudflare Workers + Static Assets

生产入口：`https://r.story2u.xyz`。Worker：`folio-resume-agent`。认证数据库：`folio`。部署记录见 [2026-11-14 部署记录](../deployments/2026-11-14-cloudflare.md)。

```bash
# 在配置了 cf-bluedao 的交互式 zsh 中执行
cf-bluedao
npx wrangler d1 create folio
```

首次部署时，把返回的数据库 UUID 写入 `.env` 的 `CLOUDFLARE_D1_DATABASE_ID`，填写账号、Worker、域名等配置。现有环境已经创建数据库，重新发布不要重复创建。生产 `BETTER_AUTH_URL=https://r.story2u.xyz`，`CLOUDFLARE_CUSTOM_DOMAIN=r.story2u.xyz`。

```bash
npm run db:migrate:remote
npm run deploy
```

`npm run deploy` 构建后，按白名单将 `BETTER_AUTH_SECRET`、`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`AI_API_KEY` 同步为 Worker Secrets，再部署 `dist/server/wrangler.json`。Cloudflare 部署凭据不会同步到运行时。非敏感运行参数进入 vars，自定义域名由 Wrangler custom domain route 绑定。

Cloudflare Vite 插件生成 `dist/server/wrangler.json`，内含 Worker 入口和 `../client` 静态资源目录；Wrangler 使用插件生成的构建配置。不要手工维护第二个 Worker，也不要把仓库根目录作为 assets 发布。部署脚本会立即发布变化，当前没有分阶段发布流程。

`compatibility_date` 固定在 2026-11-14，开启 `nodejs_compat`。实际部署需要账户有对应权限和足够的 Worker 体积/资源配额；构建时关注 bundle 大小，实际套餐以账户显示为准。

可用 `npm run preview` 预览构建结果。预览端口与开发端口可能不同，涉及 OAuth 时同步基础 URL 与 redirect URI。

## 数据库迁移

`0001_better_auth.sql` 由安装版本的 Better Auth `getMigrations` 生成，已在本地 D1 执行。该迁移包含认证表与索引；`0002_billing.sql` 另建计费表。

```bash
npm run db:generate > /tmp/folio-auth-schema.txt
```

此命令用于输出新的候选完整 schema。升级认证后先比较差异，再生成递增迁移；不要将完整建表语句直接重复应用，也不要改写已经应用的迁移。生产迁移前备份 D1，评估回滚和兼容性。SQLite 版本/驱动差异必须在 D1 本地及 staging 回归。

## 发布检查与回滚

发布前执行类型检查、领域测试、E2E 和生产构建，查看 `deploy --dry-run` 产物。staging 验证 Google OAuth、session 刷新、live 401、模型成功/超时/无效 JSON、打印和身份切换。生产开放前添加平台级限流与用户配额；当前代码未实现完整滥用防护。

回滚应用可使用 Cloudflare 控制台或 Wrangler 的 deployment rollback 功能，选择已验证部署。数据库使用向前兼容迁移，不假设应用回滚会自动回滚 schema。本机数据的恢复依赖 JSON 备份，清理站点数据会删除浏览器简历。

逐份删除只操作当前浏览器、当前身份分区的简历。可在页面内撤销最近一次删除，继续修改、刷新或切换身份后无法撤销，需要 JSON 备份恢复。删除最后一份会保存空数组，示例不会在刷新后重新出现；清理整个站点存储则相当于首次访问，会重新预置示例。本次变更不需要 D1 迁移。

未登录访问生产首页应展示落地页和 Google 入口；有效 session 直接进入工作台，退出后返回落地页。演示模式需要主动点击试用，配置失败不能进入隐式演示。发布回归包含删除确认的取消/Escape、侧栏同步、跨标签页删除、折叠明细、手机布局及原有生成/导出流程。

## 观测与排障

Wrangler 开启 observability。可通过 `npx wrangler tail` 查看 Worker 错误；禁止为排障打印简历原文、provider key、cookie 或 OAuth token。

| 症状                      | 排查                                                                  |
| ------------------------- | --------------------------------------------------------------------- |
| Google OAuth 待配置       | `/api/config` authConfigured；secret 是否存在；重启进程               |
| redirect_uri_mismatch     | Google 配置与 BETTER_AUTH_URL、端口、HTTPS、callback 路径是否逐字一致 |
| OAuth 回调数据库错误      | DB binding、真实 database_id、四张认证表是否迁移                      |
| live 401                  | 是否在同一 origin 登录，cookie 是否过期，session 查询是否正常         |
| live 503                  | AI_BASE_URL / AI_MODEL / AI_API_KEY 是否完整                          |
| live 502 / durable failed | 检查 pi API adapter、模型工具兼容性、推理级别、超时与参数校验         |
| 简历不见了                | 是否更换浏览器/账户，guest 分区是否存在；不承诺云端同步               |
| 保存失败                  | 浏览器容量/隐私模式/损坏数据；先导出 JSON 再清理数据                  |
| 页面可见但测试点击无反应  | SSR 首屏尚未 hydration；E2E 等待 `.app-shell[data-ready=true]`        |
| 生产静态资源 404          | build 是否成功，assets 是否指向 `dist/client`，是否部署插件产物       |
| PDF 出现空白/截断         | 打印预览检查缩放、纸张 A4、页眉页脚；模板的长块不要强制固定高度       |

## 后续运营工作

云端简历存储落地后需要账户数据导出/删除、备份恢复与访问审计。Agent 工具化后记录匿名 runId、延迟、token 和事实校验状态，并为超预算、持续 5xx、认证失败建立告警。当前没有假装这些设施已存在。

## Stripe 支付开通

计费首版默认启用 Free 额度。支付尚未配置时，Plus / Pro 展示月价但禁止结账。所有参数均填写项目根目录 `.env`，不要把 secret 放在 Vite 客户端变量、Git 或文档中。

1. 在 Stripe 商户后台先使用测试模式创建两个 USD 月 recurring price，分别 **$10 / 月**、**$50 / 月**，数量固定 1，不使用试用期、优惠券或自定义价格。
2. 将 secret key 写入 `STRIPE_SECRET_KEY`，两个 price ID 写入 `STRIPE_PLUS_PRICE_ID` 和 `STRIPE_PRO_PRICE_ID`。测试和正式模式不能混用。
3. 创建 webhook endpoint `https://r.story2u.xyz/api/billing/webhook`，选 API 版本 `2025-03-31.basil`；订阅 `invoice.paid`、`invoice.payment_failed`、`customer.subscription.updated`、`customer.subscription.deleted`、`checkout.session.completed`。签名 secret 写入 `STRIPE_WEBHOOK_SECRET`。
4. 配置 Customer Portal，至少支持查看账单和取消订阅。可把专用 portal configuration ID 写入 `STRIPE_PORTAL_CONFIGURATION_ID`。默认先不开启即时套餐切换；如开启需明确按比例收款和权益周期规则，避免同周期反复切换造成争议。
5. 检查 `BILLING_*` 配额与费率，确保 `BILLING_MODEL=AI_MODEL`，更改费率时更新版本。`STRIPE_API_BASE_URL`、版本、超时、签名容差、结账有效期与同步锁有效期均在 `.env`，生产使用官方 HTTPS 地址。
6. 执行 `npm run config:generate`、本地验证及远端迁移后 `npm run deploy`。脚本只同步允许的 Stripe secret，不向静态资源写密钥。

正式开放前用测试商户实际验证：Free → Plus / Pro 付款 → webhook 开通 → 余额及真实用量；重复 webhook；支付失败不升级；取消续费本期仍有效；到期或欠费回到 Free；Portal 返回；中途取消 Checkout；两个标签页同时购买。模拟测试通过不等于上述真实支付已验证。测试数据验证后再切换正式模式的全部 key、price、webhook 和 portal 配置。

```bash
npm run db:migrate:local
npm run check
npm test
npm run test:e2e
npm run db:migrate:remote
npm run deploy
```

`cf-bluedao` 在交互 shell 中提供 Cloudflare 凭据；可使用 `zsh -ic 'eval "${aliases[cf-bluedao]}"; npm run db:migrate:remote'` 和对应 deploy 命令。不要输出凭据。先确认迁移成功再部署依赖新表的代码。

## 计费排障与数据边界

- `/api/billing/` 返回本人套餐和 no-store 摘要；401 检查登录，503 检查模型费率匹配、迁移与配置。签名 webhook 失败返回 5xx，由 Stripe 重试，不能手工把浏览器 `billing=success` 当付款凭证。
- 先查 Stripe authoritative subscription、invoice paid 状态、customer 与 `metadata.folio_user_id`、price、item 周期，再查 D1 `billing_subscriptions`。不认识的价格和多份有效订阅需要人工对账，不得简单赋予 Pro。
- `billing_runs.status='reserved'` 占用余额与并发。DO 活动任务由 alarm / wake / GET 重试结算。异常旧预留先核对运行终态与 provider usage；轻量进程崩溃及 D1→DO 交接故障没有自动回收，不得仅因时间较久便释放仍活动的请求。
- 确认从未发送供应商请求、或终态且没有报告用量后，才可由运维对精确 user/run 以 `WHERE status='reserved'` 条件释放。已有有效 usage 时按该 run 的 `tariff_json` 结算；若超出预留，先查明协议与计价边界，不能以预估 Token 替代实际账单。当前没有后台对账按钮或自动退款流程。
- Stripe 网络超时可能已经创建 Checkout，因此保留待完成锁到过期。没有 session ID 的不确定结账不能直接取消重开。完成的支付需等待 webhook，不能再买一份；同订阅回调锁冲突交给 Stripe 重试。
- D1 新增计费与 pi-ai 最终结果缓存，其中可能含简历输出；完整简历库和 UI 历史仍是本机数据。DO 保留任务 transcript。清理本机站点不会清理这些服务端记录。账户删除和隐私导出尚待统一实现。
- 配额变更影响当前按配置计算的 allowance；费率快照不追溯修改已有 run。生产调整须评估在途预留和用户权益，不随意改低正在使用的额度。账本记录暂未自动过期。
- 退款与拒付尚未自动撤销权益，必须由运营核对并处理；启用真实支付前配置税务、账单支持与退款政策。
