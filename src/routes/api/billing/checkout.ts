import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { billingHandler } from '../../../server/billing-http'
import {
  wechatCheckout,
  wechatOrderStatus,
  reconcileWechatOrder,
} from '../../../server/wechat-pay'
import { BillingError, paymentsConfigured } from '../../../server/billing'
import { cancelCheckout, checkout } from '../../../server/stripe'
export const Route = createFileRoute('/api/billing/checkout')({
  server: {
    handlers: {
      GET: ({ request }) =>
        billingHandler(request, (env, user) =>
          env.APP_MARKET === 'cn' && paymentsConfigured(env)
            ? wechatOrderStatus(env, user.id)
            : Promise.resolve({ order: null }),
        ),
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
          if (env.APP_MARKET === 'cn') {
            if (!paymentsConfigured(env))
              throw new BillingError('微信支付尚未开通。', 503)
            if (
              z
                .object({ check: z.literal(true) })
                .strict()
                .safeParse(value).success
            )
              return reconcileWechatOrder(env, user.id)
          }
          const parsed = z
            .object({ plan: z.enum(['plus', 'pro']) })
            .safeParse(value)
          if (!parsed.success) throw new BillingError('请选择有效套餐。', 400)
          return env.APP_MARKET === 'cn'
            ? wechatCheckout(env, user.id, parsed.data.plan)
            : checkout(env, user, parsed.data.plan)
        }),
      DELETE: ({ request }) =>
        billingHandler(request, async (env, user) => {
          if (env.APP_MARKET === 'cn')
            throw new BillingError('不支持此操作。', 405)
          await cancelCheckout(env, user.id)
          return { cancelled: true }
        }),
    },
  },
})
