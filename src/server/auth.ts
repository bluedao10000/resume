import { runtimeConfig } from '../config/runtime-defaults.mjs'
import { betterAuth } from 'better-auth'
import { emailOTP } from 'better-auth/plugins'
import { sendLoginCode } from './auth-mail'
import { env } from 'cloudflare:workers'

export function authMethods(config: Record<string, string>) {
  const enabled = !!config.BETTER_AUTH_SECRET
  const marketOAuth =
    config.APP_MARKET === 'cn'
      ? config.WECHAT_APP_ID && config.WECHAT_APP_SECRET
      : config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET
  return {
    market: enabled && !!marketOAuth,
    github:
      enabled && !!(config.GITHUB_CLIENT_ID && config.GITHUB_CLIENT_SECRET),
    email: enabled && !!(config.AUTH_RESEND_API_KEY && config.AUTH_EMAIL_FROM),
  }
}

export function authConfigured(config: Record<string, string>) {
  return Object.values(authMethods(config)).some(Boolean)
}

export function getAuth() {
  const config = runtimeConfig(env) as unknown as Record<string, string> & {
    DB: D1Database
  }
  if (!authConfigured(config)) throw new Error('AUTH_NOT_CONFIGURED')
  const methods = authMethods(config)
  const china = config.APP_MARKET === 'cn'
  return betterAuth({
    database: config.DB,
    secret: config.BETTER_AUTH_SECRET,
    baseURL: config.BETTER_AUTH_URL,
    ...(china && {
      account: {
        accountLinking: { enabled: false },
        encryptOAuthTokens: true,
      },
    }),
    socialProviders: {
      ...(methods.market &&
        china && {
          wechat: {
            clientId: config.WECHAT_APP_ID,
            clientSecret: config.WECHAT_APP_SECRET,
          },
        }),
      ...(methods.market &&
        !china && {
          google: {
            clientId: config.GOOGLE_CLIENT_ID,
            clientSecret: config.GOOGLE_CLIENT_SECRET,
          },
        }),
      ...(methods.github && {
        github: {
          clientId: config.GITHUB_CLIENT_ID,
          clientSecret: config.GITHUB_CLIENT_SECRET,
        },
      }),
    },
    plugins: methods.email
      ? [
          emailOTP({
            expiresIn: 300,
            storeOTP: 'hashed',
            async sendVerificationOTP({ email, otp, type }) {
              if (type !== 'sign-in') return
              await sendLoginCode({
                apiKey: config.AUTH_RESEND_API_KEY,
                from: config.AUTH_EMAIL_FROM,
                email,
                otp,
              })
            },
          }),
        ]
      : [],
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
