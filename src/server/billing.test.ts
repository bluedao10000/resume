import { describe, expect, it } from 'vitest'
import { runtimeDefaults } from '../config/runtime-defaults.mjs'
import { creditUnits, usageCharge } from '../domain/billing'
import { AgentRequestSchema, sampleResume } from '../domain/resume'
import {
  billingSummary,
  prepareBilledPayload,
  releaseRun,
  reserveRun,
  settleRun,
  tariff,
} from './billing'
import type { BillingEnv } from './billing'
import { testBillingDb } from './billing-test-db'
const input = (requestId: string) =>
  AgentRequestSchema.parse({
    intent: 'polish',
    text: '润色',
    resume: sampleResume,
    threadId: 'thread-a',
    requestId,
  })
describe('服务端计费与额度', () => {
  it('输入、输出、缓存分别计价，整数记账且只舍入一次', () => {
    const db = testBillingDb()
    try {
      expect(
        usageCharge(
          { input: 1000, output: 100, cacheRead: 100, cacheWrite: 0 },
          tariff(db.env),
        ),
      ).toBe(75250)
      expect(
        usageCharge(
          { input: 0, output: 0, cacheRead: 1, cacheWrite: 0 },
          tariff(db.env),
        ),
      ).toBe(3)
      expect(creditUnits('2.500001')).toBe(2500001)
      expect(() => creditUnits('-1')).toThrow()
      expect(() =>
        usageCharge(
          { input: -1, output: 0, cacheRead: 0, cacheWrite: 0 },
          tariff(db.env),
        ),
      ).toThrow()
      expect(() =>
        tariff({ ...db.env, AI_MODEL: 'unpriced' } as unknown as BillingEnv),
      ).toThrow()
    } finally {
      db.close()
    }
  })
  it('预留、实际结算、重复请求不重复扣费，租户用量隔离', async () => {
    const db = testBillingDb()
    try {
      const first = await reserveRun(db.env, 'user-a', input('request-a'))
      expect(first.fresh).toBe(true)
      expect((await billingSummary(db.env, 'user-a')).reserved).toBe(
        first.run.reserved,
      )
      const again = await reserveRun(db.env, 'user-a', input('request-a'))
      expect(again.fresh).toBe(false)
      const usage = { input: 1000, output: 100, cacheRead: 100, cacheWrite: 0 }
      await settleRun(db.env, first.run.id, usage)
      await settleRun(db.env, first.run.id, usage)
      const summary = await billingSummary(db.env, 'user-a')
      expect(summary.used).toBe(75250)
      expect(summary.reserved).toBe(0)
      expect(summary.tokens).toEqual(usage)
      expect((await billingSummary(db.env, 'user-b')).used).toBe(0)
      await expect(
        reserveRun(db.env, 'user-a', {
          ...input('request-a'),
          text: '不同输入',
        }),
      ).rejects.toThrow('另一条输入')
    } finally {
      db.close()
    }
  })
  it('并发竞争在一条 SQL 内受限，释放后恢复可用额度', async () => {
    const db = testBillingDb()
    try {
      const results = await Promise.allSettled(
        Array.from({ length: 8 }, (_, i) =>
          reserveRun(db.env, 'user-a', input(`parallel-${i}`)),
        ),
      )
      const admitted = results.flatMap((result) =>
        result.status === 'fulfilled' ? [result.value] : [],
      )
      expect(admitted).toHaveLength(2)
      const summary = await billingSummary(db.env, 'user-a')
      expect(summary.reserved).toBeLessThanOrEqual(summary.allowance)
      for (const admission of admitted)
        await releaseRun(db.env, admission.run.id)
      expect((await billingSummary(db.env, 'user-a')).remaining).toBe(
        summary.allowance,
      )
      expect((await reserveRun(db.env, 'user-a', input('next'))).fresh).toBe(
        true,
      )
    } finally {
      db.close()
    }
  })
  it('不足额度在模型调用前拒绝，不接受客户端指定套餐', async () => {
    const db = testBillingDb()
    try {
      await expect(
        reserveRun(
          { ...db.env, BILLING_FREE_CREDITS: '0' } as unknown as BillingEnv,
          'user-a',
          input('empty'),
        ),
      ).rejects.toThrow('额度不足')
      const request = AgentRequestSchema.parse({
        ...input('tampered'),
        plan: 'pro',
        credits: 999999,
      })
      const admission = await reserveRun(db.env, 'user-a', request)
      expect(admission.run.plan).toBe('free')
      expect(() =>
        prepareBilledPayload(
          { input: 'x'.repeat(1000000) },
          admission.run,
          db.env.AI_API,
        ),
      ).toThrow('超出')
      expect(
        prepareBilledPayload({ input: [] }, admission.run, db.env.AI_API),
      ).toHaveProperty('max_output_tokens', admission.run.max_output_tokens)
    } finally {
      db.close()
    }
  })
  it('国内测试 Pro 授权按账户和有效期生效，并使用同一份用量账本', async () => {
    const db = testBillingDb()
    try {
      const env = {
        ...db.env,
        ...runtimeDefaults('cn'),
        APP_MARKET: 'cn',
      } as unknown as BillingEnv
      const now = Date.now()
      await env.DB.prepare(
        "INSERT INTO billing_test_grants VALUES ('user-a','pro',?,?)",
      )
        .bind(now - 1000, now + 100000)
        .run()
      expect((await billingSummary(env, 'user-b')).plan).toBe('free')
      const { run } = await reserveRun(env, 'user-a', input('cn-grant'))
      expect(run.plan).toBe('pro')
      expect((await billingSummary(env, 'user-a')).tokens.input).toBe(0)
      const usage = { input: 1000, output: 100, cacheRead: 40, cacheWrite: 0 }
      await settleRun(env, run.id, usage)
      expect(await billingSummary(env, 'user-a')).toMatchObject({
        plan: 'pro',
        allowance: 625000000,
        reserved: 0,
        tokens: usage,
      })
      await env.DB.prepare('UPDATE billing_test_grants SET period_end=?')
        .bind(now - 1)
        .run()
      expect((await billingSummary(env, 'user-a')).plan).toBe('free')
    } finally {
      db.close()
    }
  })

  it('订阅到期后回到 Free，取消续费在本期结束前仍保留权益', async () => {
    const db = testBillingDb()
    try {
      const now = Date.now()
      await db.env.DB.prepare(
        `INSERT INTO billing_subscriptions
        VALUES ('user-a','sub-1','cus-1','plus','active',?,?,1)`,
      )
        .bind(now - 1000, now + 100000)
        .run()
      const active = await billingSummary(db.env, 'user-a')
      expect(active.plan).toBe('plus')
      expect(active.allowance).toBe(125000000)
      expect(active.cancelAtPeriodEnd).toBe(true)
      await db.env.DB.prepare('UPDATE billing_subscriptions SET period_end=?')
        .bind(now - 1)
        .run()
      expect((await billingSummary(db.env, 'user-a')).plan).toBe('free')
    } finally {
      db.close()
    }
  })
})
