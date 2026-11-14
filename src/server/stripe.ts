import { z } from 'zod'
import {
  BillingError,
  digest,
  paymentsConfigured,
  plans,
  type BillingEnv,
} from './billing'

const StripeObject = z.object({ id: z.string() }).passthrough()
export async function stripeRequest(
  env: BillingEnv,
  path: string,
  fields?: URLSearchParams,
  idempotency?: string,
) {
  const response = await fetch(`${env.STRIPE_API_BASE_URL}${path}`, {
    method: fields ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Stripe-Version': env.STRIPE_API_VERSION,
      ...(fields && { 'Content-Type': 'application/x-www-form-urlencoded' }),
      ...(idempotency && { 'Idempotency-Key': idempotency }),
    },
    body: fields,
    signal: AbortSignal.timeout(Number(env.STRIPE_TIMEOUT_MS)),
  })
  if (!response.ok)
    throw new BillingError('支付服务暂时不可用，请稍后重试。', 502)
  return StripeObject.parse(await response.json())
}
function requirePayments(env: BillingEnv) {
  if (!paymentsConfigured(env))
    throw new BillingError('在线支付尚未开通。', 503)
}
async function customerFor(
  env: BillingEnv,
  user: { id: string; email: string },
) {
  const saved = await env.DB.prepare(
    'SELECT stripe_customer_id FROM billing_customers WHERE user_id=?',
  )
    .bind(user.id)
    .first<{ stripe_customer_id: string }>()
  if (saved) return saved.stripe_customer_id
  const customer = await stripeRequest(
    env,
    '/customers',
    new URLSearchParams({
      email: user.email,
      'metadata[folio_user_id]': user.id,
    }),
    `folio-customer-${await digest(user.id)}`,
  )
  await env.DB.prepare(
    'INSERT INTO billing_customers(user_id,stripe_customer_id) VALUES (?,?) ON CONFLICT(user_id) DO NOTHING',
  )
    .bind(user.id, customer.id)
    .run()
  return customer.id
}
export async function checkout(
  env: BillingEnv,
  user: { id: string; email: string },
  plan: 'plus' | 'pro',
) {
  requirePayments(env)
  const sub = await env.DB.prepare(
    'SELECT status,period_end FROM billing_subscriptions WHERE user_id=?',
  )
    .bind(user.id)
    .first<{ status: string; period_end: number }>()
  if (sub && ['active', 'trialing', 'past_due', 'unpaid'].includes(sub.status))
    throw new BillingError(
      '已有订阅，请通过“管理订阅”调整，避免重复购买。',
      409,
    )
  const open = await env.DB.prepare(
    'SELECT * FROM billing_checkouts WHERE user_id=? AND expires_at>?',
  )
    .bind(user.id, Date.now())
    .first<{ plan: string; url: string | null }>()
  if (open) {
    if (open.plan === plan && open.url) return { url: open.url }
    throw new BillingError('已有待完成的结账，请先完成或取消该结账。', 409)
  }
  const attempt = crypto.randomUUID()
  const expires = Date.now() + Number(env.STRIPE_CHECKOUT_TTL_SECONDS) * 1000
  const lock = await env.DB.prepare(
    `INSERT INTO billing_checkouts(user_id,plan,attempt_id,expires_at)
    VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET plan=excluded.plan,attempt_id=excluded.attempt_id,
    expires_at=excluded.expires_at,stripe_session_id=NULL,url=NULL WHERE billing_checkouts.expires_at<=?`,
  )
    .bind(user.id, plan, attempt, expires, Date.now())
    .run()
  if (!lock.meta.changes)
    throw new BillingError('结账正在准备中，请稍后重试。', 409)
  try {
    const priceId = env[`STRIPE_${plan.toUpperCase()}_PRICE_ID`]
    const price = await stripeRequest(
      env,
      `/prices/${encodeURIComponent(priceId)}`,
    )
    const definition = plans(env).find((item) => item.id === plan)!
    const recurring = price.recurring as {
      interval?: string
      interval_count?: number
    } | null
    if (
      !price.active ||
      price.currency !== 'usd' ||
      price.unit_amount !== definition.monthlyCents ||
      recurring?.interval !== 'month' ||
      recurring.interval_count !== 1
    )
      throw new BillingError('套餐价格配置不匹配，请联系管理员。', 503)
    const customer = await customerFor(env, user)
    const session = await stripeRequest(
      env,
      '/checkout/sessions',
      new URLSearchParams({
        mode: 'subscription',
        customer,
        'line_items[0][price]': priceId,
        'line_items[0][quantity]': '1',
        client_reference_id: user.id,
        'subscription_data[metadata][folio_user_id]': user.id,
        success_url: `${env.BETTER_AUTH_URL}/?billing=success`,
        cancel_url: `${env.BETTER_AUTH_URL}/?billing=cancelled`,
        expires_at: String(Math.floor(expires / 1000)),
      }),
      `folio-checkout-${attempt}`,
    )
    const url = z.url().parse(session.url)
    if (new URL(url).hostname !== 'checkout.stripe.com')
      throw new Error('Invalid checkout host')
    await env.DB.prepare(
      'UPDATE billing_checkouts SET stripe_session_id=?,url=? WHERE user_id=? AND attempt_id=?',
    )
      .bind(session.id, url, user.id, attempt)
      .run()
    return { url }
  } catch (error) {
    // A timed-out Stripe request might have created a session. Keep the admission
    // lock until expiry; do not create another subscription on an uncertain retry.
    if (error instanceof BillingError && error.status === 503)
      await env.DB.prepare(
        'DELETE FROM billing_checkouts WHERE user_id=? AND attempt_id=?',
      )
        .bind(user.id, attempt)
        .run()
    throw error
  }
}
export async function portal(env: BillingEnv, userId: string) {
  requirePayments(env)
  const customer = await env.DB.prepare(
    'SELECT stripe_customer_id FROM billing_customers WHERE user_id=?',
  )
    .bind(userId)
    .first<{ stripe_customer_id: string }>()
  if (!customer) throw new BillingError('当前账户还没有支付记录。', 400)
  const fields = new URLSearchParams({
    customer: customer.stripe_customer_id,
    return_url: `${env.BETTER_AUTH_URL}/?billing=return`,
  })
  if (env.STRIPE_PORTAL_CONFIGURATION_ID)
    fields.set('configuration', env.STRIPE_PORTAL_CONFIGURATION_ID)
  const session = await stripeRequest(env, '/billing_portal/sessions', fields)
  const url = z.url().parse(session.url)
  if (new URL(url).hostname !== 'billing.stripe.com')
    throw new Error('Invalid portal host')
  return { url }
}
export async function cancelCheckout(env: BillingEnv, userId: string) {
  requirePayments(env)
  const row = await env.DB.prepare(
    'SELECT stripe_session_id FROM billing_checkouts WHERE user_id=?',
  )
    .bind(userId)
    .first<{ stripe_session_id: string | null }>()
  if (row?.stripe_session_id) {
    const session = await stripeRequest(
      env,
      `/checkout/sessions/${encodeURIComponent(row.stripe_session_id)}`,
    )
    if (session.status === 'complete')
      throw new BillingError('支付已完成，正在确认订阅，请刷新用量。', 409)
    if (session.status === 'open')
      await stripeRequest(
        env,
        `/checkout/sessions/${encodeURIComponent(row.stripe_session_id)}/expire`,
        new URLSearchParams(),
      )
  } else if (row)
    throw new BillingError('结账请求仍在确认中，请稍后重试。', 409)
  await env.DB.prepare('DELETE FROM billing_checkouts WHERE user_id=?')
    .bind(userId)
    .run()
}

export async function verifyStripeSignature(
  raw: string,
  signature: string | null,
  secret: string,
  tolerance: number,
  now = Date.now(),
) {
  if (!signature || !secret) return false
  const parts = signature.split(',').map((part) => part.split('=', 2))
  const timestamp = parts.find(([name]) => name === 't')?.[1]
  if (
    !timestamp ||
    !/^\d+$/.test(timestamp) ||
    Math.abs(now / 1000 - Number(timestamp)) > tolerance
  )
    return false
  const candidates = parts.filter(
    ([name, value]) => name === 'v1' && /^[a-f0-9]{64}$/.test(value),
  )
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  const message = new TextEncoder().encode(`${timestamp}.${raw}`)
  for (const [, value] of candidates) {
    const bytes = Uint8Array.from(value.match(/../g)!, (pair) =>
      parseInt(pair, 16),
    )
    if (await crypto.subtle.verify('HMAC', key, bytes, message)) return true
  }
  return false
}
const EventSchema = z.object({
  id: z.string(),
  type: z.string(),
  data: z.object({
    object: z
      .object({
        id: z.string(),
        object: z.string().optional(),
        subscription: z
          .union([z.string(), z.object({ id: z.string() })])
          .nullable()
          .optional(),
        parent: z
          .object({
            subscription_details: z
              .object({
                subscription: z.union([
                  z.string(),
                  z.object({ id: z.string() }),
                ]),
              })
              .nullable()
              .optional(),
          })
          .nullable()
          .optional(),
      })
      .passthrough(),
  }),
})
const SubscriptionSchema = z.object({
  id: z.string(),
  customer: z.string(),
  status: z.string(),
  metadata: z.object({ folio_user_id: z.string() }),
  cancel_at_period_end: z.boolean(),
  latest_invoice: z
    .union([
      z.string(),
      z.object({
        id: z.string(),
        paid: z.boolean().optional(),
        status: z.string(),
      }),
    ])
    .nullable(),
  items: z.object({
    data: z
      .array(
        z.object({
          quantity: z.number(),
          current_period_start: z.number(),
          current_period_end: z.number(),
          price: z.object({
            id: z.string(),
            currency: z.string(),
            unit_amount: z.number(),
            recurring: z.object({
              interval: z.string(),
              interval_count: z.number(),
            }),
          }),
        }),
      )
      .length(1),
  }),
})
function objectId(value: unknown): string | null {
  return typeof value === 'string'
    ? value
    : value &&
        typeof value === 'object' &&
        'id' in value &&
        typeof value.id === 'string'
      ? value.id
      : null
}
export async function processStripeEvent(env: BillingEnv, raw: string) {
  const event = EventSchema.parse(JSON.parse(raw))
  const object = event.data.object
  const supported = [
    'invoice.paid',
    'invoice.payment_failed',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'checkout.session.completed',
  ]
  if (!supported.includes(event.type)) return
  const subscriptionId = event.type.startsWith('customer.subscription.')
    ? object.id
    : (objectId(object.subscription) ??
      objectId(object.parent?.subscription_details?.subscription))
  if (!subscriptionId)
    throw new Error('Subscription missing from billing event')
  const token = crypto.randomUUID()
  const lock = await env.DB.prepare(
    `INSERT INTO billing_sync_locks(subscription_id,token,expires_at)
    VALUES (?,?,?) ON CONFLICT(subscription_id) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at
    WHERE billing_sync_locks.expires_at<=?`,
  )
    .bind(
      subscriptionId,
      token,
      Date.now() + Number(env.STRIPE_SYNC_LOCK_MS),
      Date.now(),
    )
    .run()
  if (!lock.meta.changes)
    throw new BillingError('Subscription sync is busy', 503)
  try {
    await syncStripeEvent(env, raw)
  } finally {
    await env.DB.prepare(
      'DELETE FROM billing_sync_locks WHERE subscription_id=? AND token=?',
    )
      .bind(subscriptionId, token)
      .run()
  }
}
async function syncStripeEvent(env: BillingEnv, raw: string) {
  const event = EventSchema.parse(JSON.parse(raw))
  const processed = await env.DB.prepare(
    'SELECT id FROM billing_webhook_events WHERE id=?',
  )
    .bind(event.id)
    .first()
  if (processed) return
  const supported = [
    'invoice.paid',
    'invoice.payment_failed',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'checkout.session.completed',
  ]
  if (!supported.includes(event.type)) return
  const object = event.data.object
  const subscriptionId = event.type.startsWith('customer.subscription.')
    ? object.id
    : (objectId(object.subscription) ??
      objectId(object.parent?.subscription_details?.subscription))
  if (!subscriptionId)
    throw new Error('Subscription missing from billing event')
  // Fetch authoritative current state instead of ordering snapshot events by created.
  const current = SubscriptionSchema.parse(
    await stripeRequest(
      env,
      `/subscriptions/${encodeURIComponent(subscriptionId)}?expand[]=latest_invoice`,
    ),
  )
  const userId = current.metadata.folio_user_id
  const owner = await env.DB.prepare(
    'SELECT stripe_customer_id FROM billing_customers WHERE user_id=?',
  )
    .bind(userId)
    .first<{ stripe_customer_id: string }>()
  if (owner?.stripe_customer_id !== current.customer)
    throw new Error('Billing ownership mismatch')
  const item = current.items.data[0]
  const plan =
    item.price.id === env.STRIPE_PLUS_PRICE_ID
      ? 'plus'
      : item.price.id === env.STRIPE_PRO_PRICE_ID
        ? 'pro'
        : null
  if (
    !plan ||
    item.quantity !== 1 ||
    item.price.currency !== 'usd' ||
    item.price.unit_amount !==
      plans(env).find((p) => p.id === plan)!.monthlyCents ||
    item.price.recurring.interval !== 'month' ||
    item.price.recurring.interval_count !== 1
  )
    throw new Error('Subscription price mismatch')
  const invoice =
    typeof current.latest_invoice === 'object' ? current.latest_invoice : null
  const paid = invoice?.paid === true || invoice?.status === 'paid'
  const status =
    current.status === 'active' && !paid ? 'payment_pending' : current.status
  const previous = await env.DB.prepare(
    'SELECT stripe_subscription_id,status,period_end FROM billing_subscriptions WHERE user_id=?',
  )
    .bind(userId)
    .first<{
      stripe_subscription_id: string
      status: string
      period_end: number
    }>()
  if (
    previous &&
    previous.stripe_subscription_id !== current.id &&
    previous.status === 'active' &&
    previous.period_end > Date.now()
  ) {
    if (status === 'active')
      throw new Error('Multiple active subscriptions require reconciliation')
    await env.DB.prepare(
      'INSERT INTO billing_webhook_events(id,processed_at) VALUES (?,?) ON CONFLICT(id) DO NOTHING',
    )
      .bind(event.id, Date.now())
      .run()
    return
  }
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO billing_subscriptions
      (user_id,stripe_subscription_id,stripe_customer_id,plan,status,period_start,period_end,cancel_at_period_end)
      VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET
      stripe_subscription_id=excluded.stripe_subscription_id,stripe_customer_id=excluded.stripe_customer_id,
      plan=excluded.plan,status=excluded.status,period_start=excluded.period_start,period_end=excluded.period_end,
      cancel_at_period_end=excluded.cancel_at_period_end`,
    ).bind(
      userId,
      current.id,
      current.customer,
      plan,
      status,
      item.current_period_start * 1000,
      item.current_period_end * 1000,
      current.cancel_at_period_end ? 1 : 0,
    ),
    env.DB.prepare(
      'INSERT INTO billing_webhook_events(id,processed_at) VALUES (?,?) ON CONFLICT(id) DO NOTHING',
    ).bind(event.id, Date.now()),
    ...(event.type === 'checkout.session.completed'
      ? [
          env.DB.prepare(
            'DELETE FROM billing_checkouts WHERE user_id=? AND stripe_session_id=?',
          ).bind(userId, object.id),
        ]
      : []),
  ])
}
