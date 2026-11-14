import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { ResumeDocument } from '../components/resume/ResumeDocument'
import { ResumeSchema, sampleResume, finalizeAgentResult } from './resume'
import { deduplicateResumes } from './resume-library'
import {
  presentationFor,
  resumeTemplates,
  setResumePresentation,
  SetPresentationSchema,
} from './resume-presentation'

describe('模板与内容排版', () => {
  it('旧简历按模板读取预设，新模板及局部设置可通过 JSON 恢复', () => {
    expect(presentationFor(sampleResume).skills).toBe('tags')
    const result = setResumePresentation(sampleResume, {
      template: 'technical',
      presentation: { density: 'comfortable' },
    })
    const restored = ResumeSchema.parse(
      JSON.parse(JSON.stringify(result.resume)),
    )
    expect(presentationFor(restored)).toEqual({
      summary: 'inset',
      skills: 'columns',
      experience: 'ruled',
      density: 'comfortable',
    })
    expect(SetPresentationSchema.safeParse({}).success).toBe(false)
    expect(
      SetPresentationSchema.safeParse({ presentation: { skills: 'invalid' } })
        .success,
    ).toBe(false)
  })
  it('排版只修改呈现，保留身份、富文本、章节顺序与示例来源，重复请求无变化', () => {
    const source = {
      ...sampleResume,
      summary: '**架构设计**\n\n工作经历保持真实。',
    }
    const result = setResumePresentation(source, {
      presentation: { skills: 'columns', density: 'compact' },
    })
    expect(result.resume).toEqual({
      ...source,
      presentation: presentationFor(result.resume),
    })
    const again = setResumePresentation(result.resume, {
      presentation: { skills: 'columns', density: 'compact' },
    })
    expect(again.applied).toBe(false)
    expect(again.operation.status).toBe('unchanged')
    expect(
      setResumePresentation(result.resume, { reset: true }).resume.presentation,
    ).toEqual(presentationFor(sampleResume))
  })
  it('普通模型更新不能覆盖人工排版，不同排版不能作为重复副本删除', () => {
    const source = setResumePresentation(sampleResume, {
      template: 'technical',
    }).resume
    const result = finalizeAgentResult(
      {
        resume: { ...sampleResume, summary: '修改的简介' },
        applied: true,
        message: '',
        changes: [],
        keywords: [],
        missing: [],
      },
      'polish',
      source,
    )
    expect(result.resume.template).toBe('technical')
    expect(result.resume.presentation).toEqual(source.presentation)
    const other = setResumePresentation(sampleResume, {
      presentation: { skills: 'columns' },
    }).resume
    expect(
      deduplicateResumes(
        [sampleResume, { ...other, id: 'other' }],
        sampleResume.id,
      ),
    ).toHaveLength(2)
  })
  it('每套模板使用相同正文与章节顺序，空章节和联系方式不产生空区块', () => {
    for (const { id } of resumeTemplates) {
      const html = renderToStaticMarkup(
        createElement(ResumeDocument, {
          resume: {
            ...sampleResume,
            template: id,
            summary: '核心 **能力**',
            sectionOrder: ['skills', 'summary', 'experience', 'education'],
          },
        }),
      )
      expect(html).toContain('<strong>能力</strong>')
      expect(html.indexOf('专业技能')).toBeLessThan(html.indexOf('关于我'))
      expect(html).toContain('data-density=')
      const empty = renderToStaticMarkup(
        createElement(ResumeDocument, {
          resume: {
            ...sampleResume,
            template: id,
            summary: '',
            skills: [],
            experience: [],
            education: '',
            location: '',
            email: '',
          },
        }),
      )
      expect(empty).not.toContain('resume-section')
      expect(empty).not.toContain('resume-contact')
    }
  })
})
