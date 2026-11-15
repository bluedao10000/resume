import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { billingHandler } from '../../../../server/billing-http'
import { alipayCheckout, alipayStatus } from '../../../../server/alipay-orders'
import { BillingError } from '../../../../server/billing'

export const Route = createFileRoute('/api/billing/alipay/')({
  server: {
    handlers: {
      GET: ({ request }) =>
        billingHandler(request, (env, user) =>
          alipayStatus(env, user.id, false),
        ),
      POST: ({ request }) =>
        billingHandler(request, async (env, user) => {
          if (Number(request.headers.get('content-length') ?? 0) > 1024)
            throw new BillingError('请求过大。', 413)
          const raw = await request.text()
          if (raw.length > 1024) throw new BillingError('请求过大。', 413)
          let body: unknown
          try {
            body = JSON.parse(raw)
          } catch {
            throw new BillingError('请求不是有效 JSON。', 400)
          }
          const parsed = z
            .union([
              z
                .object({
                  check: z.literal(true),
                  order: z
                    .string()
                    .regex(/^[a-f0-9]{32}$/)
                    .optional(),
                })
                .strict(),
              z.object({ plan: z.enum(['plus', 'pro']) }).strict(),
            ])
            .safeParse(body)
          if (!parsed.success) throw new BillingError('请选择有效套餐。', 400)
          if ('check' in parsed.data)
            return alipayStatus(env, user.id, true, parsed.data.order)
          return {
            paymentHtml: await alipayCheckout(env, user.id, parsed.data.plan),
          }
        }),
    },
  },
})
