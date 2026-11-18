import { expect, it } from 'vitest'
import { approximateWorkTenure } from './work-tenure'
import { demoAgent, emptyResume } from './resume'
import { agentPrompt, executeResumeTool } from '../server/resume-tools'

const job = (period: string) => ({
  company: '虚构软件公司',
  role: '前端开发',
  period,
  bullets: ['维护采购表单。'],
})
const source = {
  ...emptyResume,
  name: '虚构求职者',
  experience: [job('2024.11—2026.10')],
}
const jd = '前端开发。要求约两年工作经验；能独立完成无障碍测试。'
const input = {
  intent: 'tailor' as const,
  text: jd,
  resume: source,
  history: [],
}
const evidence = '2024.11—2026.10，共覆盖 24 个自然月'

it('按自然月合并重叠记录，保留间隔，不从最早到最晚直接相减', () => {
  const jobs = [
    job('2025年03月至2026年02月'),
    job('2023/01 - 2023/12'),
    job('2025-05 ~ 2025-12'),
  ]
  expect(
    approximateWorkTenure('1. 需具备 2 年左右的工作经验', jobs)?.receipt,
  ).toContain('2023.01—2023.12、2025.03—2026.02，共覆盖 24 个自然月')
  expect(
    approximateWorkTenure(jd, [job('2024.11—2025.10'), job('2024.11—2025.10')]),
  ).toBeUndefined()
})
it.each([
  '至少两年工作经验',
  '满两年工作经验',
  '约两年 React 工作经验',
  '约两年全职工作经验',
  '约两年工作经验以上',
  '约三年工作经验',
])('%s 不能由这条约数回执确认', (text) => {
  expect(approximateWorkTenure(text, source.experience)).toBeUndefined()
})
it.each([
  '2024.00—2026.10',
  '2026.10—2024.11',
  '2024—2026',
  '2024.11—至今',
  '2024.11—2026.13',
  '2094.11—2096.10',
])('不猜测不完整或无效的区间 %s', (period) => {
  expect(approximateWorkTenure(jd, [job(period)])).toBeUndefined()
})
it('真实工具和演示引用所选底稿的日期，保留另一个资格缺口与正文', () => {
  const gaps = [
    { requirement: '约两年工作经验', question: '具体入离职日是哪一天？' },
    { requirement: '无障碍测试', question: '独立测过哪些交互？' },
  ]
  const ranked = executeResumeTool(
    'resume_tailor',
    {
      label: '前端岗位',
      rankedBullets: [],
      gaps,
      keywords: ['约两年工作经验'],
    },
    input,
  )
  const updated = executeResumeTool(
    'resume_update',
    { resume: source, missing: ['约两年工作经验', '无障碍测试'] },
    input,
  )
  expect(JSON.parse(agentPrompt(input)).workPeriodEvidence).toContain(evidence)
  for (const result of [ranked, updated, demoAgent(input)]) {
    expect(result.message).toContain(evidence)
    expect(result.resume.experience).toEqual(source.experience)
    expect(result.resume.summary).toBe(source.summary)
    expect(result.resume.id).not.toBe(source.id)
  }
  expect(ranked.missing).toEqual(['「无障碍测试」：独立测过哪些交互？'])
  expect(updated.missing).toEqual(['无障碍测试'])
})
