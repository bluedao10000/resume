import { generateKeyPairSync, sign } from 'node:crypto'
import { afterEach, expect, test, vi } from 'vitest'
import { billingPeriod } from './billing'
import { testBillingDb } from './billing-test-db'
import {
  reconcileWechatOrder,
  settleWechatOrder,
  wechatCheckout,
  wechatOrderStatus,
} from './wechat-pay'
import {
  decryptWechatNotification,
  verifyWechatSignature,
} from './wechat-pay-crypto'

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
})
const merchant = {
  WECHAT_PAY_APP_ID: 'wx-fixture',
  WECHAT_PAY_MCH_ID: '1234567890',
  WECHAT_PAY_MERCHANT_SERIAL: 'AA123',
  WECHAT_PAY_PRIVATE_KEY: privateKey
    .export({ type: 'pkcs8', format: 'pem' })
    .toString(),
  WECHAT_PAY_PUBLIC_KEY_ID: 'PUB_KEY_ID_123',
  WECHAT_PAY_PUBLIC_KEY: publicKey
    .export({ type: 'spki', format: 'pem' })
    .toString(),
  WECHAT_PAY_API_V3_KEY: '0123456789abcdef0123456789abcdef',
}
function signedHeaders(
  body: string,
  timestamp = Math.floor(Date.now() / 1000),
) {
  const nonce = 'fixture-nonce'
  return new Headers({
    'Wechatpay-Serial': merchant.WECHAT_PAY_PUBLIC_KEY_ID,
    'Wechatpay-Timestamp': String(timestamp),
    'Wechatpay-Nonce': nonce,
    'Wechatpay-Signature': sign(
      'RSA-SHA256',
      Buffer.from(`${timestamp}\n${nonce}\n${body}\n`),
      privateKey,
    ).toString('base64'),
  })
}
afterEach(() => vi.unstubAllGlobals())

test('verifies original bytes and freshness before decrypting the notification', async () => {
  const encode = new TextEncoder()
  const nonce = '123456789012'
  const associatedData = 'transaction'
  const key = await crypto.subtle.importKey(
    'raw',
    encode.encode(merchant.WECHAT_PAY_API_V3_KEY),
    'AES-GCM',
    false,
    ['encrypt'],
  )
  const value = { trade_state: 'SUCCESS' }
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: encode.encode(nonce),
      additionalData: encode.encode(associatedData),
    },
    key,
    encode.encode(JSON.stringify(value)),
  )
  const raw = JSON.stringify({
    event_type: 'TRANSACTION.SUCCESS',
    resource_type: 'encrypt-resource',
    resource: {
      original_type: 'transaction',
      algorithm: 'AEAD_AES_256_GCM',
      nonce,
      associated_data: associatedData,
      ciphertext: Buffer.from(ciphertext).toString('base64'),
    },
  })
  expect(await verifyWechatSignature(merchant, signedHeaders(raw), raw)).toBe(
    true,
  )
  expect(
    await verifyWechatSignature(merchant, signedHeaders(raw), raw + ' '),
  ).toBe(false)
  expect(
    await verifyWechatSignature(
      merchant,
      signedHeaders(raw, Math.floor(Date.now() / 1000) - 301),
      raw,
    ),
  ).toBe(false)
  expect(await decryptWechatNotification(merchant, raw)).toEqual(value)
})

test('reuses an uncertain checkout, isolates orders and grants a single paid period from a verified query', async () => {
  const { env, close } = testBillingDb()
  Object.assign(env, merchant, {
    APP_MARKET: 'cn',
    BETTER_AUTH_URL: 'https://folio.example',
  })
  const requests: Record<string, unknown>[] = []
  let payment: Record<string, unknown> | undefined
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, request: RequestInit) => {
      if (request.method === 'POST') {
        expect(url).toBe(
          'https://api.mch.weixin.qq.com/v3/pay/transactions/native',
        )
        requests.push(JSON.parse(String(request.body)))
        if (requests.length === 1) throw new Error('request timed out')
      }
      const raw = JSON.stringify(
        payment ?? { code_url: 'weixin://wxpay/bizpayurl/up?pr=fixture' },
      )
      return new Response(raw, { headers: signedHeaders(raw) })
    }),
  )
  try {
    await expect(wechatCheckout(env, 'user-a', 'plus')).rejects.toThrow(
      'timed out',
    )
    const { order } = await wechatCheckout(env, 'user-a', 'pro')
    expect(order).toMatchObject({
      plan: 'plus',
      totalFen: 6800,
      qr: expect.stringMatching(/^data:image\/png;base64,/),
    })
    expect(requests[0]).toEqual(requests[1])
    expect(await wechatOrderStatus(env, 'user-b')).toEqual({ order: null })
    expect((await billingPeriod(env, 'user-a')).plan).toBe('free')
    const start = Date.now() - 10
    payment = {
      appid: merchant.WECHAT_PAY_APP_ID,
      mchid: merchant.WECHAT_PAY_MCH_ID,
      out_trade_no: requests[0].out_trade_no,
      transaction_id: 'transaction-1',
      trade_type: 'NATIVE',
      trade_state: 'SUCCESS',
      success_time: new Date(start).toISOString(),
      amount: { total: 6800, currency: 'CNY' },
    }
    await expect(
      settleWechatOrder(env, {
        ...payment,
        amount: { total: 1, currency: 'CNY' },
      }),
    ).rejects.toThrow('WECHAT_ORDER_MISMATCH')
    expect(await reconcileWechatOrder(env, 'user-a')).toEqual({ order: null })
    await settleWechatOrder(env, payment)
    const end = start + 30 * 86400000
    expect(await billingPeriod(env, 'user-a')).toMatchObject({
      plan: 'plus',
      start,
      end,
    })
    expect((await billingPeriod(env, 'user-a', end)).plan).toBe('free')
    expect((await billingPeriod(env, 'user-b')).plan).toBe('free')
    await expect(wechatCheckout(env, 'user-a', 'plus')).rejects.toThrow(
      '当前付费套餐有效',
    )
  } finally {
    close()
  }
})
