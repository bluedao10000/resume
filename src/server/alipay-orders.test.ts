import { createSign, generateKeyPairSync } from 'node:crypto'
import { expect, test } from 'vitest'
import { runtimeDefaults } from '../config/runtime-defaults.mjs'
import { alipayCheckout, alipayNotify, alipayStatus } from './alipay-orders'
import { billingPeriod, type BillingEnv } from './billing'
import { testBillingDb } from './billing-test-db'

test('a verified Alipay order enables the buyer only and settles once', async () => {
  const { env: base, sqlite, close } = testBillingDb()
  const key = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'der' },
    publicKeyEncoding: { type: 'spki', format: 'der' },
  })
  const env = {
    ...base,
    ...runtimeDefaults('cn'),
    APP_MARKET: 'cn',
    ALIPAY_APP_ID: 'sandbox-app',
    ALIPAY_MODE: 'sandbox',
    ALIPAY_PRIVATE_KEY: key.privateKey.toString('base64'),
    ALIPAY_PUBLIC_KEY: key.publicKey.toString('base64'),
    ALIPAY_SELLER_ID: 'sandbox-seller',
  } as unknown as BillingEnv
  try {
    const form = await alipayCheckout(env, 'user-a', 'plus')
    expect(form).toContain('openapi-sandbox.dl.alipaydev.com')
    const order = sqlite
      .prepare('SELECT id, total_fen FROM billing_alipay_orders')
      .get()!
    const id = String(order.id)
    expect(await alipayStatus(env, 'user-b', false, id)).toEqual({
      enabled: true,
      order: null,
    })
    const fields = {
      app_id: env.ALIPAY_APP_ID,
      seller_id: env.ALIPAY_SELLER_ID,
      out_trade_no: id,
      trade_no: '123456789',
      trade_status: 'TRADE_SUCCESS',
      total_amount: '20.00',
      notify_id: 'fixture',
      notify_type: 'trade_status_sync',
      sign_type: 'RSA2',
    }
    function notify(values = fields, validSignature = true) {
      const message = Object.entries(values)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => `${key}=${value}`)
        .join('&')
      const sign = createSign('RSA-SHA256').update(message).sign(
        {
          key: key.privateKey,
          format: 'der',
          type: 'pkcs1',
        },
        'base64',
      )
      return alipayNotify(
        env,
        new Request('http://localhost/notify', {
          method: 'POST',
          body: new URLSearchParams({
            ...values,
            sign: validSignature ? sign : 'wrong',
          }),
        }),
      )
    }
    expect(await notify(fields, false)).toBe(false)
    expect(await notify({ ...fields, total_amount: '0.01' })).toBe(false)
    expect((await billingPeriod(env, 'user-a')).plan).toBe('free')
    expect(await notify()).toBe(true)
    const period = await billingPeriod(env, 'user-a')
    expect(period.plan).toBe('plus')
    expect(period.end - period.start).toBe(30 * 86400000)
    expect(await notify()).toBe(true)
    expect(await billingPeriod(env, 'user-a')).toEqual(period)
    expect((await billingPeriod(env, 'user-b')).plan).toBe('free')
    expect(
      (
        await billingPeriod(
          Object.assign({}, env, { ALIPAY_MODE: 'production' }),
          'user-a',
        )
      ).plan,
    ).toBe('free')
    await expect(alipayCheckout(env, 'user-a', 'pro')).rejects.toThrow(
      '有效付费套餐',
    )
  } finally {
    close()
  }
})
