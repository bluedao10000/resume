import { env } from 'cloudflare:workers'
import { getAuth } from './auth'
import { BillingError, type BillingEnv } from './billing'

export async function billingHandler(
  request: Request,
  handler: (
    config: BillingEnv,
    user: { id: string; email: string },
  ) => Promise<unknown>,
) {
  try {
    const config = env as unknown as BillingEnv
    if (
      request.method !== 'GET' &&
      request.headers.get('origin') !== new URL(config.BETTER_AUTH_URL).origin
    )
      return Response.json({ error: '请求来源无效。' }, { status: 403 })
    const session = await getAuth().api.getSession({ headers: request.headers })
    if (!session) return Response.json({ error: '请先登录。' }, { status: 401 })
    return Response.json(await handler(config, session.user), {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    const reference = crypto.randomUUID()
    if (!(error instanceof BillingError))
      console.error('billing_failed', { reference })
    return Response.json(
      {
        error:
          error instanceof BillingError
            ? error.message
            : `计费服务暂时不可用。参考编号：${reference}`,
      },
      { status: error instanceof BillingError ? error.status : 503 },
    )
  }
}
