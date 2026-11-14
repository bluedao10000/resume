import { describe, it, expect, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BACKGROUND_CONTEXT as context } from '@earendil-works/chord/context'
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node'
import { AgentRequestSchema, sampleResume } from '../domain/resume'
import {
  openResumeHarness,
  submitResumeTurn,
  resumeTurnSnapshot,
  resumeTurnUsage,
} from './durable-harness'
import { testModelConfig, toolResponse } from './pi-test-fixtures'
const input = AgentRequestSchema.parse({
  intent: 'polish',
  text: '把专业技能移动到工作经历上方',
  resume: sampleResume,
  threadId: 'thread-fixture',
  requestId: 'request-fixture',
})
describe('pi-durable SQLite 恢复', () => {
  it('持久化运行时在实际供应商网络调用前执行预算检查', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'folio-pi-budget-'))
    const transport = vi.fn<typeof fetch>()
    const harness = await openResumeHarness(
      await openNodeSqliteStorage(join(directory, 'session.db')),
      testModelConfig,
      undefined,
      transport,
      async () => {
        throw new Error('budget rejected')
      },
    )
    try {
      const turn = await submitResumeTurn(harness, input)
      await turn.wait(context)
      expect(transport).not.toHaveBeenCalled()
      expect((await resumeTurnSnapshot(harness)).status).toBe('failed')
      expect(await resumeTurnUsage(harness)).toEqual({
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
      })
    } finally {
      await harness.close(context)
      await rm(directory, { recursive: true, force: true })
    }
  })
  it('生成中关闭再打开 Harness，恢复原提交并完成工具操作', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'folio-pi-pending-'))
    const path = join(directory, 'session.db')
    const interrupted = vi.fn<typeof fetch>().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          const signal = init?.signal
          if (signal?.aborted) reject(signal.reason)
          else
            signal?.addEventListener('abort', () => reject(signal.reason), {
              once: true,
            })
        }),
    )
    let harness = await openResumeHarness(
      await openNodeSqliteStorage(path),
      testModelConfig,
      undefined,
      interrupted,
    )
    try {
      const submission = await submitResumeTurn(harness, input)
      await vi.waitFor(() => expect(interrupted).toHaveBeenCalledTimes(1))
      expect((await resumeTurnSnapshot(harness)).status).toBe('running')
      await harness.close(context)
      const recovered = vi.fn<typeof fetch>().mockImplementation(async () =>
        toolResponse('resume_reorder_sections', {
          section: 'skills',
          relativeTo: 'experience',
          position: 'before',
        }),
      )
      harness = await openResumeHarness(
        await openNodeSqliteStorage(path),
        testModelConfig,
        undefined,
        recovered,
      )
      harness.resume()
      const again = await submitResumeTurn(harness, input)
      expect(again.id).toBe(submission.id)
      await again.wait(context)
      expect((await resumeTurnSnapshot(harness)).status).toBe('completed')
      expect(recovered).toHaveBeenCalledTimes(1)
    } finally {
      await harness.close(context)
      await rm(directory, { recursive: true, force: true })
    }
  }, 15000)

  it('持久化模型与工具结果，重新打开后相同 requestId 不重复执行，冲突输入拒绝', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'folio-pi-'))
    const transport = vi.fn<typeof fetch>().mockImplementation(async () =>
      toolResponse('resume_reorder_sections', {
        section: 'skills',
        relativeTo: 'experience',
        position: 'before',
      }),
    )
    let harness = await openResumeHarness(
      await openNodeSqliteStorage(join(directory, 'session.db')),
      testModelConfig,
      undefined,
      transport,
    )
    try {
      const submission = await submitResumeTurn(harness, input)
      await submission.wait(context)
      const first = await resumeTurnSnapshot(harness)
      expect(first.status).toBe('completed')
      expect(await resumeTurnUsage(harness)).toEqual({
        input: 10,
        output: 10,
        cacheRead: 0,
        cacheWrite: 0,
      })
      if (first.status === 'completed')
        expect(first.result.resume.sectionOrder).toEqual([
          'summary',
          'skills',
          'experience',
          'education',
        ])
      await harness.close(context)
      harness = await openResumeHarness(
        await openNodeSqliteStorage(join(directory, 'session.db')),
        testModelConfig,
        undefined,
        transport,
      )
      harness.resume()
      expect(await resumeTurnSnapshot(harness)).toEqual(first)
      expect(await resumeTurnUsage(harness)).toEqual({
        input: 10,
        output: 10,
        cacheRead: 0,
        cacheWrite: 0,
      })
      const again = await submitResumeTurn(harness, input)
      expect(again.id).toBe(submission.id)
      await again.wait(context)
      expect(transport).toHaveBeenCalledTimes(1)
      await expect(
        submitResumeTurn(harness, { ...input, text: '另一条输入' }),
      ).rejects.toThrow('REQUEST_CONFLICT')
    } finally {
      await harness.close(context)
      await rm(directory, { recursive: true, force: true })
    }
  }, 15000)
})
