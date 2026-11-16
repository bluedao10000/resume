import { readFileSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vitest'
import { testBillingDb } from './billing-test-db'
import { miniApi, miniHash, miniSession } from './wechat-mini'
vi.mock('cloudflare:workers', () => ({ env: {} }))
vi.mock('./agent-handler', () => ({
  agentPost: vi.fn(
    async (request: Request, resolve: (r: Request) => Promise<unknown>) =>
      Response.json(await resolve(request)),
  ),
  durableStatus: vi.fn(
    async (request: Request, resolve: (r: Request) => Promise<unknown>) =>
      Response.json(await resolve(request)),
  ),
}))
const cleanup: (() => void)[] = []
afterEach(() => cleanup.splice(0).forEach((fn) => fn()))
function setup() {
  const db = testBillingDb()
  cleanup.push(db.close)
  db.sqlite.exec(readFileSync('migrations/0006_wechat_mini.sql', 'utf8'))
  const env = {
    ...db.env,
    APP_MARKET: 'cn',
    APP_MODE: 'live',
    AGENT_RUNTIME: 'pi-durable',
    WECHAT_MINI_APP_ID: 'wx-fixture',
    WECHAT_MINI_APP_SECRET: 'server-secret',
  }
  const provider = vi.fn(async () =>
    Response.json({
      openid: 'fixture-openid',
      session_key: 'never-send-to-client',
    }),
  )
  return { ...db, env, provider }
}
function req(path: string, method = 'GET', body?: object, token?: string) {
  return new Request('https://example.com/api/wechat-mini/' + path, {
    method,
    headers: {
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}
it('exchanges server-only credentials, hashes tokens, and reuses the same AppID-scoped user', async () => {
  const { env, provider, sqlite } = setup()
  const first = await miniApi(
    req('login', 'POST', { code: 'code-1' }),
    env,
    provider,
  )
  const body = (await first.json()) as { token: string; user: { id: string } }
  expect(first.status).toBe(200)
  expect(JSON.stringify(body)).not.toMatch(
    /session_key|never-send|server-secret|fixture-openid/,
  )
  expect(first.headers.get('cache-control')).toBe('no-store')
  expect(
    sqlite.prepare('SELECT token_hash FROM wechat_mini_sessions').get()
      ?.token_hash,
  ).toBe(await miniHash(body.token))
  const again = (await (
    await miniApi(req('login', 'POST', { code: 'code-2' }), env, provider)
  ).json()) as typeof body
  expect(again.user.id).toBe(body.user.id)
  expect(again.token).not.toBe(body.token)
  expect(
    await miniSession(req('session', 'GET', undefined, body.token), env),
  ).toEqual({ user: { id: body.user.id } })
  expect(
    await miniSession(req('session', 'GET', undefined, body.token), {
      ...env,
      WECHAT_MINI_APP_ID: 'other-app',
    }),
  ).toBeNull()
  const routed = await miniApi(
    req('agent', 'POST', { userId: 'forged' }, body.token),
    env,
    provider,
  )
  expect(await routed.json()).toEqual({ user: { id: body.user.id } })
  await miniApi(req('session', 'DELETE', undefined, body.token), env, provider)
  expect(
    (await miniApi(req('session', 'GET', undefined, body.token), env, provider))
      .status,
  ).toBe(401)
  sqlite.prepare('UPDATE wechat_mini_sessions SET expires_at = 0').run()
  expect(
    await miniSession(req('session', 'GET', undefined, again.token), env),
  ).toBeNull()
})
it('rejects provider errors, unconfigured login, forged tokens and client identity injection', async () => {
  const { env, provider, sqlite } = setup()
  expect(
    (
      await miniApi(
        req('login', 'POST', { code: 'code', openid: 'forged' }),
        env,
        provider,
      )
    ).status,
  ).toBe(400)
  expect(provider).not.toHaveBeenCalled()
  expect(
    (
      await miniApi(
        req('login', 'POST', { code: 'code' }),
        { ...env, WECHAT_MINI_APP_SECRET: '' },
        provider,
      )
    ).status,
  ).toBe(503)
  expect(
    (await miniApi(req('agent', 'POST', {}, 'a'.repeat(64)), env, provider))
      .status,
  ).toBe(401)
  provider.mockResolvedValueOnce(
    Response.json({ errcode: 40029, errmsg: 'secret provider diagnostic' }),
  )
  const result = await miniApi(
    req('login', 'POST', { code: 'bad' }),
    env,
    provider,
  )
  expect(result.status).toBe(401)
  expect(await result.text()).not.toContain('diagnostic')
  expect(
    sqlite.prepare('SELECT COUNT(*) AS count FROM wechat_mini_sessions').get()
      ?.count,
  ).toBe(0)
})

it('requires a mini session for document extraction and returns review text without generating a resume', async () => {
  const { env, provider } = setup()
  expect(
    (await miniApi(req('document?type=docx', 'POST', {}), env, provider))
      .status,
  ).toBe(401)
  const login = await miniApi(
    req('login', 'POST', { code: 'document-login' }),
    env,
    provider,
  )
  const { token } = (await login.json()) as { token: string }
  const response = await miniApi(
    new Request('https://example.com/api/wechat-mini/document?type=docx', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: readFileSync('tests/fixtures/resume.docx'),
    }),
    env,
    provider,
  )
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({
    text: expect.stringContaining('测试候选人'),
  })
  expect(response.headers.get('cache-control')).toBe('no-store')
})
