import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { fetchSession } from '../../server/session'

export const Route = createFileRoute('/billing/alipay-return')({
  loader: () => fetchSession(),
  component: AlipayReturn,
})

function AlipayReturn() {
  const session = Route.useLoaderData()
  const [message, setMessage] = useState('正在确认支付结果。')

  useEffect(() => {
    if (!session) return
    const order = new URLSearchParams(location.search).get('order')
    if (!order || !/^[a-f0-9]{32}$/.test(order)) {
      setMessage('当前没有可查询的订单。')
      return
    }
    const controller = new AbortController()
    fetch('/api/billing/alipay/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ check: true, order }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('status')
        const result = (await response.json()) as { order?: { status: string } }
        setMessage(
          result.order?.status === 'paid'
            ? '付款已确认，可以使用套餐额度。'
            : '当前账户暂无已确认的支付宝付款。',
        )
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setMessage('暂时无法查询订单，请回到套餐页面重试。')
      })
    return () => controller.abort()
  }, [session])

  return (
    <main className="entry-loading">
      <h1>支付宝付款结果</h1>
      <p role="status">
        {session ? message : '请登录购买时使用的账户查看付款结果。'}
      </p>
      <a className="outline-button" href="/">
        返回 Folio
      </a>
    </main>
  )
}
