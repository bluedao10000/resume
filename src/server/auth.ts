import { betterAuth } from 'better-auth'
import { env } from 'cloudflare:workers'
export function getAuth() {
  const config = env as unknown as Record<string, string> & { DB: D1Database }
  if (
    !config.BETTER_AUTH_SECRET ||
    !config.GOOGLE_CLIENT_ID ||
    !config.GOOGLE_CLIENT_SECRET
  )
    throw new Error('AUTH_NOT_CONFIGURED')
  return betterAuth({
    database: config.DB,
    secret: config.BETTER_AUTH_SECRET,
    baseURL: config.BETTER_AUTH_URL,
    socialProviders: {
      google: {
        clientId: config.GOOGLE_CLIENT_ID,
        clientSecret: config.GOOGLE_CLIENT_SECRET,
      },
    },
  })
}
export async function authHandler(request: Request) {
  try {
    return await getAuth().handler(request)
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'AUTH_NOT_CONFIGURED' &&
      new URL(request.url).pathname.endsWith('/get-session')
    )
      return Response.json(null)
    return Response.json(
      { message: 'Google 登录尚未配置。请按运维文档配置 OAuth 与 D1。' },
      { status: 503 },
    )
  }
}
