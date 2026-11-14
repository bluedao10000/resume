import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import { z } from 'zod'

const EventSchema = z.object({
  event: z.enum([
    'landing_view',
    'landing_login_click',
    'landing_demo_click',
    'landing_example_click',
  ]),
  source: z.string().max(64).optional(),
})
type AnalyticsBinding = {
  writeDataPoint: (point: {
    blobs?: string[]
    doubles?: number[]
    indexes?: string[]
  }) => void
}

export const Route = createFileRoute('/api/events')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const site = request.headers.get('sec-fetch-site')
        if (site && !['same-origin', 'same-site', 'none'].includes(site))
          return new Response(null, { status: 403 })
        if (Number(request.headers.get('content-length') ?? 0) > 512)
          return new Response(null, { status: 413 })
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return new Response(null, { status: 400 })
        }
        const parsed = EventSchema.safeParse(body)
        if (!parsed.success) return new Response(null, { status: 400 })
        try {
          const analytics = (env as unknown as { ANALYTICS?: AnalyticsBinding })
            .ANALYTICS
          // Anonymous counters only: event name plus optional campaign source.
          analytics?.writeDataPoint({
            blobs: [parsed.data.event, parsed.data.source ?? ''],
            doubles: [1],
            indexes: [parsed.data.event],
          })
        } catch {
          /* Analytics is best-effort and must never affect page rendering. */
        }
        return new Response(null, {
          status: 204,
          headers: { 'Cache-Control': 'no-store' },
        })
      },
    },
  },
})
