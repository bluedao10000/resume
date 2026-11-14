import { DurableObject } from 'cloudflare:workers'
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context'
import { openDurableObjectSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/cloudflare'
import type { Harness, Wake } from '@earendil-works/pi-durable'
import { AgentRequestSchema } from '../domain/resume'
import {
  openResumeHarness,
  resumeTurnSnapshot,
  submitResumeTurn,
} from './durable-harness'

export class ResumeAgentSession extends DurableObject {
  private harness!: Harness
  constructor(ctx: DurableObjectState, env: Record<string, string>) {
    super(ctx, env)
    void ctx.blockConcurrencyWhile(async () => {
      await ctx.storage.setAlarm(Date.now() + 60000)
      const storage = await openDurableObjectSqliteStorage(ctx.storage)
      this.harness = await openResumeHarness(storage, env, (wake) => {
        void this.arm(wake).catch(() => ctx.abort('Agent alarm write failed'))
      })
      await this.arm(this.harness.wake())
      this.harness.resume()
    })
  }
  private async arm(wake: Wake) {
    const heartbeat = wake.active ? Date.now() + 60000 : undefined
    const at =
      heartbeat === undefined
        ? wake.at
        : wake.at === undefined
          ? heartbeat
          : Math.min(heartbeat, wake.at)
    if (at === undefined) await this.ctx.storage.deleteAlarm()
    else await this.ctx.storage.setAlarm(at)
  }
  override async alarm() {
    await this.arm({ ...this.harness.wake(), active: true })
    this.harness.resume()
  }
  override async fetch(request: Request) {
    if (request.method === 'POST') {
      const input = AgentRequestSchema.parse(await request.json())
      await this.arm({ ...this.harness.wake(), active: true })
      try {
        await submitResumeTurn(this.harness, input)
      } catch (error) {
        if (error instanceof Error && error.message === 'REQUEST_CONFLICT')
          return Response.json(
            { error: '请求标识已用于另一条输入。' },
            { status: 409 },
          )
        throw error
      }
      return Response.json({ status: 'running' }, { status: 202 })
    }
    if (request.method === 'DELETE') {
      await this.arm({ ...this.harness.wake(), active: true })
      const root = await this.harness.root(BACKGROUND_CONTEXT)
      await root.abort(BACKGROUND_CONTEXT)
      return Response.json({ status: 'cancelled' })
    }
    const snapshot = await resumeTurnSnapshot(this.harness)
    return Response.json(snapshot, {
      status: snapshot.status === 'running' ? 202 : 200,
    })
  }
}
