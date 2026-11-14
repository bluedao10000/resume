import { z } from 'zod'
import type { Resume } from './resume'

export const TemplateSchema = z.enum([
  'editorial',
  'minimal',
  'professional',
  'technical',
])
export const PresentationSchema = z.object({
  summary: z.enum(['plain', 'inset']),
  skills: z.enum(['tags', 'list', 'columns']),
  experience: z.enum(['bullets', 'ruled']),
  density: z.enum(['comfortable', 'compact']),
})
export type Presentation = z.infer<typeof PresentationSchema>
export type Template = z.infer<typeof TemplateSchema>
export const resumeTemplates: {
  id: Template
  name: string
  description: string
  presentation: Presentation
}[] = [
  {
    id: 'editorial',
    name: '经典叙事',
    description: '衬线标题 · 标签技能',
    presentation: {
      summary: 'plain',
      skills: 'tags',
      experience: 'bullets',
      density: 'comfortable',
    },
  },
  {
    id: 'minimal',
    name: '极简留白',
    description: '无衬线标题 · 留白分隔',
    presentation: {
      summary: 'plain',
      skills: 'tags',
      experience: 'bullets',
      density: 'comfortable',
    },
  },
  {
    id: 'professional',
    name: '标准单栏',
    description: '居中页首 · 逐项技能',
    presentation: {
      summary: 'plain',
      skills: 'list',
      experience: 'bullets',
      density: 'comfortable',
    },
  },
  {
    id: 'technical',
    name: '技术清单',
    description: '重点简介 · 双列技能',
    presentation: {
      summary: 'inset',
      skills: 'columns',
      experience: 'ruled',
      density: 'compact',
    },
  },
]
export function templateDefinition(id: Template) {
  return resumeTemplates.find((template) => template.id === id)!
}
export function presentationFor(resume: {
  template: Template
  presentation?: Presentation
}): Presentation {
  return resume.presentation ?? templateDefinition(resume.template).presentation
}

export const SetPresentationSchema = z
  .object({
    template: TemplateSchema.optional(),
    presentation: PresentationSchema.partial().optional(),
    reset: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.template !== undefined ||
      value.reset === true ||
      Object.keys(value.presentation ?? {}).length > 0,
    { message: '请指定模板或排版设置' },
  )

export function setResumePresentation(
  resume: Resume,
  input: z.infer<typeof SetPresentationSchema>,
) {
  const settings = SetPresentationSchema.parse(input)
  const template = settings.template ?? resume.template
  const base =
    settings.reset || template !== resume.template
      ? templateDefinition(template).presentation
      : presentationFor(resume)
  const presentation = { ...base, ...settings.presentation }
  const fields = [
    ...(template !== resume.template ? ['template'] : []),
    ...(JSON.stringify(presentation) !== JSON.stringify(presentationFor(resume))
      ? ['presentation']
      : []),
  ]
  const applied = fields.length > 0
  return {
    resume: applied ? { ...resume, template, presentation } : resume,
    applied,
    message: applied
      ? `已更新“${templateDefinition(template).name}”的内容排版。`
      : '当前排版已符合要求，无需调整。',
    changes: applied ? ['更新模板与内容排版'] : [],
    keywords: [],
    missing: [],
    operation: {
      tool: 'resume.setPresentation',
      status: applied ? ('applied' as const) : ('unchanged' as const),
      fields,
    },
  }
}

// Deterministic preview mode supports the same small, explicit layout vocabulary.
export function parsePresentationRequest(text: string) {
  const template = /使用|换成|切换|改成|选择|应用/.test(text)
    ? resumeTemplates.find(({ name }) => text.includes(name))?.id
    : undefined
  const presentation: Partial<Presentation> = {}
  if (/技能.*双列/.test(text)) presentation.skills = 'columns'
  else if (/技能.*标签/.test(text)) presentation.skills = 'tags'
  else if (/技能.*逐项/.test(text)) presentation.skills = 'list'
  if (/简介.*重点区块/.test(text)) presentation.summary = 'inset'
  else if (/简介.*正文段落/.test(text)) presentation.summary = 'plain'
  if (/工作要点.*分隔段落/.test(text)) presentation.experience = 'ruled'
  else if (/工作要点.*项目符号/.test(text)) presentation.experience = 'bullets'
  const layoutRequest =
    template || Object.keys(presentation).length > 0 || /排版|版式/.test(text)
  if (layoutRequest && /紧凑/.test(text)) presentation.density = 'compact'
  else if (layoutRequest && /舒展/.test(text))
    presentation.density = 'comfortable'
  const reset = /恢复模板排版|重置排版/.test(text)
  return template || reset || Object.keys(presentation).length
    ? { template, presentation, reset }
    : null
}
