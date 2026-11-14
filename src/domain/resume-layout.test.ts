import { describe, expect, it } from 'vitest'
import { ResumeSchema, sampleResume } from './resume'
import {
  defaultSectionOrder,
  moveResumeSection,
  sectionOrder,
} from './resume-layout'
import { boundedHistory } from './chat-context'

describe('章节布局与上下文边界', () => {
  it('旧记录兼容默认布局，JSON 恢复保留新布局，重复章节无效', () => {
    expect(sectionOrder(sampleResume)).toEqual(defaultSectionOrder)
    const result = moveResumeSection(sampleResume, {
      section: 'skills',
      relativeTo: 'experience',
      position: 'before',
    })
    const restored = ResumeSchema.parse(
      JSON.parse(JSON.stringify(result.resume)),
    )
    expect(sectionOrder(restored)).toEqual([
      'summary',
      'skills',
      'experience',
      'education',
    ])
    expect(
      ResumeSchema.safeParse({
        ...sampleResume,
        sectionOrder: ['summary', 'skills', 'skills', 'education'],
      }).success,
    ).toBe(false)
    expect(sampleResume.sectionOrder).toBeUndefined()
  })
  it('模型窗口保留最近历史并限制总量，不截断本机原始记录', () => {
    const original = Array.from({ length: 50 }, (_, i) => ({
      role: 'user' as const,
      content: `${i}:` + 'x'.repeat(19990),
    }))
    const history = boundedHistory(original)
    expect(
      history.reduce((sum, message) => sum + message.content.length, 0),
    ).toBe(32000)
    expect(history.at(-1)?.content).toBe(original.at(-1)?.content)
    expect(original).toHaveLength(50)
    expect(
      boundedHistory(original.map((m) => ({ ...m, content: 'short' }))),
    ).toHaveLength(40)
  })
})
