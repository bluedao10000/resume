import { createFileRoute } from '@tanstack/react-router'
import { billingHandler } from '../../../../server/billing-http'
import { alipayRefund } from '../../../../server/alipay-orders'
import { BillingError } from '../../../../server/billing'

export const Route = createFileRoute('/api/billing/alipay/refund')({
  server: {
    handlers: {
      POST: ({ request }) =>
        billingHandler(request, (env, user) => {
          const id = new URL(request.url).searchParams.get('order') ?? ''
          if (!/^[a-f0-9]{32}$/.test(id))
            throw new BillingError('订单编号无效。', 400)
          return alipayRefund(env, user.id, id)
        }),
    },
  },
})
