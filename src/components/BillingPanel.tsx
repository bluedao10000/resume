import { useCallback, useEffect, useState } from 'react'
import { z } from 'zod'
import { BillingSummarySchema, type BillingSummary } from '../domain/billing'

const publicPlans = z.array(
  z.object({
    id: z.enum(['free', 'plus', 'pro']),
    name: z.string(),
    monthlyCents: z.number(),
    credits: z.number(),
  }),
)
const checkoutResult = z.object({
  order: z
    .object({
      plan: z.enum(['plus', 'pro']),
      totalFen: z.number().int().positive(),
      expiresAt: z.number(),
      qr: z.string().startsWith('data:image/png;base64,').nullable(),
    })
    .nullable(),
})
const credits = (units: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(
    units / 1000000,
  )
const count = (value: number) => new Intl.NumberFormat('en-US').format(value)
export function BillingPanel({
  signedIn,
  market,
  onLogin,
}: {
  signedIn: boolean
  market: 'cn' | 'global'
  onLogin: () => void
}) {
  const china = market === 'cn'
  const [order, setOrder] =
    useState<z.infer<typeof checkoutResult>['order']>(null)
  const [summary, setSummary] = useState<BillingSummary | null>(null)
  const [catalog, setCatalog] = useState<z.infer<typeof publicPlans>>([])
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState('')
  const [error, setError] = useState('')
  const [orderNotice, setOrderNotice] = useState('')
  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true)
      setError('')
      try {
        const [response, checkout] = await Promise.all([
          fetch(signedIn ? '/api/billing/' : '/api/config', { signal }),
          china && signedIn ? fetch('/api/billing/checkout', { signal }) : null,
        ])
        if (checkout?.ok)
          setOrder(checkoutResult.parse(await checkout.json()).order)
        const data = await response.json()
        if (!response.ok)
          throw new Error(
            z.object({ error: z.string().optional() }).parse(data).error ??
              '无法读取套餐',
          )
        if (signedIn) {
          const value = BillingSummarySchema.parse(data)
          setSummary(value)
          setCatalog(value.plans)
        } else
          setCatalog(
            z.object({ billingPlans: publicPlans }).parse(data).billingPlans,
          )
      } catch (cause) {
        if (!signal?.aborted)
          setError(cause instanceof Error ? cause.message : '无法读取套餐')
      } finally {
        if (!signal?.aborted) setLoading(false)
      }
    },
    [signedIn, china],
  )
  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])
  async function action(path: string, plan?: string, method = 'POST') {
    setOrderNotice('')
    setPending(plan ?? path)
    setError('')
    try {
      const response = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(plan && { body: JSON.stringify({ plan }) }),
        ...(china && !plan && { body: JSON.stringify({ check: true }) }),
      })
      const value = await response.json()
      if (!response.ok)
        throw new Error(
          z.object({ error: z.string().optional() }).parse(value).error ??
            '支付请求失败',
        )
      if (china) {
        const result = checkoutResult.parse(value)
        setOrder(result.order)
        if (!result.order) {
          await load()
        } else if (!plan) {
          setOrderNotice('暂未确认付款。若已支付，请稍后再查。')
        }
        return
      }
      if (method === 'DELETE') {
        await load()
        return
      }
      const target = z.object({ url: z.url() }).parse(value).url
      const url = new URL(target)
      if (
        url.protocol !== 'https:' ||
        !['checkout.stripe.com', 'billing.stripe.com'].includes(url.hostname)
      )
        throw new Error('支付地址无效')
      window.location.assign(target)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '支付请求失败')
    } finally {
      setPending('')
    }
  }
  if (loading) return <p role="status">正在读取套餐…</p>
  if (signedIn && !summary)
    return (
      <div role="alert" className="billing-error">
        <p>{error || '无法读取套餐'}</p>
        <button type="button" onClick={() => void load()}>
          重新读取
        </button>
      </div>
    )
  return (
    <div className="billing-panel">
      {summary ? (
        <section className="billing-usage" aria-label="本期用量">
          <div className="billing-usage-heading">
            <strong>
              {summary.plan === 'free'
                ? 'Free'
                : summary.plan === 'plus'
                  ? 'Plus'
                  : 'Pro'}
            </strong>
            <span>
              {credits(summary.used)} / {credits(summary.allowance)} credits
            </span>
          </div>
          <progress
            aria-label="已使用额度"
            max={summary.allowance || 1}
            value={summary.used}
          />
          <div className="billing-period">
            <span>可用 {credits(summary.remaining)} credits</span>
            <span>
              {new Date(summary.periodEnd).toLocaleDateString('zh-CN', {
                timeZone: china ? 'Asia/Shanghai' : 'UTC',
              })}{' '}
              {china && summary.plan !== 'free' ? '到期' : '重置'}
            </span>
          </div>
          {summary.reserved > 0 ? (
            <p>
              生成中预留 {credits(summary.reserved)}{' '}
              credits，结束后按实际用量结算。
            </p>
          ) : null}
          {summary.cancelAtPeriodEnd ? <p>订阅将在本期结束后取消。</p> : null}
        </section>
      ) : (
        <p className="field-hint">演示不消耗额度。登录后使用 Free 套餐。</p>
      )}
      {china && order ? (
        <section className="billing-usage" aria-label="待完成的微信支付">
          <strong>
            {order.plan === 'plus' ? 'Plus' : 'Pro'} · ¥{order.totalFen / 100} /
            30 天
          </strong>
          {order.qr ? (
            <>
              <p>请用微信扫一扫。支付后点击「查询支付结果」。</p>
              <img
                src={order.qr}
                alt="微信支付二维码"
                width={224}
                height={224}
                style={{ maxWidth: '100%', height: 'auto' }}
              />
              <p>
                支付截止{' '}
                {new Date(order.expiresAt).toLocaleString('zh-CN', {
                  timeZone: 'Asia/Shanghai',
                })}
              </p>
            </>
          ) : (
            <p>二维码暂不可用，请查询订单状态。</p>
          )}
          <button
            type="button"
            className="billing-button"
            disabled={!!pending}
            onClick={() => void action('/api/billing/checkout')}
          >
            查询支付结果
          </button>
          {orderNotice ? <p role="status">{orderNotice}</p> : null}
          {!order.qr && order.expiresAt > Date.now() + 60000 ? (
            <button
              type="button"
              className="billing-link"
              disabled={!!pending}
              onClick={() => void action('/api/billing/checkout', order.plan)}
            >
              继续微信支付
            </button>
          ) : null}
        </section>
      ) : null}
      <div className="billing-plans">
        {catalog.map((plan) => (
          <section
            key={plan.id}
            className={`billing-plan ${summary?.plan === plan.id ? 'current' : ''}`}
            aria-label={`${plan.name} 套餐`}
          >
            <h3>{plan.name}</h3>
            <p className="billing-price">
              {china ? '¥' : '$'}
              {plan.monthlyCents / 100}
              <span>{china && plan.id !== 'free' ? '/30 天' : '/月'}</span>
            </p>
            <p>
              {plan.credits} credits{' '}
              {china && plan.id !== 'free' ? '/ 30 天' : '/ 月'}
            </p>
            {china &&
            summary?.plan !== 'free' &&
            summary &&
            plan.id !== 'free' ? (
              <span className="billing-current">
                {summary.plan === plan.id ? '当前套餐' : '到期后可购买'}
              </span>
            ) : summary?.plan === plan.id ? (
              <span className="billing-current">当前套餐</span>
            ) : plan.id === 'free' ? (
              <span className="billing-current">免费使用</span>
            ) : (
              <button
                type="button"
                className="billing-button"
                disabled={
                  !!pending ||
                  (!!summary && !summary.paymentConfigured) ||
                  (china && !!order)
                }
                onClick={() =>
                  !signedIn
                    ? onLogin()
                    : void action(
                        summary?.canManage && summary.plan !== 'free'
                          ? '/api/billing/portal'
                          : '/api/billing/checkout',
                        summary?.plan !== 'free' ? undefined : plan.id,
                      )
                }
              >
                {pending === plan.id
                  ? '正在处理…'
                  : !signedIn
                    ? '登录后选择'
                    : summary?.plan !== 'free'
                      ? '管理订阅'
                      : china
                        ? `微信支付购买 ${plan.name}`
                        : `升级到 ${plan.name}`}
              </button>
            )}
          </section>
        ))}
      </div>
      {china ? (
        <p className="field-hint">
          付费套餐一次购买，有效期 30 天，到期回到
          Free。请使用另一台设备显示支付二维码。
        </p>
      ) : null}
      {summary && !summary.paymentConfigured ? (
        <p className="field-hint">在线支付尚未开通，当前可使用 Free 套餐。</p>
      ) : null}
      {summary?.canManage ? (
        <button
          type="button"
          className="billing-link"
          disabled={!!pending}
          onClick={() => void action('/api/billing/portal')}
        >
          管理订阅与账单
        </button>
      ) : null}
      {summary ? (
        <details className="billing-details">
          <summary>Token 用量与计费规则</summary>
          <dl>
            <div>
              <dt>输入</dt>
              <dd>{count(summary.tokens.input)} tokens</dd>
            </div>
            <div>
              <dt>缓存读取</dt>
              <dd>{count(summary.tokens.cacheRead)} tokens</dd>
            </div>
            <div>
              <dt>缓存写入</dt>
              <dd>{count(summary.tokens.cacheWrite)} tokens</dd>
            </div>
            <div>
              <dt>输出（含推理）</dt>
              <dd>{count(summary.tokens.output)} tokens</dd>
            </div>
          </dl>
          <p>
            每百万 Token：输入 {credits(summary.tariff.input)}、缓存读取{' '}
            {credits(summary.tariff.cacheRead)}、缓存写入{' '}
            {credits(summary.tariff.cacheWrite)}、输出{' '}
            {credits(summary.tariff.output)}{' '}
            credits。上下文与工具定义计入输入，推理计入输出，不重复扣减。
          </p>
          <p>
            额度按期重置、不结转、不自动产生超额费用。仅按模型报告的实际用量扣减；生成未完成但已产生的有效用量也会计入。
          </p>
        </details>
      ) : null}
      {error ? (
        <div role="alert" className="billing-error">
          <p>{error}</p>
          <button type="button" onClick={() => void load()}>
            重新读取
          </button>
          {!china && summary?.paymentConfigured ? (
            <button
              type="button"
              disabled={!!pending}
              onClick={() =>
                void action('/api/billing/checkout', undefined, 'DELETE')
              }
            >
              取消待完成结账
            </button>
          ) : null}
        </div>
      ) : null}
      {summary ? (
        <button
          type="button"
          className="billing-link"
          disabled={!!pending}
          onClick={() => void load()}
        >
          刷新用量
        </button>
      ) : null}
    </div>
  )
}
