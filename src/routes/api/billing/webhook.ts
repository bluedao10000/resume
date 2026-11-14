import { runtimeConfig } from '../../../config/runtime-defaults.mjs'
import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import {
  decryptWechatNotification,
  verifyWechatSignature,
} from '../../../server/wechat-pay-crypto'
import { settleWechatOrder } from '../../../server/wechat-pay'
import { paymentsConfigured, type BillingEnv } from '../../../server/billing'
import {
  processStripeEvent,
  verifyStripeSignature,
} from '../../../server/stripe'
export const Route = createFileRoute('/api/billing/webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const config = runtimeConfig(env) as unknown as BillingEnv
        const wechat = config.APP_MARKET === 'cn'
        if (
          wechat ? !paymentsConfigured(config) : !config.STRIPE_WEBHOOK_SECRET
        )
          return new Response(null, { status: 503 })
        if (Number(request.headers.get('content-length') ?? 0) > 1000000)
          return new Response(null, { status: 413 })
        const raw = await request.text()
        if (raw.length > 1000000) return new Response(null, { status: 413 })
        if (
          !(wechat
            ? await verifyWechatSignature(config, request.headers, raw)
            : await verifyStripeSignature(
                raw,
                request.headers.get('stripe-signature'),
                config.STRIPE_WEBHOOK_SECRET,
                Number(config.STRIPE_WEBHOOK_TOLERANCE_SECONDS),
              ))
        )
          return Response.json({ error: 'Invalid signature' }, { status: 400 })
        try {
          if (wechat) {
            await settleWechatOrder(
              config,
              await decryptWechatNotification(config, raw),
            )
            return new Response(null, { status: 204 })
          }
          await processStripeEvent(config, raw)
          return Response.json({ received: true })
        } catch {
          console.error('billing_webhook_failed', {
            reference: crypto.randomUUID(),
          })
          return Response.json(
            { error: 'Webhook processing failed' },
            { status: 500 },
          )
        }
      },
    },
  },
})
