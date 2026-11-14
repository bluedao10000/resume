# 文档导入与富文本

日期：2026-11-14。当前实现，不涉及数据库迁移。

## 用户流程

从输入框上方首次导入入口或“＋”菜单进入，选择 PDF、DOCX、TXT、MD 或 Folio JSON。文件仅在浏览器读取与提取，不上传原始附件，不请求模型。原文编辑器显示基本格式，用户核对后点击“整理为简历”才执行既有 Agent 请求和计费。Folio JSON 为结构化备份，校验后直接加入简历库，不调用模型。

关闭窗口、切换身份或选择另一个文件会取消旧任务。读取失败、格式错误、超限和取消不覆盖已有原文，不创建简历。扫描 PDF 没有文字时提示先 OCR；加密 PDF/DOCX 提示先解锁；旧二进制 DOC 需另存 DOCX。当前不提供 OCR、图片导入、原附件存储或原版式复刻。

## 组件与数据

- `src/domain/document-import.ts`：格式、大小、文字长度和 DOCX ZIP 目录校验。
- `src/lib/document-import.ts`：按需加载、取消、超时和统一错误处理。
- `src/lib/docx-worker.ts`：Mammoth 浏览器版在专用 Worker 中提取 HTML，禁用外部文件和内嵌样式映射，忽略图片；退出时终止 Worker。
- `src/lib/pdf-import.ts`：PDF.js 内置 Worker，读取文字项与位置，恢复基本行、段落、项目符号；CMap、字体与 wasm 来自本站静态资源。
- `src/lib/html-to-markdown.ts`：DOMPurify 过滤粘贴/DOCX HTML，Turndown 转为 Markdown；保留加粗、斜体、标题、段落、列表与安全链接。
- `RichTextEditor`：Tiptap，所见即所得编辑、格式工具条、超限反馈；SSR 不立即实例化，编辑器按需加载。
- `RichText`：React Markdown 语义节点白名单，不解释原始 HTML、图片或可执行 URL。所有正文标题统一为文档内部小标题。

沿用 `summary: string`、`skills: string[]`、`experience[].bullets: string[]`，内容允许 Markdown。不增加 HTML 副本、第二份消息存储或数据库字段。旧纯文本与 JSON 备份继续兼容。技能及工作要点的顶层列表对应数组条目，预览由模板决定外层样式；条目内可保存强调、段落及嵌套列表。`domain/rich-text.ts` 负责数组与编辑器 Markdown 互转，检索使用去格式文本。

`ResumeDocument` 是预览、两套模板与打印的同一个渲染入口。格式跟随简历保存、刷新及 JSON 导出/重新导入，不另存主题颜色、字号或任意 CSS。

## Agent 契约

两种 pi 运行时共用 `resume-tools.ts`。`resume_update` 接收上述 Markdown 字段。系统提示要求保留已有有效格式，按主题组织段落或短列表，每条工作要点只强调 1–2 处有事实依据的技术、责任或成果。不要整段加粗、堆砌标题、插入 HTML 或编造量化成果。姓名、公司、时间等元数据保持纯文本。生成是否实际使用样式仍由工具返回内容决定，不能只凭回复声称格式已变。

聊天粘贴的 HTML 同样净化并转为 Markdown，再写入 assistant-ui 原有 composer；文本框中可见 Markdown 符号，整理后的简历显示对应样式。

## 提取质量与安全边界

DOCX 保留常见语义格式，不承诺保留 Word 的字体、颜色、页边距、浮动文本框、复杂表格和多栏布局。PDF 主要恢复文字与阅读顺序，多栏顺序和字体强调可能丢失；核对后可用工具条补充格式。图像和附件链接不导入。

ZIP 中央目录检查声明的解压大小、加密标记、目录完整性与 ZIP64；不将该检查视为完整 ZIP 安全验证。文件大小、专用 Worker、超时终止共同限制异常文档。PDF.js 与 Mammoth 依赖锁定版本；升级需重新运行真实文件测试。原文不是系统指令；既有事实规则、鉴权、请求幂等与计费继续适用。

## 配置和运维

唯一人工入口为 `.env`：

| 参数                         | 当前默认值 | 作用                                            |
| ---------------------------- | ---------- | ----------------------------------------------- |
| `IMPORT_MAX_FILE_BYTES`      | 10485760   | 10MB 文件上限                                   |
| `IMPORT_MAX_PDF_PAGES`       | 30         | PDF 页数上限                                    |
| `IMPORT_MAX_TEXT_CHARACTERS` | 20000      | 提取文字/Markdown 长度，不能超过 Agent 协议上限 |
| `IMPORT_TIMEOUT_MS`          | 20000      | 单次提取超时                                    |
| `IMPORT_MAX_EXPANDED_BYTES`  | 52428800   | DOCX 声明解压大小及生成 HTML 上限               |

配置脚本校验并生成 Wrangler vars，`/api/config` 仅公开数字 `importLimits`。`config:generate` 复制 PDF.js 的 CMap、字体、wasm 及许可证至忽略的 `public/pdfjs/`，dev/build 自动执行；部署包括 Static Assets，无外部 CDN 依赖。勿将生成资源或真实简历加入 Git。

导入故障先检查 `/api/config` 限额、浏览器 Worker 加载和 `/pdfjs/` 静态资源是否成功，再核对是否扫描件、密码文件、损坏或超限。不要在日志中打印原文。浏览器测试使用合成 DOCX、英文/中文 PDF、无文字和超页数 PDF，调用真实提取器；Agent 和认证使用 fixture，真实模型需单独验证。
