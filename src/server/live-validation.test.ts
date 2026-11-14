import { it, expect } from 'vitest'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { parseEnv } from 'node:util'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BACKGROUND_CONTEXT as context } from '@earendil-works/chord/context'
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node'
import { generateResume } from './resume-agent'
import {
  openResumeHarness,
  submitResumeTurn,
  resumeTurnSnapshot,
} from './durable-harness'
import { AgentRequestSchema, sampleResume } from '../domain/resume'
it.skipIf(process.env.FOLIO_LIVE_VALIDATION !== '1')(
  'configured provider executes real pi-ai and native pi-durable tools',
  async () => {
    const config = parseEnv(await readFile('.env', 'utf8')) as Record<
      string,
      string
    >
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
    const imported = await generateResume(
      {
        ...input,
        intent: 'import',
        requestId: crypto.randomUUID(),
        text: '王明\n前端工程师\nwang@example.com\n使用 React 和 TypeScript 开发后台页面。',
      },
      config,
    )
    expect(imported.operation?.tool).toBe('resume.update')
    expect(imported.resume.name).toBe('王明')
    expect(imported.resume.email).toBe('wang@example.com')
    expect(imported.resume.isExample).toBe(false)
    expect(imported.resume.experience).toEqual([])
    expect(imported.resume.education).toBe('')
    const dir = await mkdtemp(join(tmpdir(), 'folio-live-'))
    const harness = await openResumeHarness(
      await openNodeSqliteStorage(join(dir, 'turn.db')),
      config,
    )
    try {
      const turn = await submitResumeTurn(harness, input)
      await turn.wait(context)
      const durable = await resumeTurnSnapshot(harness)
      expect(durable.status).toBe('completed')
      if (durable.status === 'completed')
        expect(durable.result.resume.sectionOrder).toEqual(
          direct.resume.sectionOrder,
        )
    } finally {
      await harness.close(context)
      await rm(dir, { recursive: true, force: true })
    }
  },
  120000,
)
