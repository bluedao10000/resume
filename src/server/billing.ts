import { alipayConfigured } from './alipay-config'
import {
  creditUnits,
  usageCharge,
  TariffSchema,
  type Tariff,
  type TokenUsage,
  type PlanId,
} from '../domain/billing'
import {
  agentInstructions,
  agentPrompt,
  toolsForIntent,
  type AgentInput,
} from './resume-tools'
import { z } from 'zod'
import type { AgentResult } from '../domain/resume'

export type BillingEnv = Record<string, string> & { DB: D1Database }
export class BillingError extends Error {
  constructor(
    message: string,
    public status = 402,
  ) {
    super(message)
  }
}
export function plans(config: Record<string, string>) {
  return (['free', 'plus', 'pro'] as const).map((id) => ({
    id,
    name: id === 'free' ? 'Free' : id === 'plus' ? 'Plus' : 'Pro',
    monthlyCents: Number(
      config.APP_MARKET === 'cn' && id !== 'free'
        ? config[`WECHAT_PAY_${id.toUpperCase()}_FEN`]
        : config[`BILLING_${id.toUpperCase()}_MONTHLY_CENTS`],
    ),
    credits:
      creditUnits(config[`BILLING_${id.toUpperCase()}_CREDITS`]) / 1000000,
  }))
}
export function tariff(config: Record<string, string>): Tariff {
  if (config.BILLING_MODEL !== config.AI_MODEL)
    throw new BillingError('当前模型的计费费率尚未配置。', 503)
  return TariffSchema.parse({
    version: config.BILLING_TARIFF_VERSION,
    model: config.BILLING_MODEL,
    input: creditUnits(config.BILLING_INPUT_CREDITS_PER_MILLION),
    output: creditUnits(config.BILLING_OUTPUT_CREDITS_PER_MILLION),
    cacheRead: creditUnits(config.BILLING_CACHE_READ_CREDITS_PER_MILLION),
    cacheWrite: creditUnits(config.BILLING_CACHE_WRITE_CREDITS_PER_MILLION),
  })
}
export function paymentsConfigured(config: Record<string, string>) {
  if (config.APP_MARKET === 'cn')
    return [
      'APP_ID',
      'MCH_ID',
      'MERCHANT_SERIAL',
      'PRIVATE_KEY',
      'API_V3_KEY',
      'PUBLIC_KEY_ID',
      'PUBLIC_KEY',
      'PLUS_FEN',
      'PRO_FEN',
    ].every((key) => Boolean(config[`WECHAT_PAY_${key}`]))

  return !!(
    config.STRIPE_SECRET_KEY &&
    config.STRIPE_WEBHOOK_SECRET &&
    config.STRIPE_PLUS_PRICE_ID &&
    config.STRIPE_PRO_PRICE_ID
  )
}
type Subscription = {
  plan: 'plus' | 'pro'
  status: string
  period_start: number
  period_end: number
  cancel_at_period_end: number
}
export async function billingPeriod(
  env: BillingEnv,
  userId: string,
  now = Date.now(),
) {
  const china = env.APP_MARKET === 'cn'
  const sandbox = env.ALIPAY_MODE === 'sandbox'
  const sub = await env.DB.prepare(
    china
      ? `SELECT plan, 'active' AS status, period_start, period_end, 0 AS cancel_at_period_end
         FROM (
           SELECT plan, period_start, period_end, 1 AS paid FROM billing_wechat_orders
           WHERE user_id=? AND status='paid'
           UNION ALL
           SELECT plan, period_start, period_end, 1 AS paid FROM billing_alipay_orders
           WHERE user_id=? AND status IN ('paid','refund_pending') AND mode=?
           AND (? = 'production' OR app_id=?)
           UNION ALL
           SELECT plan, period_start, period_end, 0 AS paid FROM billing_test_grants
           WHERE user_id=?
         ) WHERE period_end>? AND period_start<=?
         ORDER BY paid DESC, period_end DESC LIMIT 1`
      : 'SELECT * FROM billing_subscriptions WHERE user_id=?',
  )
    .bind(
      userId,
      ...(china
        ? [
            userId,
            sandbox ? 'sandbox' : 'production',
            sandbox ? 'sandbox' : 'production',
            env.ALIPAY_APP_ID ?? '',
            userId,
            now,
            now,
          ]
        : []),
    )
    .first<Subscription>()
  const active =
    sub &&
    sub.status === 'active' &&
    sub.period_start <= now &&
    sub.period_end > now
  const offset = env.APP_MARKET === 'cn' ? 8 * 3600000 : 0
  const date = new Date(now + offset)
  const plan: PlanId = active ? sub.plan : 'free'
  return {
    plan,
    start: active
      ? sub.period_start
      : Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) - offset,
    end: active
      ? sub.period_end
      : Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) - offset,
    allowance: creditUnits(env[`BILLING_${plan.toUpperCase()}_CREDITS`]),
    sub,
  }
}
export async function billingSummary(env: BillingEnv, userId: string) {
  const period = await billingPeriod(env, userId)
  const totals = await env.DB.prepare(
    `SELECT
    COALESCE(SUM(charged),0) AS used,
    COALESCE(SUM(CASE WHEN status='reserved' THEN reserved ELSE 0 END),0) AS reserved,
    COALESCE(SUM(input_tokens),0) AS input,
    COALESCE(SUM(output_tokens),0) AS output,
    COALESCE(SUM(cache_read_tokens),0) AS cacheRead,
    COALESCE(SUM(cache_write_tokens),0) AS cacheWrite
    FROM billing_runs WHERE user_id=? AND period_start=? AND period_end=?`,
  )
    .bind(userId, period.start, period.end)
    .first<{
      used: number
      reserved: number
      input: number
      output: number
      cacheRead: number
      cacheWrite: number
    }>()
  const customer =
    env.APP_MARKET !== 'cn' &&
    (await env.DB.prepare(
      'SELECT stripe_customer_id FROM billing_customers WHERE user_id=?',
    )
      .bind(userId)
      .first())
  const { used = 0, reserved = 0, ...tokens } = totals!
  return {
    plan: period.plan,
    periodStart: period.start,
    periodEnd: period.end,
    allowance: period.allowance,
    used,
    reserved,
    remaining: Math.max(0, period.allowance - used - reserved),
    tokens,
    plans: plans(env),
    tariff: tariff(env),
    paymentConfigured: paymentsConfigured(env),
    alipayConfigured: alipayConfigured(env),
    canManage: !!customer && paymentsConfigured(env),
    cancelAtPeriodEnd: !!period.sub?.cancel_at_period_end,
  }
}
export type BillingRun = {
  id: string
  user_id: string
  thread_id: string
  request_id: string
  fingerprint: string
  plan: PlanId
  period_start: number
  period_end: number
  allowance: number
  reserved: number
  charged: number
  max_output_tokens: number
  tariff_json: string
  status: 'reserved' | 'settled' | 'released'
  result_json: string | null
}
export async function runById(env: BillingEnv, id: string) {
  return env.DB.prepare('SELECT * FROM billing_runs WHERE id=?')
    .bind(id)
    .first<BillingRun>()
}
export async function digest(value: string) {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  )
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}
export async function reserveRun(
  env: BillingEnv,
  userId: string,
  input: AgentInput,
) {
  if (!input.threadId || !input.requestId)
    throw new BillingError('缺少对话或请求标识，请刷新重试。', 400)
  const id = await digest(
    JSON.stringify([userId, input.threadId, input.requestId]),
  )
  const fingerprint = await digest(JSON.stringify(input))
  const existing = await runById(env, id)
  if (existing) {
    if (existing.fingerprint !== fingerprint)
      throw new BillingError('请求标识已用于另一条输入。', 409)
    return { run: existing, fresh: false }
  }
  const summary = await billingSummary(env, userId)
  const rates = summary.tariff
  // Conservative reservation only, never presented or charged as actual tokens.
  // Include system, tools, source and history; the provider payload is checked again.
  const wire = JSON.stringify({
    system: agentInstructions,
    prompt: agentPrompt(input),
    history: input.intent === 'import' ? [] : input.history,
    tools: toolsForIntent(input.intent).map((tool) => ({
      name: tool.name,
      description: tool.description,
      schema: z.toJSONSchema(tool.schema),
    })),
  })
  const inputBound = Math.min(
    Number(env.AI_CONTEXT_WINDOW),
    new TextEncoder().encode(wire).byteLength *
      Number(env.BILLING_INPUT_RESERVE_MULTIPLIER),
  )
  const inputReserve = usageCharge(
    { input: inputBound, output: 0, cacheRead: 0, cacheWrite: 0 },
    {
      ...rates,
      input: Math.max(rates.input, rates.cacheRead, rates.cacheWrite),
    },
  )
  const outputTokens = Math.min(
    Number(env.AI_MAX_OUTPUT_TOKENS),
    Math.floor(((summary.remaining - inputReserve) * 1000000) / rates.output),
  )
  if (outputTokens < Number(env.BILLING_MIN_OUTPUT_TOKENS))
    throw new BillingError('本期可用额度不足，请升级套餐或等待下期重置。')
  const reserved =
    inputReserve +
    usageCharge(
      { input: 0, output: outputTokens, cacheRead: 0, cacheWrite: 0 },
      rates,
    )
  // Admission and the aggregate budget predicate are ONE serialized SQLite statement.
  // Never read-then-increment a balance outside the statement.
  const insertion = await env.DB.prepare(
    `INSERT INTO billing_runs
    (id,user_id,thread_id,request_id,fingerprint,plan,period_start,period_end,allowance,
      reserved,max_output_tokens,tariff_json,status,created_at)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,?,'reserved',?
    WHERE ? >= COALESCE((SELECT SUM(charged + CASE WHEN status='reserved' THEN reserved ELSE 0 END)
      FROM billing_runs WHERE user_id=? AND period_start=? AND period_end=?),0) + ?
    AND (SELECT COUNT(*) FROM billing_runs WHERE user_id=? AND status='reserved') < ?
    ON CONFLICT(user_id,thread_id,request_id) DO NOTHING`,
  )
    .bind(
      id,
      userId,
      input.threadId,
      input.requestId,
      fingerprint,
      summary.plan,
      summary.periodStart,
      summary.periodEnd,
      summary.allowance,
      reserved,
      outputTokens,
      JSON.stringify(rates),
      Date.now(),
      summary.allowance,
      userId,
      summary.periodStart,
      summary.periodEnd,
      reserved,
      userId,
      Number(env.BILLING_MAX_CONCURRENT_RUNS),
    )
    .run()
  const run = await runById(env, id)
  if (!run)
    throw new BillingError(
      '可用额度已被其他请求占用，请等当前生成结束后重试。',
      429,
    )
  if (run.fingerprint !== fingerprint)
    throw new BillingError('请求标识冲突。', 409)
  return { run, fresh: insertion.meta.changes === 1 }
}
export async function settleRun(
  env: BillingEnv,
  id: string,
  usage: TokenUsage,
  result?: AgentResult,
) {
  const run = await runById(env, id)
  if (!run || run.status !== 'reserved') return
  const charged = usageCharge(
    usage,
    TariffSchema.parse(JSON.parse(run.tariff_json)),
  )
  if (charged > run.reserved)
    throw new BillingError('用量超出预留范围，正在核对账单。', 503)
  await env.DB.prepare(
    `UPDATE billing_runs SET status='settled',charged=?,input_tokens=?,
    output_tokens=?,cache_read_tokens=?,cache_write_tokens=?,result_json=?,settled_at=?
    WHERE id=? AND status='reserved'`,
  )
    .bind(
      charged,
      usage.input,
      usage.output,
      usage.cacheRead,
      usage.cacheWrite,
      result ? JSON.stringify(result) : null,
      Date.now(),
      id,
    )
    .run()
}
export async function releaseRun(env: BillingEnv, id: string) {
  await env.DB.prepare(
    `UPDATE billing_runs SET status='released',settled_at=?
    WHERE id=? AND status='reserved'`,
  )
    .bind(Date.now(), id)
    .run()
}
// Check actual serialized provider input before sending it; it must fit the reserved envelope.
export function verifyPayloadBudget(payload: unknown, run: BillingRun) {
  const rates = TariffSchema.parse(JSON.parse(run.tariff_json))
  const bytes = new TextEncoder().encode(JSON.stringify(payload)).byteLength
  const bound = usageCharge(
    {
      input: bytes,
      output: run.max_output_tokens,
      cacheRead: 0,
      cacheWrite: 0,
    },
    {
      ...rates,
      input: Math.max(rates.input, rates.cacheRead, rates.cacheWrite),
    },
  )
  if (bound > run.reserved)
    throw new BillingError('本次输入超出可用额度，请缩短内容后重试。')
}
export function prepareBilledPayload(
  payload: unknown,
  run: BillingRun,
  api: string,
) {
  if (!payload || typeof payload !== 'object')
    throw new BillingError('模型请求格式无效。', 503)
  const prepared = {
    ...payload,
    [api === 'openai-responses'
      ? 'max_output_tokens'
      : 'max_completion_tokens']: run.max_output_tokens,
  }
  verifyPayloadBudget(prepared, run)
  return prepared
}
