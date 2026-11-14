import { z } from 'zod'
import QRCode from 'qrcode'
import { BillingError, plans, type BillingEnv } from './billing'
import { wechatPayRequest } from './wechat-pay-crypto'

type Order = {
  id: string
  plan: 'plus' | 'pro'
  total_fen: number
  app_id: string
  merchant_id: string
  notify_url: string
  expires_at: number
  code_url: string | null
  status: 'pending' | 'closed' | 'paid'
  transaction_id: string | null
}

const success = z.object({
  appid: z.string(),
  mchid: z.string(),
  out_trade_no: z.string().regex(/^[a-f0-9]{32}$/),
  transaction_id: z.string().min(1),
  trade_state: z.literal('SUCCESS'),
  trade_type: z.literal('NATIVE'),
  success_time: z.iso.datetime({ offset: true }),
  amount: z.object({
    total: z.number().int().positive(),
    currency: z.literal('CNY'),
  }),
})

export async function settleWechatOrder(env: BillingEnv, value: unknown) {
  const payment = success.parse(value)
  const start = Date.parse(payment.success_time)
  const result = await env.DB.prepare(
    `UPDATE billing_wechat_orders
     SET status='paid', transaction_id=?, period_start=?, period_end=?
     WHERE id=? AND status='pending' AND app_id=? AND merchant_id=? AND total_fen=?`,
  )
    .bind(
      payment.transaction_id,
      start,
      start + 30 * 86400000,
      payment.out_trade_no,
      payment.appid,
      payment.mchid,
      payment.amount.total,
    )
    .run()
  if (result.meta.changes) return
  const previous = await env.DB.prepare(
    `SELECT id FROM billing_wechat_orders WHERE id=? AND status='paid'
     AND transaction_id=? AND app_id=? AND merchant_id=? AND total_fen=? AND period_start=?`,
  )
    .bind(
      payment.out_trade_no,
      payment.transaction_id,
      payment.appid,
      payment.mchid,
      payment.amount.total,
      start,
    )
    .first()
  if (!previous) throw new Error('WECHAT_ORDER_MISMATCH')
}

function pendingOrder(env: BillingEnv, userId: string) {
  return env.DB.prepare(
    "SELECT * FROM billing_wechat_orders WHERE user_id=? AND status='pending'",
  )
    .bind(userId)
    .first<Order>()
}

async function orderView(order: Order) {
  return {
    plan: order.plan,
    totalFen: order.total_fen,
    expiresAt: order.expires_at,
    qr:
      order.code_url && order.expires_at > Date.now()
        ? await QRCode.toDataURL(order.code_url, { width: 224, margin: 4 })
        : null,
  }
}

export async function wechatOrderStatus(env: BillingEnv, userId: string) {
  const order = await pendingOrder(env, userId)
  return { order: order ? await orderView(order) : null }
}

export async function reconcileWechatOrder(env: BillingEnv, userId: string) {
  const order = await pendingOrder(env, userId)
  if (!order) return { order: null }
  const path = `/v3/pay/transactions/out-trade-no/${order.id}`
  if (order.merchant_id !== env.WECHAT_PAY_MCH_ID)
    throw new BillingError('该订单需要商户核对。', 409)
  const query = await wechatPayRequest(
    env,
    'GET',
    `${path}?mchid=${order.merchant_id}`,
  )
  if (query.status === 200) {
    const status = z
      .object({ trade_state: z.string(), out_trade_no: z.literal(order.id) })
      .parse(query.data)
    if (status.trade_state === 'SUCCESS') {
      await settleWechatOrder(env, query.data)
      return { order: null }
    }
    if (status.trade_state !== 'CLOSED') {
      if (status.trade_state !== 'NOTPAY' || order.expires_at > Date.now())
        return wechatOrderStatus(env, userId)
      const closed = await wechatPayRequest(env, 'POST', `${path}/close`, {
        mchid: order.merchant_id,
      })
      if (closed.status !== 204)
        throw new BillingError('订单状态正在确认，请稍后再查。', 409)
    }
  } else {
    const code = z.object({ code: z.string() }).parse(query.data).code
    if (query.status !== 404 || code !== 'ORDER_NOT_EXIST')
      throw new BillingError('微信订单查询暂时不可用。', 503)
    if (order.code_url) throw new BillingError('原支付订单需要商户核对。', 409)
    if (Date.now() < order.expires_at + 60000)
      return wechatOrderStatus(env, userId)
  }
  await env.DB.prepare(
    "UPDATE billing_wechat_orders SET status='closed' WHERE id=? AND status='pending'",
  )
    .bind(order.id)
    .run()
  return wechatOrderStatus(env, userId)
}

export async function wechatCheckout(
  env: BillingEnv,
  userId: string,
  plan: Order['plan'],
) {
  let order = await pendingOrder(env, userId)
  if (!order) {
    const price = plans(env).find((item) => item.id === plan)!.monthlyCents
    const now = Date.now()
    const expiresAt = Math.ceil(now / 1000) * 1000 + 15 * 60000
    await env.DB.prepare(
      `INSERT INTO billing_wechat_orders
       (id,user_id,plan,total_fen,app_id,merchant_id,notify_url,expires_at)
       SELECT ?,?,?,?,?,?,?,? WHERE NOT EXISTS (
         SELECT 1 FROM billing_wechat_orders
         WHERE user_id=? AND status='paid' AND period_end>?
       ) ON CONFLICT DO NOTHING`,
    )
      .bind(
        crypto.randomUUID().replaceAll('-', ''),
        userId,
        plan,
        price,
        env.WECHAT_PAY_APP_ID,
        env.WECHAT_PAY_MCH_ID,
        new URL('/api/billing/webhook', env.BETTER_AUTH_URL).href,
        expiresAt,
        userId,
        now,
      )
      .run()
    order = await pendingOrder(env, userId)
    if (!order)
      throw new BillingError('当前付费套餐有效，请到期后再购买。', 409)
  }
  if (!order.code_url && order.expires_at > Date.now() + 60000) {
    if (
      order.merchant_id !== env.WECHAT_PAY_MCH_ID ||
      order.app_id !== env.WECHAT_PAY_APP_ID
    )
      throw new BillingError('该订单需要商户核对。', 409)
    const response = await wechatPayRequest(
      env,
      'POST',
      '/v3/pay/transactions/native',
      {
        appid: order.app_id,
        mchid: order.merchant_id,
        description: `Folio ${order.plan === 'plus' ? 'Plus' : 'Pro'} 30 天`,
        out_trade_no: order.id,
        time_expire: new Date(order.expires_at)
          .toISOString()
          .replace('.000Z', '+00:00'),
        notify_url: order.notify_url,
        amount: { total: order.total_fen, currency: 'CNY' },
      },
    )
    if (response.status !== 200)
      throw new BillingError('微信支付下单暂未确认，请稍后继续本订单。', 503)
    const { code_url } = z
      .object({
        code_url: z
          .string()
          .regex(/^weixin:\/\/wxpay\/bizpayurl\//)
          .max(1024),
      })
      .parse(response.data)
    await env.DB.prepare(
      "UPDATE billing_wechat_orders SET code_url=? WHERE id=? AND status='pending'",
    )
      .bind(code_url, order.id)
      .run()
  }
  return wechatOrderStatus(env, userId)
}
