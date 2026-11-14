import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { listMarkdown, markdownItems, plainText } from './rich-text'
import { RichText } from '../components/resume/RichText'
import { matchJD, sampleResume } from './resume'
describe('兼容 Markdown 的简历富文本', () => {
  it('技能和工作要点保留强调、段落、嵌套列表，旧文本不丢失', () => {
    const values = [
      '主导 **微服务架构设计**。',
      '### 技术栈\n\n*Go* / Redis\n\n- 订单\n- 用户',
    ]
    expect(markdownItems(listMarkdown(values))).toEqual(values)
    expect(markdownItems(listMarkdown(['React', '跨团队协作']))).toEqual([
      'React',
      '跨团队协作',
    ])
    expect(plainText('**React** 与 *TypeScript*')).toBe('React 与 TypeScript')
    expect(
      matchJD(
        { ...sampleResume, skills: ['**React** / *TypeScript*'] },
        'React TypeScript',
      ).keywords,
    ).toEqual(['React', 'TypeScript'])
  })
  it('共享渲染器保留结构，不执行 HTML、图片或危险链接', () => {
    const html = renderToStaticMarkup(
      createElement(RichText, {
        value:
          '### 核心工作\n\n主导 **架构设计** 与 *协作*。\n\n- 订单\n- 用户\n\n<script>alert(1)</script>\n\n![跟踪](https://tracker.invalid/pixel)\n\n[链接](javascript:alert%281%29)',
      }),
    )
    expect(html).toContain('<strong>架构设计</strong>')
    expect(html).toContain('<em>协作</em>')
    expect(html).toContain('<h3>核心工作</h3>')
    expect(html).toContain('<ul>')
    expect(html).not.toMatch(/<script|<img|href="javascript:/)
  })
})
