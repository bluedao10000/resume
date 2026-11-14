import { createFileRoute } from '@tanstack/react-router'
import { billingHandler } from '../../../server/billing-http'
import { BillingError } from '../../../server/billing'
import { portal } from '../../../server/stripe'
export const Route = createFileRoute('/api/billing/portal')({
  server: {
    handlers: {
      POST: ({ request }) =>
        billingHandler(request, (env, user) => {
          if (env.APP_MARKET === 'cn')
            throw new BillingError('不支持此操作。', 405)
          return portal(env, user.id)
        }),
    },
  },
})
