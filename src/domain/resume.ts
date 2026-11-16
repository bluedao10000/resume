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
    '以系统思维连接用户需求与商业目标。拥有 6 年数字产品设计经验，专注于复杂业务的体验简化、设计系统建设与跨团队协作，让好的设计成为可持续的产品竞争力。',
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
        '主导企业协作平台的核心体验设计，覆盖需求发现、交互方案与交付全流程。',
        '从 0 到 1 搭建产品设计系统，统一多端组件规范，提升团队协作效率。',
        '与产品、研发团队紧密协作，通过用户访谈和可用性测试持续迭代关键流程。',
      ],
    },
    {
      company: '一间数字',
      role: '产品设计师',
      period: '2020.07 — 2022.05',
      bullets: [
        '负责消费端产品的交互与视觉设计，将业务需求转化为清晰、易用的产品体验。',
        '参与用户研究与设计评审，推动设计方案从原型到上线的完整落地。',
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
      '保留原文内容，提取姓名、职位、邮箱及已出现的技能',
      '经历与教育需要你确认后再结构化',
    )
    message =
      '已将你提供的内容整理为一份新草稿。演示解析会把首行作为姓名、第二行作为职位，其余原文保留在个人简介中。你可以在右侧编辑与核对。'
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
      '按照 JD 中有事实依据的关键词重排技能',
      '优先展示与岗位相关的工作要点',
      '生成独立版本，保留基础简历',
    )
    message = `定制草稿已经准备好。我优先展示了与岗位相关的经历和 ${keywords.length} 项已有技能。${missing.length ? `“${missing.join('、')}”还缺少事实依据，请补充真实经历后再加入。` : '请在投递前核对内容。'}\n\n演示模式采用关键词规则排序；连接真实模型后可生成更深入的语义改写。`
  } else {
    resume.experience.forEach((e) => {
      e.bullets = e.bullets.map((b) =>
        b.replace(/^负责/, '承担').replace(/^参与/, '协作完成'),
      )
    })
    changes.push(
      '优化经历表述中的行动动词',
      '保留公司、时间及所有事实',
      '未添加未经证实的量化成果',
    )
    message =
      '已完成一轮轻量润色，保留原始经历与事实，优化了行动动词。右侧是可编辑的草稿。建议继续补充项目规模、你的具体贡献和可验证的成果，让经历更有说服力。'
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
