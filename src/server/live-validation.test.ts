import { it, expect } from 'vitest'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { parseEnv } from 'node:util'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BACKGROUND_CONTEXT as context } from '@earendil-works/chord/context'
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node'
import { runtimeDefaults } from '../config/runtime-defaults.mjs'
import { generateResume } from './resume-agent'
import {
  openResumeHarness,
  submitResumeTurn,
  resumeTurnSnapshot,
  resumeTurnUsage,
} from './durable-harness'
import { AgentRequestSchema, emptyResume, sampleResume } from '../domain/resume'
import {
  billingSummary,
  prepareBilledPayload,
  reserveRun,
  settleRun,
  type BillingEnv,
} from './billing'
import { testBillingDb } from './billing-test-db'
it.skipIf(process.env.FOLIO_LIVE_VALIDATION !== '1')(
  'configured provider executes real pi-ai and native pi-durable tools',
  async () => {
    const values = parseEnv(await readFile('.env', 'utf8'))
    const config = {
      ...runtimeDefaults(values.APP_MARKET),
      ...values,
    } as Record<string, string>
    const input = AgentRequestSchema.parse({
      intent: 'polish',
      text: '把专业技能移动到工作经历上方',
      resume: sampleResume,
      threadId: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
    })
    const direct = await generateResume(input, config)
    expect(direct.operation?.tool).toBe('resume.reorderSections')
    expect(direct.resume.sectionOrder).toEqual([
      'summary',
      'skills',
      'experience',
      'education',
    ])
    const answer = await generateResume(
      {
        ...input,
        text: '我刚才希望突出哪方面经验？只回答，不修改简历。',
        history: [
          { role: 'user', content: '后续请突出架构设计经验。' },
          { role: 'assistant', content: '好的，保留事实并突出架构设计经验。' },
        ],
      },
      config,
    )
    expect(answer.applied).toBe(false)
    expect(answer.message).toContain('架构')
    const dir = await mkdtemp(join(tmpdir(), 'folio-live-'))
    const harness = await openResumeHarness(
      await openNodeSqliteStorage(join(dir, 'turn.db')),
      config,
    )
    try {
      const turn = await submitResumeTurn(harness, {
        ...input,
        text: '使用技术清单模板，专业技能改成双列分组，排版紧凑。只改排版，不要修改内容。',
      })
      await turn.wait(context)
      const durable = await resumeTurnSnapshot(harness)
      expect(durable.status).toBe('completed')
      if (durable.status === 'completed') {
        expect(durable.result.operation?.tool).toBe('resume.setPresentation')
        expect(durable.result.resume.template).toBe('technical')
        expect(durable.result.resume.presentation?.skills).toBe('columns')
        expect(durable.result.resume.presentation?.density).toBe('compact')
        expect(durable.result.resume.experience).toEqual(
          sampleResume.experience,
        )
      }
    } finally {
      await harness.close(context)
      await rm(dir, { recursive: true, force: true })
    }
    const imported = await generateResume(
      {
        ...input,
        intent: 'import',
        requestId: crypto.randomUUID(),
        text: '王明\n前端工程师\nwang@example.com\n使用 **React** 和 **TypeScript** 开发后台页面。请保留技术关键词的加粗格式。',
      },
      config,
    )
    expect(imported.operation?.tool).toBe('resume.update')
    expect(imported.resume.name).toBe('王明')
    expect(imported.resume.email).toBe('wang@example.com')
    expect(imported.resume.isExample).toBe(false)
    expect(imported.resume.experience).toEqual([])
    expect(imported.resume.education).toBe('')
    expect(
      [imported.resume.summary, ...imported.resume.skills].join('\n'),
    ).toMatch(/\*\*(?:React|TypeScript)\*\*/)
  },
  120000,
)

it.skipIf(process.env.FOLIO_LIVE_VALIDATION !== '1')(
  'configured durable provider reports usage that settles in the billing ledger',
  async () => {
    const bindings = parseEnv(await readFile('.env', 'utf8')) as Record<
      string,
      string
    >
    const db = testBillingDb()
    const config = {
      ...runtimeDefaults(bindings.APP_MARKET),
      ...bindings,
      DB: db.env.DB,
    } as unknown as BillingEnv
    const directory = await mkdtemp(join(tmpdir(), 'folio-live-usage-'))
    try {
      const input = AgentRequestSchema.parse({
        intent: 'polish',
        text: '把专业技能移到工作经历上方，只调整章节顺序。',
        resume: sampleResume,
        threadId: crypto.randomUUID(),
        requestId: crypto.randomUUID(),
      })
      const { run } = await reserveRun(config, 'user-a', input)
      const harness = await openResumeHarness(
        await openNodeSqliteStorage(join(directory, 'turn.db')),
        bindings,
        undefined,
        undefined,
        async (payload) => prepareBilledPayload(payload, run, config.AI_API),
      )
      try {
        const turn = await submitResumeTurn(harness, input)
        await turn.wait(context)
        expect((await resumeTurnSnapshot(harness)).status).toBe('completed')
        const usage = await resumeTurnUsage(harness)
        expect(usage.input + usage.cacheRead).toBeGreaterThan(0)
        expect(usage.output).toBeGreaterThan(0)
        await settleRun(config, run.id, usage)
        const summary = await billingSummary(config, 'user-a')
        expect(summary.tokens).toEqual(usage)
        expect(summary.reserved).toBe(0)
        expect(summary.used).toBeGreaterThan(0)
      } finally {
        await harness.close(context)
      }
    } finally {
      db.close()
      await rm(directory, { recursive: true, force: true })
    }
  },
  120000,
)

it.skipIf(process.env.FOLIO_LIVE_VALIDATION !== '1')(
  'configured provider tailors the same Excel activity evidence for two different jobs',
  async () => {
    const values = parseEnv(await readFile('.env', 'utf8'))
    const config = {
      ...runtimeDefaults(values.APP_MARKET),
      ...values,
    } as Record<string, string>
    const feedback = '汇总社群问题，分类后反馈给产品与客服。'
    const review = '使用 Excel 汇总阅读、报名和问卷数据并参与复盘。'
    const resume = {
      ...emptyResume,
      name: '虚构求职者',
      title: '运营专员',
      skills: ['Excel'],
      experience: [
        {
          company: '虚构学习服务',
          role: '运营专员',
          period: '2024—2025',
          bullets: [feedback, review],
        },
      ],
    }
    const tailor = (text: string) =>
      generateResume({ resume, text, intent: 'tailor' }, config)
    const community = await tailor(
      '社群运营。收集用户反馈，整理高频问题，与产品和客服协作。',
    )
    const dir = await mkdtemp(join(tmpdir(), 'folio-live-jd-'))
    const harness = await openResumeHarness(
      await openNodeSqliteStorage(join(dir, 'turn.db')),
      config,
    )
    try {
      const turn = await submitResumeTurn(
        harness,
        AgentRequestSchema.parse({
          resume,
          intent: 'tailor',
          threadId: crypto.randomUUID(),
          requestId: crypto.randomUUID(),
          text: '数据分析岗。使用 Excel 整理活动数据，参与活动复盘；要求能独立使用 SQL 取数。',
        }),
      )
      await turn.wait(context)
      const snapshot = await resumeTurnSnapshot(harness)
      expect(snapshot.status).toBe('completed')
      if (snapshot.status !== 'completed') throw new Error('未取得数据岗草稿')
      const data = snapshot.result
      expect(['resume.tailor', 'resume.update']).toContain(
        community.operation?.tool,
      )
      expect(['resume.tailor', 'resume.update']).toContain(data.operation?.tool)
      expect(community.resume.experience[0].bullets[0]).toContain('社群问题')
      expect(data.resume.experience[0].bullets[0]).toContain('Excel')
      expect(data.message).toContain(`第 2 条已提到首位。原文是「${review}」`)
      expect(data.missing.join(' ')).toMatch(/SQL/i)
      expect(data.keywords.join(' ')).not.toMatch(/SQL/i)
      expect(
        [...data.resume.skills, ...data.resume.experience[0].bullets].join(' '),
      ).not.toMatch(/SQL/i)
    } finally {
      await harness.close(context)
      await rm(dir, { recursive: true, force: true })
    }
  },
  120000,
)

it.skipIf(process.env.FOLIO_LIVE_VALIDATION !== '1')(
  'durable provider distinguishes approximate employment dates from specialist tenure',
  async () => {
    const values = parseEnv(await readFile('.env', 'utf8'))
    const config = {
      ...runtimeDefaults(values.APP_MARKET),
      ...values,
    } as Record<string, string>
    const resume = {
      ...emptyResume,
      name: '虚构前端候选人',
      title: '前端开发',
      experience: [
        {
          company: '虚构软件公司',
          role: '前端开发',
          period: '2024.11—2026.10',
          bullets: ['维护采购表单，对接审批接口并处理校验提示。'],
        },
      ],
    }
    const input = AgentRequestSchema.parse({
      intent: 'tailor',
      resume,
      text: '前端开发。要求约两年工作经验；另要求至少两年无障碍测试经验。',
      requestId: crypto.randomUUID(),
      threadId: crypto.randomUUID(),
    })
    const dir = await mkdtemp(join(tmpdir(), 'folio-live-tenure-'))
    const harness = await openResumeHarness(
      await openNodeSqliteStorage(join(dir, 'turn.db')),
      config,
    )
    try {
      const turn = await submitResumeTurn(harness, input)
      await turn.wait(context)
      const snapshot = await resumeTurnSnapshot(harness)
      expect(snapshot.status).toBe('completed')
      if (snapshot.status !== 'completed') throw new Error('未取得岗位稿')
      const result = snapshot.result
      expect(result.resume.id).toBe(input.requestId)
      expect(result.message).toContain('2024.11—2026.10，共覆盖 24 个自然月')
      expect(result.resume.experience[0].period).toBe(
        resume.experience[0].period,
      )
      expect(
        [
          result.resume.summary,
          ...result.resume.skills,
          ...result.resume.experience.flatMap((job) => job.bullets),
        ].join(' '),
      ).not.toMatch(/无障碍|满两年|满2年/)
      expect(result.missing.join(' ')).toContain('无障碍')
      expect(
        result.missing.filter((note) => !note.includes('无障碍')).join(' '),
      ).not.toMatch(/入职|离职|起止|工作年限|工作经验|工作时长/)
    } finally {
      await harness.close(context)
      await rm(dir, { recursive: true, force: true })
    }
  },
  120000,
)
