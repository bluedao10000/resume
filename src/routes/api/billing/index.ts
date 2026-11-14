import { createFileRoute } from '@tanstack/react-router'
import { billingHandler } from '../../../server/billing-http'
import { billingSummary } from '../../../server/billing'
export const Route = createFileRoute('/api/billing/')({
  server: {
    handlers: {
      GET: ({ request }) =>
        billingHandler(request, (env, user) => billingSummary(env, user.id)),
    },
  },
})
