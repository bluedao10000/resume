import { createFileRoute } from '@tanstack/react-router'
import { billingHandler } from '../../../server/billing-http'
import { portal } from '../../../server/stripe'
export const Route = createFileRoute('/api/billing/portal')({
  server: {
    handlers: {
      POST: ({ request }) =>
        billingHandler(request, (env, user) => portal(env, user.id)),
    },
  },
})
