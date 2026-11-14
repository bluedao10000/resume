import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import { type BillingEnv } from '../../../server/billing'
import {
  processStripeEvent,
  verifyStripeSignature,
} from '../../../server/stripe'
export const Route = createFileRoute('/api/billing/webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const config = env as unknown as BillingEnv
        if (!config.STRIPE_WEBHOOK_SECRET)
          return new Response(null, { status: 503 })
        if (Number(request.headers.get('content-length') ?? 0) > 1000000)
          return new Response(null, { status: 413 })
        const raw = await request.text()
        if (raw.length > 1000000) return new Response(null, { status: 413 })
        if (
          !(await verifyStripeSignature(
            raw,
            request.headers.get('stripe-signature'),
            config.STRIPE_WEBHOOK_SECRET,
            Number(config.STRIPE_WEBHOOK_TOLERANCE_SECONDS),
          ))
        )
          return Response.json({ error: 'Invalid signature' }, { status: 400 })
        try {
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
