import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import { plans } from '../../server/billing'
export const Route = createFileRoute('/api/config')({
  server: {
    handlers: {
      GET: () => {
        const config = env as unknown as Record<string, string>
        return Response.json({
          mode: config.APP_MODE === 'live' ? 'live' : 'demo',
          billingPlans: plans(config),
          runtime:
            config.AGENT_RUNTIME === 'pi-durable' ? 'pi-durable' : 'pi-ai',
          authConfigured: Boolean(
            config.BETTER_AUTH_SECRET &&
            config.GOOGLE_CLIENT_ID &&
            config.GOOGLE_CLIENT_SECRET,
          ),
        })
      },
    },
  },
})
