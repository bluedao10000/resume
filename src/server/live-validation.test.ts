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
import { AgentRequestSchema, sampleResume } from '../domain/resume'
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
