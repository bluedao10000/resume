import { useEffect, useState } from 'react'
import { BillingSummarySchema, type BillingSummary } from '../domain/billing'
import { formatCredits } from '../lib/billing-format'

export function AccountDetails({
  user,
  onBilling,
}: {
  user: { id: string; name: string; email: string }
  onBilling: () => void
}) {
  const [summary, setSummary] = useState<BillingSummary | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/billing/', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Billing summary unavailable')
        return BillingSummarySchema.parse(await response.json())
      })
      .then((value) => {
        if (!controller.signal.aborted) setSummary(value)
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true)
      })
    return () => controller.abort()
  }, [attempt])

  const name = user.name.trim()
  const email = user.email.trim()
  const hasEmail =
    email && !email.toLowerCase().endsWith('.placeholder.invalid')

  return (
    <>
      <dl className="account-details">
        {name ? (
          <div>
            <dt>昵称</dt>
            <dd>{name}</dd>
          </div>
        ) : null}
        {hasEmail ? (
          <div>
            <dt>邮箱</dt>
            <dd>{email}</dd>
          </div>
        ) : null}
        {!name && !hasEmail ? (
          <div>
            <dt>账户 ID</dt>
            <dd>{user.id}</dd>
          </div>
        ) : null}
        {summary ? (
          <>
            <div>
              <dt>当前套餐</dt>
              <dd>
                {summary.plans.find((plan) => plan.id === summary.plan)?.name ??
                  summary.plan}
              </dd>
            </div>
            <div>
              <dt>剩余额度</dt>
              <dd>
                {formatCredits(summary.remaining)} /{' '}
                {formatCredits(summary.allowance)} credits
              </dd>
            </div>
          </>
        ) : null}
        <div>
          <dt>存储</dt>
          <dd>当前浏览器</dd>
        </div>
      </dl>
      {failed ? (
        <div role="alert">
          <p>暂时无法读取套餐与额度。</p>
          <button
            className="billing-link"
            onClick={() => {
              setFailed(false)
              setAttempt((value) => value + 1)
            }}
          >
            重试
          </button>
        </div>
      ) : !summary ? (
        <p role="status">正在读取套餐与额度…</p>
      ) : null}
      <button className="billing-link account-billing-link" onClick={onBilling}>
        查看套餐与用量
      </button>
    </>
  )
}
