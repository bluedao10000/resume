import { miniApi } from './server/wechat-mini'
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
    const movingFromWWW =
      config.BETTER_AUTH_URL === 'https://r.codeiy.com' &&
      url.origin === 'https://www.codeiy.com'
    const folioReturn = [
      '/api/auth/callback/wechat',
      '/api/auth/callback/github',
      '/billing/alipay-return',
    ].includes(url.pathname)
    if (
      movingFromWWW &&
      (request.method === 'GET' || request.method === 'HEAD') &&
      (url.pathname === '/' || folioReturn)
    ) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: config.BETTER_AUTH_URL + url.pathname + url.search,
          'Cache-Control': 'no-store',
          'Referrer-Policy': 'no-referrer',
        },
      })
    }
    if (url.pathname.startsWith('/api/wechat-mini/'))
      return miniApi(request, env)
    if (
      config.APP_MODE === 'live' &&
      (request.method === 'GET' || request.method === 'HEAD') &&
      url.pathname === '/'
    ) {
      const origin = new URL(config.BETTER_AUTH_URL).origin
      if (url.origin !== origin)
        return Response.redirect(
          new URL(url.pathname + url.search, origin),
          308,
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
