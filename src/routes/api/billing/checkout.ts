import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { billingHandler } from '../../../server/billing-http'
import { BillingError } from '../../../server/billing'
import { cancelCheckout, checkout } from '../../../server/stripe'
export const Route = createFileRoute('/api/billing/checkout')({
  server: {
    handlers: {
      POST: ({ request }) =>
        billingHandler(request, async (env, user) => {
          if (Number(request.headers.get('content-length') ?? 0) > 1024)
            throw new BillingError('请求过大。', 413)
          const raw = await request.text()
          if (raw.length > 1024) throw new BillingError('请求过大。', 413)
          let value: unknown
          try {
            value = JSON.parse(raw)
          } catch {
            throw new BillingError('请求不是有效 JSON。', 400)
          }
          const parsed = z
            .object({ plan: z.enum(['plus', 'pro']) })
            .safeParse(value)
          if (!parsed.success) throw new BillingError('请选择有效套餐。', 400)
          return checkout(env, user, parsed.data.plan)
        }),
      DELETE: ({ request }) =>
        billingHandler(request, async (env, user) => {
          await cancelCheckout(env, user.id)
          return { cancelled: true }
        }),
    },
  },
})
