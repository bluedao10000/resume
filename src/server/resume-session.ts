import { runtimeConfig } from '../config/runtime-defaults.mjs'
import { DurableObject } from 'cloudflare:workers'
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context'
import { openDurableObjectSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/cloudflare'
import type { Harness, Wake } from '@earendil-works/pi-durable'
import { AgentRequestSchema } from '../domain/resume'
import {
  prepareBilledPayload,
  runById,
  releaseRun,
  settleRun,
  type BillingEnv,
  type BillingRun,
} from './billing'
import {
  openResumeHarness,
  resumeTurnSnapshot,
  submitResumeTurn,
  resumeTurnUsage,
} from './durable-harness'

export class ResumeAgentSession extends DurableObject {
  private harness!: Harness
  private ledger: BillingEnv
  private submitting = false
  private maintenance: Promise<void> = Promise.resolve()
  constructor(ctx: DurableObjectState, env: Record<string, string>) {
    super(ctx, env)
    this.ledger = runtimeConfig(env) as unknown as BillingEnv
    void ctx.blockConcurrencyWhile(async () => {
      await ctx.storage.setAlarm(Date.now() + 60000)
      const storage = await openDurableObjectSqliteStorage(ctx.storage)
      this.harness = await openResumeHarness(
        storage,
        env,
        () => {
          if (this.harness) this.scheduleMaintenance()
        },
        undefined,
        async (payload) => {
          const run = await ctx.storage.get<BillingRun>('billingRun')
          return run
            ? prepareBilledPayload(payload, run, this.ledger.AI_API)
            : payload
        },
      )
      await this.arm({ ...this.harness.wake(), active: true })
      this.harness.resume()
      this.scheduleMaintenance()
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
  private scheduleMaintenance() {
    this.maintenance = this.maintenance
      .then(() => this.reconcile())
      .catch(async () => {
        console.error('agent_billing_reconcile_failed', {
          reference: crypto.randomUUID(),
        })
        await this.arm({ ...this.harness.wake(), active: true })
      })
    this.ctx.waitUntil(this.maintenance)
  }
  private async reconcile() {
    await this.arm({ ...this.harness.wake(), active: true })
    const run = await this.ctx.storage.get<BillingRun>('billingRun')
    if (run && !this.submitting) {
      const snapshot = await resumeTurnSnapshot(this.harness)
      if (snapshot.status !== 'running') {
        const usage = await resumeTurnUsage(this.harness)
        if (usage.input + usage.output + usage.cacheRead + usage.cacheWrite > 0)
          await settleRun(this.ledger, run.id, usage)
        else await releaseRun(this.ledger, run.id)
      }
    }
    const wake = this.harness.wake()
    await this.arm({ ...wake, active: this.submitting || wake.active })
  }
  override async alarm() {
    await this.arm({ ...this.harness.wake(), active: true })
    this.harness.resume()
    await this.reconcile()
  }
  override async fetch(request: Request) {
    if (request.method === 'POST') {
      const input = AgentRequestSchema.parse(await request.json())
      await this.arm({ ...this.harness.wake(), active: true })
      try {
        this.submitting = true
        const runId = request.headers.get('x-folio-billing-run')
        if (runId) {
          const run = await runById(this.ledger, runId)
          if (
            !run ||
            run.thread_id !== input.threadId ||
            run.request_id !== input.requestId
          )
            throw new Error('Invalid billing admission')
          await this.ctx.storage.put('billingRun', run)
        }
        await submitResumeTurn(this.harness, input)
      } catch (error) {
        if (error instanceof Error && error.message === 'REQUEST_CONFLICT')
          return Response.json(
            { error: '请求标识已用于另一条输入。' },
            { status: 409 },
          )
        throw error
      } finally {
        this.submitting = false
      }
      this.scheduleMaintenance()
      return Response.json({ status: 'running' }, { status: 202 })
    }
    if (request.method === 'DELETE') {
      await this.arm({ ...this.harness.wake(), active: true })
      const root = await this.harness.root(BACKGROUND_CONTEXT)
      await root.abort(BACKGROUND_CONTEXT)
      await this.reconcile()
      return Response.json({ status: 'cancelled' })
    }
    await this.reconcile()
    const snapshot = await resumeTurnSnapshot(this.harness)
    return Response.json(snapshot, {
      status: snapshot.status === 'running' ? 202 : 200,
    })
  }
}
