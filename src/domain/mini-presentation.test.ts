import { expect, it } from 'vitest'
import {
  nativeMarkdown,
  documentView,
} from '../../wechat-mini/src/presentation'
import { sampleResume } from './resume'

it('preserves semantic formatting without allowing HTML, URLs or media into native nodes', () => {
  const nodes = nativeMarkdown(
    '**重点**与*强调* [网站](javascript:alert(1))\n\n<img src="x" onerror="alert(1)">\n\n![图片](https://example.com/a.png)',
  )
  const result = JSON.stringify(nodes)
  expect(result).toContain('strong')
  expect(result).toContain('em')
  expect(result).toContain('网站')
  expect(result).not.toMatch(/javascript|onerror|https:|img|图片/)
})
it('uses the canonical section order and preserves resume content and template preferences', () => {
  const resume = {
    ...sampleResume,
    sectionOrder: ['skills', 'summary', 'education', 'experience'] as const,
  }
  const view = documentView({
    ...resume,
    sectionOrder: [...resume.sectionOrder],
  })
  expect(view.sections.map((s) => s.id)).toEqual(resume.sectionOrder)
  expect(view.selected.name).toBe(sampleResume.name)
  expect(view.sections[3].entries[0].company).toBe(
    sampleResume.experience[0].company,
  )
})
