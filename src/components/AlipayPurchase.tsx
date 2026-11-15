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

export function AlipayPurchase({
  plans,
  canBuy,
  onUpdate,
}: {
  plans: { id: string; name: string; monthlyCents: number; credits: number }[]
  canBuy: boolean
  onUpdate: () => void
}) {
  const [status, setStatus] = useState<z.infer<typeof statusSchema>>()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/billing/alipay/', { signal: controller.signal })
      .then(async (response) => {
        if (response.ok) setStatus(statusSchema.parse(await response.json()))
      })
      .catch(() => {})
    return () => controller.abort()
  }, [])

  async function submit(plan?: string) {
    setBusy(true)
    setNotice('')
    try {
      const response = await fetch('/api/billing/alipay/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(plan ? { plan } : { check: true }),
      })
      const result = await response.json()
      if (!response.ok)
        throw new Error(z.object({ error: z.string() }).parse(result).error)
      if (plan) {
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
        value.order?.status === 'paid' ? '付款已确认。' : '尚无新付款确认。',
      )
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '暂时无法连接支付宝。')
    } finally {
      setBusy(false)
    }
  }

  if (!status?.enabled) return null
  const pending = status.order?.status === 'pending' ? status.order : null
  return (
    <section aria-label="支付宝购买">
      <h3>支付宝购买 AI 额度包</h3>
      <p>一次付款，额度有效期 30 天。</p>
      <div className="landing-actions">
        {canBuy &&
          plans
            .filter((item) => item.id !== 'free')
            .filter((item) => !pending || item.id === pending.plan)
            .map((item) => (
              <button
                className="outline-button"
                key={item.id}
                disabled={
                  busy || Boolean(pending && pending.expiresAt <= Date.now())
                }
                onClick={() => void submit(item.id)}
              >
                {pending ? '继续支付' : '购买'} {item.name} · ¥
                {((pending?.totalFen ?? item.monthlyCents) / 100).toFixed(2)} ·{' '}
                {item.credits} 额度
              </button>
            ))}
        <button
          className="outline-button"
          disabled={busy}
          onClick={() => void submit()}
        >
          查询支付宝订单
        </button>
      </div>
      {status.order && <p className="field-hint">订单号 {status.order.id}</p>}
      {notice && <p role="status">{notice}</p>}
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
