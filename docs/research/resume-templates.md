# 简历模板市场与内容排版

调研日期：2026-11-14。样本为产品官网和官方文档，观察模板与编辑方式；不代表市场份额、付费转化或 ATS 效果评测。官网的 ATS 宣传仅记录为厂商主张。

## 样本观察

中文产品补充：超级简历 WonderCV [9] 的首页同时组织简历模板、范文与 AI 生成/优化；简历本 [10] 按学生、程序员、产品、运营等职位提供参考，并分设自我评价、工作经历、专业技能写作入口。由此本次把模板呈现与三类内容的写法分开：预设解决版式，富文本与受事实约束的 Agent 解决表达。不采纳其营销页面的用户量、模板量、求职成功率或生成耗时作为验证结论。

| 样本                      | 可核实的模板/编辑方式                                                                              | 对 Folio 的启发                                         |
| ------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Resume.io [1]             | 目录包含 Simple、Professional、ATS、Two-column 等类别；示例包含强调技能和时间线的版式              | 按信息结构区分模板，提供清晰的单栏基线                  |
| Novorésumé [2]            | 包括 Skill-Based、Hybrid、Traditional、Minimalist、Tech；可重排章节，也提供技能等级图形            | 技能与经历的权重可以不同；不采用无事实依据的技能评分条  |
| Enhancv [3]               | 同时提供 Single Column、Double Column、Timeline、Ivy League 等；模板介绍区分紧凑、清晰和时间线布局 | 工作经历要有明显的公司、职位、时间、要点层次            |
| Reactive Resume [4–7]     | 使用当前用户的内容绘制模板缩略图；模板与条目外观、文字格式、密度分别设置；支持摘要与经历描述富文本 | 内容与呈现分开保存，局部设置比不断复制模板更容易维护    |
| Overleaf / Awesome CV [8] | 使用语义标记组织 CV，模板源包含 A4、页边距、强调色和字体等设置                                     | 用结构化数据控制排版；不导入其 LaTeX 引擎或复制模板源码 |

## 本次产品决策

采用四个可直接使用的模板预设，配合少量内容排版选项：

| 模板     | 个人简介 | 专业技能 | 工作要点 | 默认密度 |
| -------- | -------- | -------- | -------- | -------- |
| 经典叙事 | 正文段落 | 标签     | 项目符号 | 舒展     |
| 极简留白 | 正文段落 | 标签     | 项目符号 | 舒展     |
| 标准单栏 | 正文段落 | 逐项清单 | 项目符号 | 舒展     |
| 技术清单 | 重点区块 | 双列分组 | 分隔段落 | 紧凑     |

前两套保留已有视觉。标准单栏使用居中页首、单栏正文、纯文字技能清单和明确章节线。技术清单强调简介，技能使用局部双列，工作要点用细线区分。整份简历依然按 `sectionOrder` 线性排列，双列只影响技能区，不做整页侧栏与跨栏阅读顺序。

用户在“简历模板 → 内容排版”分别选择简介、技能、工作要点和密度；恢复模板预设不删除正文。切换到另一套模板使用新预设，重新选择当前模板保留自定义设置。缩略图使用用户当前内容；当前模板显示自定义排版，其他模板显示各自预设。

## 三类内容规则

- **个人简介**：短段落优先，核心专业方向选择性加粗。已有小标题和列表原样保留，不自动把段落拆成列表或生成履历数字。
- **专业技能**：短词可用标签；带描述的能力适合逐项清单；已有类别可使用 `**后端技术**：Go / Redis` 这样的条目呈现双列分组。长词允许换行，多段落条目占整行。切换版式不自动归类、删词或改写。
- **工作要点**：公司/时间、职位、要点形成三级层次；要点内可加粗技术、责任和有依据的成果。项目符号适合逐条扫描，分隔段落适合较长的职责说明。嵌套列表保留自身语义。打印允许长经历跨页，避免把整段经历强行锁在一页内。

模板只决定呈现，不保证某个 ATS 产品一定能正确解析。此次没有引入照片、能力百分比、装饰图表、任意字号/颜色编辑器，也不通过缩小字号承诺“自动压缩到一页”。后续如提供更复杂模板，需要使用实际导出 PDF 做读取顺序与分页验证。

## 一手资料

以下页面均在调研日读取成功，Reactive Resume 的 Markdown 页面为其官方文档正文。模板名称和功能可能随产品更新改变。

1. Resume.io — Resume templates：<https://resume.io/resume-templates>
2. Novorésumé — Resume templates：<https://novoresume.com/resume-templates>
3. Enhancv — Resume templates：<https://enhancv.com/resume-templates/>
4. Reactive Resume — Choosing a template：<https://docs.rxresu.me/guides/choosing-a-template.md>
5. Reactive Resume — Changing how entries look：<https://docs.rxresu.me/guides/changing-how-entries-look.md>
6. Reactive Resume — Formatting text：<https://docs.rxresu.me/guides/formatting-text.md>
7. Reactive Resume — Customizing typography：<https://docs.rxresu.me/guides/customizing-typography.md>
8. Overleaf — Awesome CV：<https://www.overleaf.com/latex/templates/awesome-cv/tvmzpvdjfqxp>
9. 超级简历 WonderCV：<https://www.wondercv.com/>
10. 简历本：<https://www.jianliben.com/>
