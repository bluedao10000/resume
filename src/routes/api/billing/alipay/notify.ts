import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import { runtimeConfig } from '../../../../config/runtime-defaults.mjs'
import { alipayNotify } from '../../../../server/alipay-orders'
import type { BillingEnv } from '../../../../server/billing'

export const Route = createFileRoute('/api/billing/alipay/notify')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const config = runtimeConfig(env) as unknown as BillingEnv
          if (await alipayNotify(config, request))
            return new Response('success')
          return new Response('fail', { status: 400 })
        } catch {
          return new Response('fail', { status: 503 })
        }
      },
    },
  },
})
