import { z } from 'zod'
import type { Resume } from './resume'

export const SectionIdSchema = z.enum([
  'summary',
  'experience',
  'skills',
  'education',
])
export type SectionId = z.infer<typeof SectionIdSchema>
export const defaultSectionOrder: SectionId[] = [
  'summary',
  'experience',
  'skills',
  'education',
]
export const SectionOrderSchema = z
  .array(SectionIdSchema)
  .length(defaultSectionOrder.length)
  .refine((order) => new Set(order).size === defaultSectionOrder.length, {
    message: '章节顺序必须包含每个章节且不得重复',
  })
export const MoveSectionSchema = z
  .object({
    section: SectionIdSchema,
    relativeTo: SectionIdSchema,
    position: z.enum(['before', 'after']),
  })
  .refine((move) => move.section !== move.relativeTo, {
    message: '不能相对自身移动章节',
  })
export const sectionNames: Record<SectionId, string> = {
  summary: '关于我',
  experience: '工作经历',
  skills: '专业技能',
  education: '教育背景',
}
export function sectionOrder(resume: Resume): SectionId[] {
  return resume.sectionOrder ?? defaultSectionOrder
}
export function moveResumeSection(
  resume: Resume,
  input: z.infer<typeof MoveSectionSchema>,
) {
  const move = MoveSectionSchema.parse(input)
  const before = sectionOrder(resume)
  const order = before.filter((id) => id !== move.section)
  order.splice(
    order.indexOf(move.relativeTo) + (move.position === 'after' ? 1 : 0),
    0,
    move.section,
  )
  const applied = order.some((id, index) => id !== before[index])
  const relation = `“${sectionNames[move.section]}”${move.position === 'before' ? '上移至' : '下移至'}“${sectionNames[move.relativeTo]}”${move.position === 'before' ? '上方' : '下方'}`
  return {
    resume: { ...resume, sectionOrder: order },
    applied,
    message: applied
      ? `已将${relation}。`
      : '当前章节已按该顺序排列，无需调整。',
    changes: applied ? [relation] : [],
    keywords: [],
    missing: [],
    operation: {
      tool: 'resume.reorderSections',
      status: applied ? ('applied' as const) : ('unchanged' as const),
      fields: applied ? ['sectionOrder'] : [],
    },
  }
}

// Deterministic demo support; live uses validated model function arguments.
export function parseSectionMove(text: string) {
  const aliases = [
    ['summary', '关于我|个人简介|简介'],
    ['experience', '工作经历|工作经验'],
    ['skills', '专业技能|技能'],
    ['education', '教育背景|教育经历|学历'],
  ] as const
  const mentions = aliases
    .map(([id, aliases]) => ({ id, match: new RegExp(aliases).exec(text) }))
    .filter((entry) => entry.match)
    .sort((a, b) => a.match!.index - b.match!.index)
  if (mentions.length !== 2 || !/移动|移到|放到|放在|调整|挪到|排在/.test(text))
    return null
  const position = /上方|上面|之前|前面/.test(text)
    ? 'before'
    : /下方|下面|之后|后面/.test(text)
      ? 'after'
      : null
  return position
    ? MoveSectionSchema.parse({
        section: mentions[0].id,
        relativeTo: mentions[1].id,
        position,
      })
    : null
}
