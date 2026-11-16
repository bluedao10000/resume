# Folio 微信小程序

在仓库根目录运行 `npm ci`、`npm run check:wechat`、`npm run build:wechat`，再用微信开发者工具导入此目录。

AppID 和 API origin 来自根 `.env`。生成的 `project.config.json` 与 `dist/` 不提交；客户端包不包含 AppSecret。未配置或未部署登录服务时，可点击“试用示例”验证本机规则演示。

功能、后端迁移、隐私与真实联调边界见 [小程序架构](../docs/architecture/wechat-mini.md)。

## 官方 CI 预览与开发版本上传

仓库使用锁定版本的 [`miniprogram-ci`](https://github.com/wechat-miniprogram/miniprogram-ci-dist)，通过根目录 npm scripts 执行。上传密钥与登录用 AppSecret 是两种凭据。根 `.env` 中配置：

```dotenv
WECHAT_MINI_APP_ID=你的小程序AppID
WECHAT_CI_PRIVATE_KEY_PATH=/absolute/path/private.your-appid.key
WECHAT_CI_ROBOT=1
# 可选；缺省版本为上海时间戳-Git短提交号，说明含提交号、dirty状态、产物哈希。
WECHAT_CI_VERSION=
WECHAT_CI_DESC=
```

CI 可以通过同名环境变量注入上传参数，将私钥 Secret 挂载为文件后传入路径。AppID 和构建配置仍在 `.env` 中填写；构建与上传会核对 AppID 是否一致。私钥请存放在仓库之外，不要粘贴到命令行或提交 Git。需要管理员在微信公众平台“开发管理 → 开发设置”启用代码上传密钥，并允许执行机器的出口 IP；遇到白名单错误，按微信实际返回配置对应 IP，不关闭限制。

```sh
CI=1 npm ci
npm run wx:prepare  # 类型检查、build:wechat、校验实际 project.config.json/miniprogramRoot
npm run wx:preview  # 官方预览，输出 artifacts/wechat/preview.jpg
npm run wx:upload   # 上传刚刚预览成功的同一份产物到开发版本
# 或一次执行上面三步：
npm run wx:release
```

`wx:prepare` 将已构建代码和生成的项目配置复制到 `artifacts/wechat/project/`，其中 `miniprogramRoot=dist/`。此隔离目录不含源代码、根 `.env`、私钥或后端代码。依赖已经通过 esbuild 打包，无需再执行 packNpm。`release.json` 记录 AppID、版本、说明、Git 提交、SHA-256 以及成功步骤；预览和上传不会自行重建，若产物已变化则拒绝继续。新代码需重新执行 `wx:prepare` 和预览；直接 `wx:upload` 可重复上传已准备并预览成功的产物。生成记录和二维码均被 Git 忽略。命令非零退出表示失败；没有成功记录就不能认为已上传。

二维码只说明微信预览接口成功，不代表手机端已验证。上传仅到开发版本，不自动提审或发布。后端采用 Cloudflare Workers + D1 + Durable Objects，按根仓库 `deploy` / `db:migrate:remote` 流程单独部署；这些命令不会随小程序上传执行，也不能以小程序上传成功证明后端部署成功。

使用 `CI=1 npm ci` 可避免官方工具的 Less 间接依赖把本仓库误判成开发环境、额外下载 Playwright 浏览器；不会跳过小程序构建或上传校验。

首页 / 体验版入口：`pages/workspace/index`（无开头 `/`，无文件扩展名）。公众平台生成体验版二维码时请使用此路径，不能填写 `pages/index`。CI 预览自动读取 `app.json` 第一项。

界面以 CN 手机端为基准：共享中性色、聊天与文档排版尺寸，原生 WXML 文档模板用于预览与缩略图。新增模板页支持简介、技能、工作要点、密度设置；数据仍存当前设备。微信系统导航栏、原生选择器和系统字体存在平台差异，真机最终视觉需扫码验证。
