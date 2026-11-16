import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vitest'
import { env } from 'cloudflare:workers'
import { authMethods, getAuth } from './auth'

vi.mock('cloudflare:workers', () => ({ env: {} }))
afterEach(() => {
  vi.unstubAllGlobals()
  for (const key of Object.keys(env))
    delete (env as Record<string, unknown>)[key]
})

const origin = 'https://www.example.com'
const cookies = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ')

it('only enables WeChat with both credentials in the CN market', () => {
  const config = {
    APP_MARKET: 'cn',
    BETTER_AUTH_SECRET: 'fixture',
    WECHAT_APP_ID: 'fixture',
    WECHAT_APP_SECRET: 'fixture',
  }
  expect(authMethods(config).market).toBe(true)
  expect(authMethods({ ...config, WECHAT_APP_SECRET: '' }).market).toBe(false)
  expect(authMethods({ ...config, APP_MARKET: 'global' }).market).toBe(false)
})

it.each([
  'success',
  'invalid-state',
  'missing-cookie',
  'provider-error',
] as const)('WeChat website OAuth: %s', async (scenario) => {
  const database = new DatabaseSync(':memory:')
  try {
    database.exec(readFileSync('migrations/0001_better_auth.sql', 'utf8'))
    Object.assign(env, {
      DB: database,
      APP_MARKET: 'cn',
      BETTER_AUTH_URL: origin,
      BETTER_AUTH_SECRET: 'fake-local-test-secret-at-least-32-characters',
      WECHAT_APP_ID: 'wx-test-app',
      WECHAT_APP_SECRET: 'wechat-test-secret',
    })
    const provider = vi.fn(async (target: string | URL | Request) => {
      const url = new URL(target instanceof Request ? target.url : target)
      expect(url.hostname).toBe('api.weixin.qq.com')
      if (url.pathname === '/sns/oauth2/access_token') {
        expect(url.searchParams.get('appid')).toBe('wx-test-app')
        expect(url.searchParams.get('secret')).toBe('wechat-test-secret')
        expect(url.searchParams.get('code')).toBe('fixture-code')
        if (scenario === 'provider-error')
          return Response.json({ errcode: 40029, errmsg: 'invalid code' })
        return Response.json({
          access_token: 'fixture-access-token',
          refresh_token: 'fixture-refresh-token',
          expires_in: 7200,
          scope: 'snsapi_login',
          openid: 'fixture-openid',
          unionid: 'fixture-unionid',
        })
      }
      if (url.pathname === '/sns/userinfo') {
        expect(url.searchParams.get('openid')).toBe('fixture-openid')
        return Response.json({
          openid: 'fixture-openid',
          unionid: 'fixture-unionid',
          nickname: '微信测试用户',
          headimgurl: 'https://example.com/avatar.png',
        })
      }
      throw new Error('Unexpected provider path')
    })
    vi.stubGlobal('fetch', provider)
    const auth = getAuth()
    async function login() {
      const initial = await auth.handler(
        new Request(origin + '/api/auth/sign-in/social', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', origin },
          body: JSON.stringify({
            provider: 'wechat',
            callbackURL: '/',
            errorCallbackURL: '/?loginFailed=1',
          }),
        }),
      )
      expect(initial.ok).toBe(true)
      const payload = (await initial.json()) as { url: string }
      expect(JSON.stringify(payload)).not.toContain('wechat-test-secret')
      const authorization = new URL(payload.url)
      expect(authorization.origin + authorization.pathname).toBe(
        'https://open.weixin.qq.com/connect/qrconnect',
      )
      expect(authorization.searchParams.get('appid')).toBe('wx-test-app')
      expect(authorization.searchParams.get('scope')).toBe('snsapi_login')
      expect(authorization.searchParams.get('redirect_uri')).toBe(
        origin + '/api/auth/callback/wechat',
      )
      expect(authorization.searchParams.get('state')).toBeTruthy()
      const callback = new URL(origin + '/api/auth/callback/wechat')
      callback.searchParams.set('code', 'fixture-code')
      callback.searchParams.set(
        'state',
        scenario === 'invalid-state'
          ? 'tampered'
          : authorization.searchParams.get('state')!,
      )
      return auth.handler(
        new Request(callback, {
          headers: {
            cookie: scenario === 'missing-cookie' ? '' : cookies(initial),
          },
        }),
      )
    }
    const result = await login()
    if (scenario !== 'success') {
      expect(
        database.prepare('SELECT COUNT(*) AS total FROM session').get()?.total,
      ).toBe(0)
      expect(
        database.prepare('SELECT COUNT(*) AS total FROM "user"').get()?.total,
      ).toBe(0)
      expect(result.headers.get('location')).toContain('error=')
      if (scenario !== 'provider-error') expect(provider).not.toHaveBeenCalled()
      return
    }
    expect(new URL(result.headers.get('location')!, origin).href).toBe(
      origin + '/',
    )
    const session = await auth.handler(
      new Request(origin + '/api/auth/get-session', {
        headers: { cookie: cookies(result) },
      }),
    )
    const first = (await session.json()) as { user: { id: string } }
    expect(first).toMatchObject({
      user: { name: '微信测试用户', emailVerified: false },
    })
    const second = await login()
    const repeated = await auth.handler(
      new Request(origin + '/api/auth/get-session', {
        headers: { cookie: cookies(second) },
      }),
    )
    expect(await repeated.json()).toMatchObject({ user: { id: first.user.id } })
    expect(
      database.prepare('SELECT COUNT(*) AS total FROM "user"').get()?.total,
    ).toBe(1)
    const account = database
      .prepare(
        "SELECT accountId, accessToken FROM account WHERE providerId='wechat'",
      )
      .get()
    expect(account?.accountId).toBe('fixture-unionid')
    expect(account?.accessToken).toBeTruthy()
    expect(account?.accessToken).not.toBe('fixture-access-token')
  } finally {
    database.close()
  }
})
