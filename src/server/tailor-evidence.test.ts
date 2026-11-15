import { describe, expect, it } from 'vitest'
import { AgentRequestSchema, emptyResume, type Resume } from '../domain/resume'
import { executeResumeTool } from './resume-tools'

const order = '维护 Java 订单查询与状态变更接口，补充参数校验与错误处理。'
const reconcile = '用 Go 编写批处理程序，读取业务记录并输出差异清单。'
const backend: Resume = {
  ...emptyResume,
  id: 'fictional-backend',
  name: '虚构后端',
  title: '后端开发工程师',
  summary: '参与既有微服务维护。',
  skills: ['Java', 'Go', 'MySQL', 'Redis'],
  experience: [
    {
      company: '虚构企业服务',
      role: '后端开发工程师',
      period: '2022.11—2026.10',
      bullets: [order, reconcile, '按团队约定维护 Redis 缓存失效逻辑。'],
    },
  ],
}
const publish = '与设计协作制作物料，跟进发布和评论反馈。'
const community = '汇总社群问题，分类后反馈产品与客服。'
const review = '使用 Excel 汇总阅读、报名和问卷数据并参与复盘。'
const operations: Resume = {
  ...emptyResume,
  id: 'fictional-operations',
  name: '虚构运营',
  title: '运营专员',
  summary: '参与线上活动，撰写公众号与社群内容。',
  skills: ['内容编辑', '活动执行', '社群沟通', 'Excel 基础整理'],
  experience: [
    {
      company: '虚构学习服务',
      role: '运营专员',
      period: '2023.11—2026.10',
      bullets: [publish, community, review],
    },
  ],
}

describe('Folio 模拟报告的定制稿事实边界', () => {
  it.each([
    {
      id: 'B1',
      source: backend,
      jd: '业务后端开发，Java、MySQL、Redis、接口设计与异常排查。',
      summary: '负责接口设计与异常处理。',
      bullets: [order],
      claims: ['接口设计'],
      retained: order,
    },
    {
      id: 'B2',
      source: backend,
      jd: 'Go 平台工程师，分布式任务调度、Kafka、Kubernetes。',
      bullets: [reconcile, '用 Go 编写单机批处理程序，支持人工重跑。'],
      claims: ['单机批处理'],
      retained: reconcile,
    },
    {
      id: 'C1',
      source: operations,
      jd: '内容运营，要求选题策划、发布排期与内容效果复盘。',
      bullets: ['负责发布排期，按活动节点推进发布节奏。', publish],
      claims: ['发布排期', '发布节奏'],
      retained: publish,
    },
    {
      id: 'C2',
      source: operations,
      jd: '增长运营，用户分层、漏斗、SQL，解释活动对留存的贡献。',
      bullets: [
        review,
        '用数据复盘结果优化后续通知。',
        '用社群问题指导活动通知文案。',
      ],
      claims: ['优化后续通知', '指导活动通知文案'],
      retained: review,
    },
  ])(
    '$id keeps supported evidence and moves proposed claims to the review card',
    ({ id, source, jd, summary, bullets, claims, retained }) => {
      const before = structuredClone(source)
      const result = executeResumeTool(
        'resume_update',
        {
          resume: {
            ...source,
            label: `岗位稿 ${id}`,
            summary: summary ?? source.summary,
            experience: [{ ...source.experience[0], bullets }],
          },
          missing: ['岗位要求待核对'],
        },
        AgentRequestSchema.parse({
          intent: 'tailor',
          resume: source,
          text: jd,
          requestId: `test-${id}`,
        }),
      )
      const document = JSON.stringify(result.resume)
      for (const claim of claims) {
        expect(document).not.toContain(claim)
        expect(result.missing).toEqual(
          expect.arrayContaining([
            expect.stringMatching(new RegExp(`^请确认.*${claim}`)),
          ]),
        )
      }
      expect(result.missing).toContain('岗位要求待核对')
      expect(result.resume.experience[0].bullets[0]).toBe(retained)
      expect(result.resume.experience[0].bullets).toHaveLength(
        source.experience[0].bullets.length,
      )
      expect(result.resume.id).toBe(`test-${id}`)
      expect(result.resume.label).toBe(`岗位稿 ${id}`)
      expect(result.message).toContain('核对卡')
      expect(source).toEqual(before)
    },
  )

  it('keeps facts attached to their original job and preserves duplicate original bullets', () => {
    const first = { ...backend.experience[0], bullets: [order, order] }
    const second = { ...first, role: '工具开发', bullets: [reconcile] }
    const source = { ...backend, experience: [first, second] }
    const result = executeResumeTool(
      'resume_update',
      {
        resume: {
          ...source,
          title: 'Go 平台工程师（JD 定制）',
          experience: [{ ...second, bullets: [reconcile, order] }, first],
        },
      },
      AgentRequestSchema.parse({
        intent: 'tailor',
        resume: source,
        text: 'Go JD',
      }),
    )
    expect(result.resume.title).toBe(backend.title)
    expect(result.resume.experience).toEqual([second, first])
    expect(result.missing.join('\n')).toContain(order)
  })
})
