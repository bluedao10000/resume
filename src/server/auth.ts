import { runtimeConfig } from '../config/runtime-defaults.mjs'
import { betterAuth } from 'better-auth'
import { env } from 'cloudflare:workers'

export function authConfigured(config: Record<string, string>) {
  return !!(
    config.BETTER_AUTH_SECRET &&
    (config.APP_MARKET === 'cn'
      ? config.WECHAT_APP_ID && config.WECHAT_APP_SECRET
      : config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET)
  )
}

export function getAuth() {
  const config = runtimeConfig(env) as unknown as Record<string, string> & {
    DB: D1Database
  }
  if (!authConfigured(config)) throw new Error('AUTH_NOT_CONFIGURED')
  const china = config.APP_MARKET === 'cn'
  return betterAuth({
    database: config.DB,
    secret: config.BETTER_AUTH_SECRET,
    baseURL: config.BETTER_AUTH_URL,
    ...(china
      ? {
          account: {
            accountLinking: { enabled: false },
            encryptOAuthTokens: true,
          },
          socialProviders: {
            wechat: {
              clientId: config.WECHAT_APP_ID,
              clientSecret: config.WECHAT_APP_SECRET,
            },
          },
        }
      : {
          socialProviders: {
            google: {
              clientId: config.GOOGLE_CLIENT_ID,
              clientSecret: config.GOOGLE_CLIENT_SECRET,
            },
          },
        }),
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
      { message: '登录服务暂时不可用。请重试。' },
      { status: 503 },
    )
  }
}
