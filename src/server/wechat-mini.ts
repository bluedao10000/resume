import { z } from 'zod'
import { runtimeConfig } from '../config/runtime-defaults.mjs'
import { agentPost, durableStatus } from './agent-handler'

type MiniEnv = {
  DB: D1Database
  APP_MODE: string
  APP_MARKET: string
  AGENT_RUNTIME: string
  WECHAT_MINI_APP_ID?: string
  WECHAT_MINI_APP_SECRET?: string
}
export async function miniHash(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('')
}
const codeSchema = z.object({ code: z.string().min(1).max(256) }).strict()
const exchangeSchema = z.object({
  openid: z.string().min(1).max(256),
  session_key: z.string().min(1),
  errcode: z.number().optional(),
})
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
export async function miniSession(request: Request, env: MiniEnv) {
  const token = request.headers
    .get('authorization')
    ?.match(/^Bearer ([a-f0-9]{64})$/)?.[1]
  if (!token || !env.WECHAT_MINI_APP_ID) return null
  const row = await env.DB.prepare(
    'SELECT user_id FROM wechat_mini_sessions WHERE token_hash = ? AND app_id = ? AND expires_at > ?',
  )
    .bind(await miniHash(token), env.WECHAT_MINI_APP_ID, Date.now())
    .first<{ user_id: string }>()
  return row ? { user: { id: row.user_id } } : null
}
export async function miniApi(
  request: Request,
  bindings: unknown,
  providerFetch: typeof fetch = fetch,
): Promise<Response> {
  const env = runtimeConfig(bindings as object) as unknown as MiniEnv
  const path = new URL(request.url).pathname.slice('/api/wechat-mini/'.length)
  try {
    if (env.APP_MARKET !== 'cn')
      return json({ error: '小程序服务未开启。' }, 404)
    if (path === 'config' && request.method === 'GET')
      return json({
        mode: env.APP_MODE,
        runtime: env.AGENT_RUNTIME,
        loginEnabled:
          env.APP_MODE === 'live' &&
          !!(env.WECHAT_MINI_APP_ID && env.WECHAT_MINI_APP_SECRET),
      })
    if (path !== 'config' && env.APP_MODE !== 'live')
      return json({ error: '当前服务仅支持演示，请从试用示例进入。' }, 503)
    if (path === 'login' && request.method === 'POST') {
      if (!env.WECHAT_MINI_APP_ID || !env.WECHAT_MINI_APP_SECRET)
        return json({ error: '微信小程序登录尚未配置。' }, 503)
      const raw = await request.text()
      if (raw.length > 1024) return json({ error: '登录请求过长。' }, 413)
      let code: string
      try {
        code = codeSchema.parse(JSON.parse(raw)).code
      } catch {
        return json({ error: '登录凭证无效。' }, 400)
      }
      const url = new URL('https://api.weixin.qq.com/sns/jscode2session')
      url.search = new URLSearchParams({
        appid: env.WECHAT_MINI_APP_ID,
        secret: env.WECHAT_MINI_APP_SECRET,
        js_code: code,
        grant_type: 'authorization_code',
      }).toString()
      const response = await providerFetch(url, {
        signal: AbortSignal.timeout(10000),
      })
      const result = exchangeSchema.safeParse(await response.json())
      if (!response.ok || !result.success || result.data.errcode)
        return json({ error: '微信登录失败，请重新登录。' }, 401)
      // Do not link website accounts by client claims or optional unionid.
      const id =
        'wxmini-' +
        (await miniHash(
          JSON.stringify([env.WECHAT_MINI_APP_ID, result.data.openid]),
        ))
      const token =
        crypto.randomUUID().replaceAll('-', '') +
        crypto.randomUUID().replaceAll('-', '')
      const expiresAt = Date.now() + 7 * 86400000
      const now = new Date().toISOString()
      await env.DB.batch([
        env.DB.prepare(
          'INSERT OR IGNORE INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 0, ?, ?)',
        ).bind(id, '微信用户', id + '@mini.invalid', now, now),
        env.DB.prepare(
          'INSERT INTO wechat_mini_sessions (token_hash, user_id, app_id, expires_at) VALUES (?, ?, ?, ?)',
        ).bind(await miniHash(token), id, env.WECHAT_MINI_APP_ID, expiresAt),
        env.DB.prepare(
          'DELETE FROM wechat_mini_sessions WHERE expires_at <= ?',
        ).bind(Date.now()),
      ])
      return json({ token, expiresAt, user: { id, name: '微信用户' } })
    }
    const session = await miniSession(request, env)
    if (!session) return json({ error: '请先登录。' }, 401)
    if (path === 'session' && request.method === 'GET') return json(session)
    if (path === 'session' && request.method === 'DELETE') {
      await env.DB.prepare(
        'DELETE FROM wechat_mini_sessions WHERE token_hash = ?',
      )
        .bind(await miniHash(request.headers.get('authorization')!.slice(7)))
        .run()
      return json({ signedOut: true })
    }
    if (path === 'agent') {
      const resolve = async () => session
      const response =
        request.method === 'POST'
          ? await agentPost(request, resolve)
          : ['GET', 'DELETE'].includes(request.method)
            ? await durableStatus(request, resolve)
            : json({ error: '请求方法无效。' }, 405)
      const headers = new Headers(response.headers)
      headers.set('Cache-Control', 'no-store')
      return new Response(response.body, { status: response.status, headers })
    }
    return json({ error: '接口不存在。' }, 404)
  } catch {
    return json({ error: '小程序服务暂时不可用，请重试。' }, 503)
  }
}
