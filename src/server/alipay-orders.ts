import { alipayConfigured } from './alipay-config'
import { alipaySdk } from './alipay-sdk'
import { BillingError, plans, type BillingEnv } from './billing'

type Order = {
  id: string
  user_id: string
  plan: 'plus' | 'pro'
  total_fen: number
  expires_at: number
  status: 'pending' | 'closed' | 'paid' | 'refund_pending' | 'refunded'
  trade_no: string | null
  period_end: number | null
}
const paidStatus = (status: unknown) =>
  status === 'TRADE_SUCCESS' || status === 'TRADE_FINISHED'

function amount(fen: number) {
  return `${Math.floor(fen / 100)}.${String(fen % 100).padStart(2, '0')}`
}

function amountMatches(value: unknown, fen: number) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value))
  return (
    !!match &&
    BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0')) ===
      BigInt(fen)
  )
}

function scope(env: BillingEnv) {
  return [env.ALIPAY_MODE, env.ALIPAY_APP_ID]
}

function orderById(env: BillingEnv, id: string) {
  return env.DB.prepare(
    'SELECT * FROM billing_alipay_orders WHERE id=? AND mode=? AND app_id=?',
  )
    .bind(id, ...scope(env))
    .first<Order>()
}

function currentOrder(env: BillingEnv, userId: string) {
  return env.DB.prepare(
    `SELECT * FROM billing_alipay_orders WHERE user_id=? AND mode=? AND app_id=?
     ORDER BY rowid DESC LIMIT 1`,
  )
    .bind(userId, ...scope(env))
    .first<Order>()
}

async function settle(
  env: BillingEnv,
  order: Order,
  tradeNo: string,
  paidAt: number,
) {
  if (!/^\d{1,64}$/.test(tradeNo)) throw new Error('ALIPAY_TRADE_MISMATCH')
  await env.DB.prepare(
    `UPDATE billing_alipay_orders
       SET status='paid', trade_no=?, period_start=?, period_end=?
       WHERE id=? AND mode=? AND app_id=? AND status='pending'`,
  )
    .bind(tradeNo, paidAt, paidAt + 30 * 86400000, order.id, ...scope(env))
    .run()
  const recorded = await orderById(env, order.id)
  if (!recorded || recorded.trade_no !== tradeNo)
    throw new Error('ALIPAY_TRADE_MISMATCH')
}

function paymentDate(value: unknown) {
  if (
    typeof value === 'string' &&
    /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(value)
  ) {
    const parsed = Date.parse(value.replace(' ', 'T') + '+08:00')
    if (Number.isFinite(parsed)) return parsed
  }
  return Date.now()
}

async function trade(
  env: BillingEnv,
  method: string,
  bizContent: Record<string, string>,
) {
  return alipaySdk(env).exec(method, { bizContent }, { validateSign: true })
}

async function closeLocal(env: BillingEnv, order: Order) {
  await env.DB.prepare(
    "UPDATE billing_alipay_orders SET status='closed' WHERE id=? AND status='pending'",
  )
    .bind(order.id)
    .run()
}

async function reconcile(env: BillingEnv, order: Order) {
  if (order.status !== 'pending') return
  const result = await trade(env, 'alipay.trade.query', {
    out_trade_no: order.id,
  })
  if (result.code !== '10000') {
    if (result.sub_code !== 'ACQ.TRADE_NOT_EXIST')
      throw new Error('ALIPAY_QUERY_FAILED')
    // An unsubmitted signed form can still be used until the gateway expiry.
    if (Date.now() > order.expires_at + 60_000) await closeLocal(env, order)
    return
  }
  if (
    result.out_trade_no !== order.id ||
    !amountMatches(result.total_amount, order.total_fen)
  )
    throw new Error('ALIPAY_QUERY_MISMATCH')
  if (paidStatus(result.trade_status)) {
    await settle(
      env,
      order,
      String(result.trade_no ?? ''),
      paymentDate(result.send_pay_date),
    )
  } else if (result.trade_status === 'TRADE_CLOSED') {
    await closeLocal(env, order)
  } else if (
    result.trade_status === 'WAIT_BUYER_PAY' &&
    Date.now() > order.expires_at
  ) {
    const closed = await trade(env, 'alipay.trade.close', {
      out_trade_no: order.id,
    })
    if (closed.code === '10000' && closed.out_trade_no === order.id)
      await closeLocal(env, order)
  }
}

export async function alipayCheckout(
  env: BillingEnv,
  userId: string,
  plan: Order['plan'],
) {
  if (!alipayConfigured(env))
    throw new BillingError('支付宝收款尚未开通。', 503)
  const now = Date.now()
  const previous = await currentOrder(env, userId)
  if (previous?.status === 'pending' && previous.expires_at <= now)
    await reconcile(env, previous)
  await env.DB.prepare(
    `INSERT INTO billing_alipay_orders (id,user_id,plan,total_fen,mode,app_id,expires_at)
     SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS (
       SELECT 1 FROM billing_wechat_orders WHERE user_id=? AND
          (status='pending' OR (status='paid' AND period_end>?))
     ) AND NOT EXISTS (
       SELECT 1 FROM billing_alipay_orders WHERE user_id=? AND mode=? AND (mode='production' OR app_id=?)
         AND (status='pending' OR (status IN ('paid','refund_pending') AND period_end>?))
     ) ON CONFLICT DO NOTHING`,
  )
    .bind(
      crypto.randomUUID().replaceAll('-', ''),
      userId,
      plan,
      plans(env).find((item) => item.id === plan)!.monthlyCents,
      ...scope(env),
      now + 15 * 60_000,
      userId,
      now,
      userId,
      ...scope(env),
      now,
    )
    .run()
  const order = await currentOrder(env, userId)
  if (!order || order.status !== 'pending')
    throw new BillingError('该账户已有待处理订单或有效付费套餐。', 409)
  if (order.expires_at <= now || order.plan !== plan)
    throw new BillingError('已有待处理的支付宝订单，请先查询订单。', 409)
  const expires = new Date(order.expires_at + 8 * 3600000)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ')
  const returnUrl = new URL('/billing/alipay-return', env.BETTER_AUTH_URL)
  returnUrl.searchParams.set('order', order.id)
  return alipaySdk(env).pageExec('alipay.trade.page.pay', 'POST', {
    returnUrl: returnUrl.href,
    ...(env.ALIPAY_NOTIFY_URL && { notifyUrl: env.ALIPAY_NOTIFY_URL }),
    bizContent: {
      out_trade_no: order.id,
      total_amount: amount(order.total_fen),
      subject: `Folio ${order.plan === 'plus' ? 'Plus' : 'Pro'} AI 额度包`,
      product_code: 'FAST_INSTANT_TRADE_PAY',
      time_expire: expires,
    },
  })
}

export async function alipayStatus(
  env: BillingEnv,
  userId: string,
  check: boolean,
  orderId?: string,
) {
  if (!alipayConfigured(env)) return { enabled: false, order: null }
  let order = orderId
    ? await orderById(env, orderId)
    : await currentOrder(env, userId)
  if (order?.user_id !== userId) order = null
  if (check && order?.status === 'pending') {
    await reconcile(env, order)
    order = await orderById(env, order.id)
  }
  return {
    enabled: true,
    order: order && {
      id: order.id,
      plan: order.plan,
      status: order.status,
      expiresAt: order.expires_at,
      totalFen: order.total_fen,
    },
  }
}

export async function alipayNotify(env: BillingEnv, request: Request) {
  if (
    !alipayConfigured(env) ||
    !request.headers
      .get('content-type')
      ?.startsWith('application/x-www-form-urlencoded')
  )
    return false
  if (Number(request.headers.get('content-length') ?? 0) > 16_384) return false
  const body = await request.text()
  if (body.length > 16_384) return false
  const fields = new URLSearchParams(body)
  const params = Object.fromEntries(fields)
  if (
    fields.size !== Object.keys(params).length ||
    !params.notify_id ||
    !params.sign ||
    params.sign_type !== 'RSA2' ||
    params.app_id !== env.ALIPAY_APP_ID ||
    params.seller_id !== env.ALIPAY_SELLER_ID ||
    !alipaySdk(env).checkNotifySignV2(params)
  )
    return false
  const order = await orderById(env, params.out_trade_no ?? '')
  if (
    !order ||
    !amountMatches(params.total_amount, order.total_fen) ||
    (order.trade_no !== null && order.trade_no !== params.trade_no)
  )
    return false
  if (
    paidStatus(params.trade_status) &&
    !params.out_biz_no &&
    !params.gmt_refund &&
    !params.refund_fee &&
    params.notify_type === 'trade_status_sync'
  ) {
    await settle(env, order, params.trade_no, paymentDate(params.gmt_payment))
  }
  return true
}

export async function alipayRefund(
  env: BillingEnv,
  operator: string,
  id: string,
) {
  if (!alipayConfigured(env) || operator !== env.ALIPAY_OPERATOR_USER_ID)
    throw new BillingError('操作不可用。', 403)
  const order = await orderById(env, id)
  if (order?.status === 'refunded') return { status: 'refunded' }
  if (
    !order ||
    !['paid', 'refund_pending'].includes(order.status) ||
    !order.trade_no
  )
    throw new BillingError('订单无法退款。', 409)

  const bizContent = { out_trade_no: id, out_request_no: id + 'refund' }
  await env.DB.prepare(
    "UPDATE billing_alipay_orders SET status='refund_pending' WHERE id=? AND status='paid'",
  )
    .bind(id)
    .run()
  await trade(env, 'alipay.trade.refund', {
    ...bizContent,
    refund_amount: amount(order.total_fen),
  })
  const result = await trade(
    env,
    'alipay.trade.fastpay.refund.query',
    bizContent,
  )
  if (
    result.code === '10000' &&
    result.refund_status === 'REFUND_SUCCESS' &&
    result.out_trade_no === id &&
    result.out_request_no === bizContent.out_request_no &&
    result.trade_no === order.trade_no &&
    amountMatches(result.refund_amount, order.total_fen)
  ) {
    await env.DB.prepare(
      "UPDATE billing_alipay_orders SET status='refunded' WHERE id=? AND status='refund_pending'",
    )
      .bind(id)
      .run()
    return { status: 'refunded' }
  }
  return { status: 'refund_pending' }
}

export async function reconcilePendingAlipay(env: BillingEnv) {
  if (!alipayConfigured(env)) return
  const { results } = await env.DB.prepare(
    `SELECT * FROM billing_alipay_orders WHERE mode=? AND app_id=? AND status='pending'
     AND (checked_at IS NULL OR checked_at < ?) ORDER BY checked_at LIMIT 10`,
  )
    .bind(...scope(env), Date.now() - 60_000)
    .all<Order>()
  await Promise.allSettled(
    results.map(async (order) => {
      await env.DB.prepare(
        'UPDATE billing_alipay_orders SET checked_at=? WHERE id=?',
      )
        .bind(Date.now(), order.id)
        .run()
      await reconcile(env, order)
    }),
  )
}
