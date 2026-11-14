import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cancelCheckout,
  checkout,
  processStripeEvent,
  verifyStripeSignature,
} from './stripe'
import { billingSummary } from './billing'
import { testBillingDb } from './billing-test-db'

afterEach(() => vi.unstubAllGlobals())
function setup() {
  const db = testBillingDb()
  Object.assign(db.env, {
    STRIPE_SECRET_KEY: 'sk_test_fixture',
    STRIPE_WEBHOOK_SECRET: 'whsec_fixture',
    STRIPE_PLUS_PRICE_ID: 'price_plus',
    STRIPE_PRO_PRICE_ID: 'price_pro',
  })
  return db
}
function subscription(patch: Record<string, unknown> = {}) {
  return {
    id: 'sub_fixture',
    customer: 'cus_fixture',
    status: 'active',
    metadata: { folio_user_id: 'user-a' },
    cancel_at_period_end: false,
    latest_invoice: { id: 'in_fixture', paid: true, status: 'paid' },
    items: {
      data: [
        {
          quantity: 1,
          current_period_start: Math.floor(Date.now() / 1000) - 1000,
          current_period_end: Math.floor(Date.now() / 1000) + 100000,
          price: {
            id: 'price_plus',
            currency: 'usd',
            unit_amount: 1000,
            recurring: { interval: 'month', interval_count: 1 },
          },
        },
      ],
    },
    ...patch,
  }
}
const event = (
  id: string,
  type = 'invoice.paid',
  object: Record<string, unknown> = {
    id: 'in_fixture',
    subscription: 'sub_fixture',
  },
) => JSON.stringify({ id, type, data: { object } })
describe('Stripe 结账与签名事件', () => {
  it('完成的结账不能取消重开，同订阅并发事件留给 Stripe 重试', async () => {
    const db = setup()
    try {
      await db.env.DB.prepare(
        'INSERT INTO billing_checkouts(user_id,plan,attempt_id,stripe_session_id,url,expires_at) VALUES (?,?,?,?,?,?)',
      )
        .bind(
          'user-a',
          'plus',
          'attempt',
          'cs_fixture',
          'https://checkout.stripe.com/fixture',
          Date.now() + 100000,
        )
        .run()
      const transport = vi
        .fn<typeof fetch>()
        .mockImplementation(async () =>
          Response.json({ id: 'cs_fixture', status: 'complete' }),
        )
      vi.stubGlobal('fetch', transport)
      await expect(cancelCheckout(db.env, 'user-a')).rejects.toThrow(
        '支付已完成',
      )
      expect(
        await db.env.DB.prepare(
          'SELECT user_id FROM billing_checkouts',
        ).first(),
      ).toBeTruthy()
      await db.env.DB.prepare('INSERT INTO billing_sync_locks VALUES (?,?,?)')
        .bind('sub_fixture', 'another-worker', Date.now() + 30000)
        .run()
      await expect(
        processStripeEvent(db.env, event('evt-concurrent')),
      ).rejects.toThrow('busy')
      expect(transport).toHaveBeenCalledTimes(1)
    } finally {
      db.close()
    }
  })
  it('原始正文签名、时间窗口与多签名验证', async () => {
    const now = Date.now(),
      timestamp = Math.floor(now / 1000)
    const raw = event('evt-signature')
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode('whsec_fixture'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const bytes = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(`${timestamp}.${raw}`),
    )
    const sig = [...new Uint8Array(bytes)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    expect(
      await verifyStripeSignature(
        raw,
        `t=${timestamp},v1=${'0'.repeat(64)},v1=${sig}`,
        'whsec_fixture',
        300,
        now,
      ),
    ).toBe(true)
    expect(
      await verifyStripeSignature(
        raw + ' ',
        `t=${timestamp},v1=${sig}`,
        'whsec_fixture',
        300,
        now,
      ),
    ).toBe(false)
    expect(
      await verifyStripeSignature(
        raw,
        `t=${timestamp},v1=${sig}`,
        'whsec_fixture',
        300,
        now + 301000,
      ),
    ).toBe(false)
    expect(
      await verifyStripeSignature(raw, null, 'whsec_fixture', 300, now),
    ).toBe(false)
  })
  it('价格在服务端核对，结账复用已有链接并保留服务端所有者', async () => {
    const db = setup()
    const transport = vi
      .fn<typeof fetch>()
      .mockImplementation(async (resource, init) => {
        const url = String(resource)
        if (url.endsWith('/prices/price_plus'))
          return Response.json({
            id: 'price_plus',
            active: true,
            currency: 'usd',
            unit_amount: 1000,
            recurring: { interval: 'month', interval_count: 1 },
          })
        if (url.endsWith('/customers'))
          return Response.json({ id: 'cus_fixture' })
        const fields = new URLSearchParams(String(init?.body))
        expect(fields.get('subscription_data[metadata][folio_user_id]')).toBe(
          'user-a',
        )
        expect(fields.get('line_items[0][price]')).toBe('price_plus')
        return Response.json({
          id: 'cs_fixture',
          url: 'https://checkout.stripe.com/c/pay_fixture',
        })
      })
    vi.stubGlobal('fetch', transport)
    try {
      const user = { id: 'user-a', email: 'a@example.invalid' }
      const first = await checkout(db.env, user, 'plus')
      expect(await checkout(db.env, user, 'plus')).toEqual(first)
      expect(transport).toHaveBeenCalledTimes(3)
      await expect(checkout(db.env, user, 'pro')).rejects.toThrow('待完成')
      expect((await billingSummary(db.env, 'user-a')).plan).toBe('free')
    } finally {
      db.close()
    }
  })
  it('未配置支付或 Stripe 价格不符时不创建结账', async () => {
    const db = setup()
    try {
      const missing = {
        ...db.env,
        STRIPE_SECRET_KEY: '',
      } as unknown as typeof db.env
      await expect(
        checkout(missing, { id: 'user-a', email: 'a@example.invalid' }, 'plus'),
      ).rejects.toThrow('尚未开通')
      const transport = vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({
          id: 'price_plus',
          active: true,
          currency: 'usd',
          unit_amount: 999,
          recurring: { interval: 'month', interval_count: 1 },
        }),
      )
      vi.stubGlobal('fetch', transport)
      await expect(
        checkout(db.env, { id: 'user-a', email: 'a@example.invalid' }, 'plus'),
      ).rejects.toThrow('不匹配')
      expect(transport).toHaveBeenCalledTimes(1)
    } finally {
      db.close()
    }
  })
  it('付费发票才开通套餐，重复事件不重复处理，旧快照不能覆盖当前状态', async () => {
    const db = setup()
    try {
      await db.env.DB.prepare('INSERT INTO billing_customers VALUES (?,?)')
        .bind('user-a', 'cus_fixture')
        .run()
      let current = subscription({
        latest_invoice: { id: 'in_fixture', paid: false, status: 'open' },
      })
      const transport = vi
        .fn<typeof fetch>()
        .mockImplementation(async () => Response.json(current))
      vi.stubGlobal('fetch', transport)
      await processStripeEvent(db.env, event('evt-open'))
      expect((await billingSummary(db.env, 'user-a')).plan).toBe('free')
      current = subscription()
      await processStripeEvent(db.env, event('evt-paid'))
      expect((await billingSummary(db.env, 'user-a')).plan).toBe('plus')
      await processStripeEvent(db.env, event('evt-paid'))
      expect(transport).toHaveBeenCalledTimes(2)
      await processStripeEvent(
        db.env,
        event('evt-old', 'customer.subscription.updated', {
          id: 'sub_fixture',
          status: 'canceled',
        }),
      )
      expect((await billingSummary(db.env, 'user-a')).plan).toBe('plus')
      current = subscription({ status: 'past_due' })
      await processStripeEvent(
        db.env,
        event('evt-failed', 'invoice.payment_failed'),
      )
      expect((await billingSummary(db.env, 'user-a')).plan).toBe('free')
    } finally {
      db.close()
    }
  })
  it('旧订阅取消事件不能撤销另一份新订阅，所有权不符拒绝', async () => {
    const db = setup()
    try {
      await db.env.DB.prepare('INSERT INTO billing_customers VALUES (?,?)')
        .bind('user-a', 'cus_fixture')
        .run()
      await db.env.DB.prepare(
        'INSERT INTO billing_subscriptions VALUES (?,?,?,?,?,?,?,?)',
      )
        .bind(
          'user-a',
          'sub_new',
          'cus_fixture',
          'pro',
          'active',
          Date.now() - 1000,
          Date.now() + 100000,
          0,
        )
        .run()
      let current = subscription({ status: 'canceled' })
      vi.stubGlobal(
        'fetch',
        vi
          .fn<typeof fetch>()
          .mockImplementation(async () => Response.json(current)),
      )
      await processStripeEvent(
        db.env,
        event('evt-cancel-old', 'customer.subscription.deleted', {
          id: 'sub_fixture',
        }),
      )
      expect((await billingSummary(db.env, 'user-a')).plan).toBe('pro')
      current = subscription({ metadata: { folio_user_id: 'user-b' } })
      await expect(
        processStripeEvent(db.env, event('evt-wrong-owner')),
      ).rejects.toThrow('ownership')
      expect((await billingSummary(db.env, 'user-b')).plan).toBe('free')
    } finally {
      db.close()
    }
  })
})
