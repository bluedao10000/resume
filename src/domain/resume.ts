import { boundedHistory } from './chat-context'
import { z } from 'zod'
import { plainText } from './rich-text'
import {
  TemplateSchema,
  PresentationSchema,
  parsePresentationRequest,
  setResumePresentation,
} from './resume-presentation'
import {
  SectionOrderSchema,
  moveResumeSection,
  parseSectionMove,
} from './resume-layout'
export const ResumeSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  title: z.string(),
  email: z.string(),
  location: z.string(),
  summary: z.string(),
  skills: z.array(z.string()).max(30),
  experience: z
    .array(
      z.object({
        company: z.string(),
        role: z.string(),
        period: z.string(),
        bullets: z.array(z.string()).max(12),
      }),
    )
    .max(15),
  education: z.string(),
  label: z.string(),
  updatedAt: z.string(),
  template: TemplateSchema,
  presentation: PresentationSchema.optional(),
  isExample: z.boolean().optional(),
  sectionOrder: SectionOrderSchema.optional(),
})
export type Resume = z.infer<typeof ResumeSchema>
export const AgentRequestSchema = z.object({
  intent: z.enum(['polish', 'tailor', 'import']),
  text: z.string().min(1).max(20000),
  resume: ResumeSchema,
  library: z.array(ResumeSchema).max(20).optional(),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(20000),
      }),
    )
    .max(40)
    .default([])
    .transform(boundedHistory),
  threadId: z.string().min(1).max(120).optional(),
  requestId: z.string().min(1).max(120).optional(),
})
export const AgentResultSchema = z.object({
  message: z.string(),
  resume: ResumeSchema,
  changes: z.array(z.string()),
  keywords: z.array(z.string()),
  missing: z.array(z.string()),
  applied: z.boolean().default(true),
  operation: z
    .object({
      tool: z.string(),
      status: z.enum(['applied', 'unchanged', 'read']),
      fields: z.array(z.string()),
    })
    .optional(),
})
export type AgentResult = z.infer<typeof AgentResultSchema>
// Identity and provenance are application decisions, never model output.
export function finalizeAgentResult(
  result: AgentResult,
  intent: z.infer<typeof AgentRequestSchema>['intent'],
  source: Resume,
  creationId?: string,
): AgentResult {
  return {
    ...result,
    resume: {
      ...result.resume,
      id: intent === 'polish' ? source.id : (creationId ?? crypto.randomUUID()),
      label: intent === 'polish' ? source.label : result.resume.label,
      template: source.template,
      presentation: source.presentation,
      sectionOrder: result.resume.sectionOrder ?? source.sectionOrder,
      isExample: intent !== 'import' && isExampleResume(source),
      updatedAt: new Date().toISOString().slice(0, 10),
    },
  }
}
export const sampleResume: Resume = {
  id: 'demo-base',
  name: '林知夏',
  title: '高级产品设计师',
  email: 'zhixia.lin@example.com',
  location: '上海，中国',
  summary:
    '6 年数字产品设计经验，主要做 B 端协作工具与设计系统。习惯从真实业务流程出发拆解复杂交互，推进多端组件规范落地，和产品、研发一起把方案做成好用的线上产品。',
  skills: [
    '产品设计',
    '用户研究',
    '设计系统',
    'Figma',
    '交互设计',
    '原型设计',
    '跨团队协作',
  ],
  experience: [
    {
      company: '山海科技',
      role: '高级产品设计师',
      period: '2022.06 — 至今',
      bullets: [
        '负责企业协作平台核心模块的体验设计，跟进从需求梳理、交互方案到研发走查的完整落地。',
        '从 0 到 1 搭建产品设计系统，统一多端组件规范，提升团队协作效率。',
        '配合产品与研发做用户访谈和可用性测试，根据真实反馈持续打磨高频操作流程。',
      ],
    },
    {
      company: '一间数字',
      role: '产品设计师',
      period: '2020.07 — 2022.05',
      bullets: [
        '负责 C 端核心功能的交互与视觉设计，把复杂的业务规则理顺成直观好懂的界面。',
        '参与日常用户调研与设计评审，跟进方案从原型验证到正式上线的全过程。',
      ],
    },
  ],
  education: '江南大学 · 视觉传达设计 · 本科 · 2016 — 2020',
  label: '示例简历',
  updatedAt: '2026-11-14',
  template: 'editorial',
  isExample: true,
}
export function isExampleResume(resume: Resume): boolean {
  return (
    resume.isExample ??
    (resume.id === sampleResume.id &&
      resume.name === sampleResume.name &&
      resume.email === sampleResume.email)
  )
}

// Transport-only context for importing the first resume; never a library item.
export const emptyResume: Resume = {
  id: 'empty-draft',
  name: '待补充姓名',
  title: '',
  email: '',
  location: '',
  summary: '',
  skills: [],
  experience: [],
  education: '',
  label: '',
  updatedAt: '',
  template: 'editorial',
  isExample: false,
}
export const sampleJD =
  '高级产品设计师 · Notion\n负责协作产品的端到端产品设计，构建可扩展的设计系统。要求拥有用户研究、交互设计、Figma 与跨团队协作经验。能够把复杂流程转化为简单直觉的体验。加分项：B2B SaaS、英语沟通。'
export const knownSkills = [
  '产品设计',
  '用户研究',
  '设计系统',
  'Figma',
  '交互设计',
  '原型设计',
  '跨团队协作',
  'B2B SaaS',
  '英语沟通',
  'React',
  'TypeScript',
  'Python',
  'SQL',
  '数据分析',
  '项目管理',
  '用户增长',
  'JavaScript',
  'TanStack',
  'Vite',
]
export function matchJD(resume: Resume, jd: string) {
  const required = knownSkills.filter((s) =>
    jd.toLowerCase().includes(s.toLowerCase()),
  )
  const evidence = [
    resume.summary,
    ...resume.skills,
    ...resume.experience.flatMap((e) => [e.role, ...e.bullets]),
  ]
    .map(plainText)
    .join(' ')
    .toLowerCase()
  return {
    keywords: required.filter((s) => evidence.includes(s.toLowerCase())),
    missing: required.filter((s) => !evidence.includes(s.toLowerCase())),
  }
}
export function inferIntent(
  text: string,
  fallback: 'polish' | 'tailor' | 'import',
): 'polish' | 'tailor' | 'import' {
  // The explicit JD action wins over incidental contact emails in a job post.
  if (fallback === 'tailor') return 'tailor'
  if (/岗位职责|任职要求|工作职责|job description|\bJD\b/i.test(text))
    return 'tailor'
  if (text.includes('\n') && /我的简历[：:]|以下是我的简历/.test(text))
    return 'import'
  if (text.includes('\n') && /[\w.+-]+@[\w.-]+\.[a-zA-Z]+/.test(text))
    return 'import'
  return fallback
}
export function retrieveResume(
  current: Resume,
  library: Resume[],
  jd: string,
): Resume {
  // Prefer the current version on ties; only supplied facts participate in retrieval.
  const candidates = library.filter(
    (r) =>
      r.id !== current.id &&
      r.name === current.name &&
      (!r.email || !current.email || r.email === current.email),
  )
  return [current, ...candidates].reduce(
    (best, r) =>
      matchJD(r, jd).keywords.length > matchJD(best, jd).keywords.length
        ? r
        : best,
    current,
  )
}
export function demoAgent(
  input: z.input<typeof AgentRequestSchema>,
  creationId?: string,
): AgentResult {
  const source =
    input.intent === 'tailor'
      ? retrieveResume(input.resume, input.library ?? [], input.text)
      : input.resume
  const resume = ResumeSchema.parse(source)
  const move = input.intent === 'polish' ? parseSectionMove(input.text) : null
  if (move)
    return finalizeAgentResult(
      moveResumeSection(resume, move),
      input.intent,
      source,
    )
  const presentation =
    input.intent === 'polish' ? parsePresentationRequest(input.text) : null
  if (presentation) {
    const result = setResumePresentation(resume, presentation)
    return finalizeAgentResult(result, input.intent, result.resume)
  }
  resume.isExample = input.intent !== 'import' && isExampleResume(source)
  const changes: string[] = []
  let message = ''
  if (input.intent === 'import') {
    const lines = input.text
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean)
    resume.name = plainText(lines[0]).slice(0, 40)
    resume.email = input.text.match(/[\w.+-]+@[\w.-]+\.[a-zA-Z]+/)?.[0] ?? ''
    resume.title = lines[1] ? plainText(lines[1]).slice(0, 80) : '待补充职位'
    resume.location = ''
    resume.summary = lines.slice(2).join('\n') || '请继续补充你的工作经历。'
    resume.experience = []
    resume.education = ''
    resume.skills = knownSkills.filter((s) =>
      input.text.toLowerCase().includes(s.toLowerCase()),
    )
    resume.label = `${resume.name}的基础简历`
    changes.push(
      '保留原文，提取姓名、职位、邮箱和已出现的技能标签',
      '工作经历与教育背景留待你确认后再拆分',
    )
    message =
      '已经帮你整理成一份新草稿了。演示模式下默认把第一行当姓名、第二行当职位，剩下的原文先放在个人简介里，你可以直接在右侧拆段编辑。'
  } else if (input.intent === 'tailor') {
    const { keywords, missing } = matchJD(resume, input.text)
    resume.label = `${input.text.split('\n')[0].slice(0, 35)} · 定制版`
    resume.skills.sort(
      (a, b) => Number(keywords.includes(b)) - Number(keywords.includes(a)),
    )
    resume.experience.forEach((e) =>
      e.bullets.sort(
        (a, b) =>
          keywords.filter((k) => b.includes(k)).length -
          keywords.filter((k) => a.includes(k)).length,
      ),
    )
    changes.push(
      `从简历库选择“${source.label}”作为事实来源`,
      '按 JD 里能对应上的关键词重排技能顺序',
      '把更贴合岗位的经历要点提到前面',
      '单独存为新版本，原简历不动',
    )
    message = `定制草稿弄好了，帮你把最匹配这个岗位的经历和 ${keywords.length} 项技能排到了前面。${missing.length ? `另外 JD 里提到的「${missing.join('、')}」在你现有简历里没找到对应经历，我先没往里写，如果你确实做过可以补上。` : '投递前记得再通读核对一遍。'}\n\n当前演示模式按关键词规则排序；接入真实模型后会做更细的语境改写。`
  } else {
    resume.experience.forEach((e) => {
      e.bullets = e.bullets.map((b) =>
        b.replace(/^负责/, '推进').replace(/^参与/, '配合落地'),
      )
    })
    changes.push(
      '顺了一遍经历里的动词和句式，去掉生硬套话',
      '保留原有公司、时间段和全部事实',
      '不编造未提供的量化数据',
    )
    message =
      '先帮你顺了一遍措辞，原来的公司、时间和事实都没动。你可以直接在右侧改字；如果手头有具体的项目体量、你负责的核心动作或实际产出，补上来会更有说服力。'
  }
  return finalizeAgentResult(
    {
      resume,
      message,
      changes,
      applied: true,
      ...matchJD(resume, input.intent === 'tailor' ? input.text : ''),
    },
    input.intent,
    source,
    creationId,
  )
}
