import { expect, it, vi } from 'vitest'
import { AgentRequestSchema, sampleResume } from '../domain/resume'
import { agentPost } from './agent-handler'
import { releaseRun, reserveRun } from './billing'
import { testBillingDb } from './billing-test-db'

const env = vi.hoisted(() => ({}))
vi.mock('cloudflare:workers', () => ({ env }))

it('keeps pending pi-ai replays recoverable and reports a terminal request without a cached result', async () => {
  const db = testBillingDb()
  try {
    Object.assign(env, db.env, {
      APP_MODE: 'live',
      AGENT_RUNTIME: 'pi-ai',
      AI_API_KEY: 'fixture-only',
      AI_BASE_URL: 'https://example.invalid',
    })
    const input = AgentRequestSchema.parse({
      intent: 'polish',
      text: '润色',
      resume: sampleResume,
      threadId: 'chat',
      requestId: 'request',
    })
    const replay = () =>
      agentPost(
        new Request('https://example.invalid/api/agent', {
          method: 'POST',
          body: JSON.stringify(input),
        }),
        async () => ({ user: { id: 'user-a' } }),
      )
    const { run } = await reserveRun(db.env, 'user-a', input)
    expect((await replay()).status).toBe(409)
    await releaseRun(db.env, run.id)
    expect((await replay()).status).toBe(410)
  } finally {
    db.close()
  }
})
