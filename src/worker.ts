import server from '@tanstack/react-start/server-entry'
export { ResumeAgentSession } from './server/resume-session'
import { runtimeConfig } from './config/runtime-defaults.mjs'
import { reconcilePendingAlipay } from './server/alipay-orders'
import type { BillingEnv } from './server/billing'

export default {
  ...server,
  fetch(request: Request, env: unknown) {
    const config = runtimeConfig(env as object) as unknown as BillingEnv
    const url = new URL(request.url)
    if (
      config.APP_MODE === 'live' &&
      request.method === 'GET' &&
      url.pathname === '/'
    ) {
      const origin = new URL(config.BETTER_AUTH_URL).origin
      if (url.origin !== origin)
        return Response.redirect(
          new URL(url.pathname + url.search, origin),
          302,
        )
    }
    return server.fetch(request)
  },
  scheduled(
    _controller: ScheduledController,
    env: unknown,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(
      reconcilePendingAlipay(
        runtimeConfig(env as object) as unknown as BillingEnv,
      ),
    )
  },
}
