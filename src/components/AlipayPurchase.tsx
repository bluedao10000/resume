import { useEffect, useState } from 'react'
import { z } from 'zod'

const statusSchema = z.object({
  enabled: z.boolean(),
  order: z
    .object({
      id: z.string(),
      plan: z.enum(['plus', 'pro']),
      status: z.enum([
        'pending',
        'closed',
        'paid',
        'refund_pending',
        'refunded',
      ]),
      expiresAt: z.number(),
      totalFen: z.number().int().positive(),
    })
    .nullable(),
})

type AlipayOrder = NonNullable<z.infer<typeof statusSchema>['order']>
type AlipayAction = 'plus' | 'pro' | 'check'

export function useAlipayPurchase(enabled: boolean, onUpdate: () => void) {
  const [status, setStatus] = useState<z.infer<typeof statusSchema>>()
  const [busy, setBusy] = useState<AlipayAction | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    fetch('/api/billing/alipay/', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('status')
        const result = statusSchema.parse(await response.json())
        if (!result.enabled) throw new Error('disabled')
        if (!controller.signal.aborted) setStatus(result)
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadError(true)
      })
    return () => controller.abort()
  }, [enabled, attempt])

  async function submit(action: AlipayAction) {
    setBusy(action)
    setNotice('')
    setError('')
    try {
      const response = await fetch('/api/billing/alipay/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          action === 'check' ? { check: true } : { plan: action },
        ),
      })
      const result = await response.json()
      if (!response.ok)
        throw new Error(z.object({ error: z.string() }).parse(result).error)
      if (action !== 'check') {
        const { paymentHtml } = z
          .object({ paymentHtml: z.string() })
          .parse(result)
        submitPaymentForm(paymentHtml)
        return
      }
      const value = statusSchema.parse(result)
      setStatus(value)
      onUpdate()
      setNotice(
        value.order?.status === 'paid'
          ? '支付宝已确认付款。'
          : value.order?.status === 'pending'
            ? '支付宝尚未确认到账。若已付款，请稍后再查。'
            : '订单状态已更新。',
      )
    } catch (cause) {
      setError(
        cause instanceof z.ZodError
          ? '暂时无法读取支付宝响应，请重试。'
          : cause instanceof Error
            ? cause.message
            : '暂时无法连接支付宝。',
      )
    } finally {
      setBusy(null)
    }
  }

  return {
    ready: !!status?.enabled,
    order: status?.order ?? null,
    busy,
    notice,
    error,
    loadError,
    submit,
    retry: () => {
      setLoadError(false)
      setAttempt((value) => value + 1)
    },
  }
}

const orderStatus = {
  pending: '待付款',
  closed: '已关闭',
  paid: '已付款',
  refund_pending: '退款处理中',
  refunded: '已退款',
}

export function AlipayOrderStatus({
  order,
  busy,
  submit,
}: {
  order: AlipayOrder
  busy: AlipayAction | null
  submit: (action: AlipayAction) => Promise<void>
}) {
  const pending = order.status === 'pending'
  const expired = pending && order.expiresAt <= Date.now()
  const plan = order.plan === 'plus' ? 'Plus' : 'Pro'
  return (
    <section className="billing-alipay-order" aria-label="支付宝订单">
      <div className="billing-alipay-order-header">
        <div>
          <h3>{expired ? '订单已过支付期限' : orderStatus[order.status]}</h3>
          <p>{plan} · 支付宝</p>
        </div>
        <strong>¥{(order.totalFen / 100).toFixed(2)}</strong>
      </div>
      <div className="billing-order-actions">
        {pending && !expired && (
          <button
            type="button"
            className="billing-button billing-alipay-button"
            disabled={!!busy}
            onClick={() => void submit(order.plan)}
          >
            {busy === order.plan ? '正在打开支付宝…' : '继续支付宝付款'}
          </button>
        )}
        <button
          type="button"
          className="billing-button"
          disabled={!!busy}
          onClick={() => void submit('check')}
        >
          {busy === 'check' ? '正在查询…' : '查询支付结果'}
        </button>
      </div>
      <details className="billing-order-details">
        <summary>订单详情</summary>
        <p>
          订单号 <code>{order.id}</code>
        </p>
        {pending && (
          <p>
            支付截止{' '}
            {new Date(order.expiresAt).toLocaleString('zh-CN', {
              timeZone: 'Asia/Shanghai',
            })}
          </p>
        )}
      </details>
    </section>
  )
}

function submitPaymentForm(html: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const original = parsed.querySelector('form')
  if (!original) throw new Error('未收到支付宝支付表单。')
  const url = new URL(original.action)
  if (
    url.protocol !== 'https:' ||
    url.port ||
    url.username ||
    url.password ||
    !['openapi.alipay.com', 'openapi-sandbox.dl.alipaydev.com'].includes(
      url.hostname,
    ) ||
    url.pathname !== '/gateway.do'
  )
    throw new Error('支付宝支付地址无效。')
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = url.href
  for (const field of original.querySelectorAll<HTMLInputElement>(
    'input[type=hidden]',
  )) {
    if (!field.name) continue
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = field.name
    input.value = field.value
    form.appendChild(input)
  }
  document.body.appendChild(form)
  HTMLFormElement.prototype.submit.call(form)
}
