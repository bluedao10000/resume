import { describe, expect, it } from 'vitest'
import {
  AgentRequestSchema,
  demoAgent,
  emptyResume,
  type Resume,
} from '../domain/resume'
import { executeResumeTool } from './resume-tools'

const order = '维护 Java 订单查询与状态变更接口，补充参数校验与错误处理。'
const reconcile = '用 Go 编写批处理程序，读取业务记录并输出差异清单。'
const safeOrder =
  '维护 **Java 订单查询与状态变更接口**，补充参数校验和错误处理。'
const safeReconcile = '使用 **Go** 编写批处理程序，读取业务记录，输出差异清单。'
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
const safePublish = '与设计协作制作物料，**跟进发布与评论反馈**。'
const safeReview = '用 **Excel** 汇总阅读、报名和问卷数据并参与复盘。'
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
      bullets: [safeOrder],
      claims: ['接口设计'],
      retained: safeOrder,
    },
    {
      id: 'B2',
      source: backend,
      jd: 'Go 平台工程师，分布式任务调度、Kafka、Kubernetes。',
      bullets: [safeReconcile, '用 Go 编写单机批处理程序，支持人工重跑。'],
      claims: ['单机批处理'],
      retained: safeReconcile,
    },
    {
      id: 'C1',
      source: operations,
      jd: '内容运营，要求选题策划、发布排期与内容效果复盘。',
      bullets: ['负责发布排期，按活动节点推进发布节奏。', safePublish],
      claims: ['发布排期', '发布节奏'],
      retained: safePublish,
    },
    {
      id: 'C2',
      source: operations,
      jd: '增长运营，用户分层、漏斗、SQL，解释活动对留存的贡献。',
      bullets: [
        safeReview,
        '用数据复盘结果优化后续通知。',
        '用社群问题指导活动通知文案。',
      ],
      claims: ['优化后续通知', '指导活动通知文案'],
      retained: safeReview,
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
            summary: summary ?? `**${source.summary}**`,
            skills: source.skills.map((skill) => `**${skill}**`),
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
      expect(result.missing).not.toContain(expect.stringContaining(retained))
      expect(result.missing).toHaveLength(2 + Number(id === 'C2'))
      expect(result.resume.summary).toBe(
        summary ? source.summary : `**${source.summary}**`,
      )
      expect(result.resume.skills).toEqual(
        source.skills.map((skill) => `**${skill}**`),
      )
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

  it('keeps negation, numbers, and link targets material while allowing equivalent prose', () => {
    const source = {
      ...backend,
      experience: [
        {
          ...backend.experience[0],
          bullets: [
            '未主导接口设计。',
            '处理 10 条记录。',
            '维护 [接口文档](https://example.com/original)。',
          ],
        },
      ],
    }
    const safeSummary = '参与维护**现有微服务**。'
    const unsafe = [
      '主导接口设计。',
      '处理 **100** 条记录。',
      '维护 [接口文档](https://example.com/other)。',
    ]
    const result = executeResumeTool(
      'resume_update',
      {
        resume: {
          ...source,
          summary: safeSummary,
          experience: [{ ...source.experience[0], bullets: unsafe }],
        },
      },
      AgentRequestSchema.parse({
        intent: 'tailor',
        resume: source,
        text: '定制 JD',
      }),
    )
    expect(result.resume.summary).toBe(safeSummary)
    expect(result.resume.experience).toEqual(source.experience)
    expect(result.missing).toHaveLength(unsafe.length)
    for (const text of unsafe) expect(result.missing.join(' ')).toContain(text)
  })

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

describe('同一段活动经历投两个岗位', () => {
  const feedback = '汇总社群问题，分类后反馈给产品与客服。'
  const source = {
    ...operations,
    skills: ['Excel', 'NoSQL'],
    summary: '参与活动运营。未独立使用过 SQL。',
    experience: [{ ...operations.experience[0], bullets: [feedback, review] }],
  }
  for (const mode of ['demo', 'live-tool'] as const) {
    it(`${mode} 对照底稿说明哪条提前，只在数据岗核对 SQL`, () => {
      const run = (jd: string, bullets: string[]) => {
        const input = AgentRequestSchema.parse({
          text: jd,
          intent: 'tailor',
          resume: source,
        })
        return mode === 'demo'
          ? demoAgent(input)
          : executeResumeTool(
              'resume_update',
              {
                resume: {
                  ...source,
                  experience: [{ ...source.experience[0], bullets }],
                },
                keywords: ['Excel', 'SQL', '无关术语'],
              },
              input,
            )
      }
      const community = run('社群运营，整理社群问题并与客服协作。', [
        feedback,
        review,
      ])
      const data = run(
        '数据分析岗，使用 Excel 整理活动数据，要求能独立使用 SQL 取数。',
        [safeReview, feedback],
      )
      expect(community.resume.experience[0].bullets[0]).toBe(feedback)
      expect(community.message).not.toContain('提到首位')
      expect(community.missing.join(' ')).not.toContain('SQL')
      expect(data.keywords).toEqual(['Excel'])
      expect(data.missing.join(' ')).toContain('SQL')
      expect(data.message).toContain(`第 2 条已提到首位。原文是「${review}」`)
      expect(data.resume.experience[0].bullets[0]).toBe(
        mode === 'demo' ? review : safeReview,
      )
      expect(data.resume.skills).toEqual(source.skills)
      expect(data.resume.id).not.toBe(community.resume.id)
      expect(source.experience[0].bullets).toEqual([feedback, review])
    })
  }
  it('按原句位置选材，保留其余条目；缺口必须能引用 JD', () => {
    const input = AgentRequestSchema.parse({
      intent: 'tailor',
      text: '岗位要求 Excel 和 SQL。',
      resume: source,
      requestId: 'ranked',
    })
    const order = { experience: 1, bullet: 2 }
    const args = {
      label: '数据运营',
      rankedBullets: [order, order],
      keywords: ['Excel'],
      gaps: [
        { requirement: 'SQL', question: '你是否亲自写过查询？' },
        { requirement: '精通 Python', question: '用过哪些库？' },
      ],
    }
    const result = executeResumeTool('resume_tailor', args, input)
    expect(result.resume.experience[0].bullets).toEqual([review, feedback])
    expect(source.experience[0].bullets).toEqual([feedback, review])
    expect(result.resume.id).toBe('ranked')
    expect(result.operation?.tool).toBe('resume.tailor')
    expect(result.missing).toEqual(['「SQL」：你是否亲自写过查询？'])
    expect(() =>
      executeResumeTool(
        'resume_tailor',
        { ...args, rankedBullets: [{ experience: 1, bullet: 3 }] },
        input,
      ),
    ).toThrow()
    expect(() =>
      executeResumeTool('resume_tailor', args, { ...input, intent: 'polish' }),
    ).toThrow()
  })
})

describe('简介与采购项目的信息分工', () => {
  const evidence = '维护采购表单，对接审批接口并处理校验提示。'
  const source: Resume = {
    ...emptyResume,
    id: 'fictional-procurement-source',
    label: '业务前端底稿',
    name: '虚构前端候选人',
    title: '业务前端开发',
    summary: evidence,
    skills: ['React'],
    experience: [
      {
        company: '虚构采购科技',
        role: '前端开发',
        period: '2024.03—2026.10',
        bullets: [evidence, '参与采购后台列表页维护。'],
      },
    ],
  }
  const jd =
    '业务前端开发。负责企业采购后台表单维护，对接审批接口并处理校验提示；使用 React。'

  for (const mode of ['demo', 'live-tool'] as const) {
    it(`${mode} 精简同义简介但保留完整证据和方向性项目关键词`, () => {
      const run = (summary: string) => {
        const input = AgentRequestSchema.parse({
          intent: 'tailor',
          text: jd,
          resume: { ...source, summary },
          requestId: `procurement-${mode}`,
        })
        return mode === 'demo'
          ? demoAgent(input)
          : executeResumeTool(
              'resume_tailor',
              {
                label: '业务前端岗位稿',
                rankedBullets: [{ experience: 1, bullet: 1 }],
                keywords: ['React'],
              },
              input,
            )
      }

      const before = structuredClone(source)
      const result = run(evidence)
      expect(result.resume.summary).toBe(source.title)
      expect(result.resume.experience[0].bullets).toEqual(
        source.experience[0].bullets,
      )
      expect(result.resume.experience[0]).toMatchObject({
        company: source.experience[0].company,
        role: source.experience[0].role,
        period: source.experience[0].period,
      })
      expect(JSON.stringify(result.resume)).not.toContain('主导')
      expect(result.resume.id).not.toBe(source.id)
      expect(result.missing.join(' ')).not.toContain(evidence)
      expect(source).toEqual(before)

      const directional = run('主要做企业采购后台前端开发。')
      expect(directional.resume.summary).toBe('主要做企业采购后台前端开发。')
      expect(directional.resume.experience[0].bullets[0]).toBe(evidence)
    })
  }
})
