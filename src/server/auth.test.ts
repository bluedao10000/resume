import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vitest'
import { env } from 'cloudflare:workers'
import { getAuth } from './auth'

vi.mock('cloudflare:workers', () => ({ env: {} }))
afterEach(() => vi.unstubAllGlobals())

it.each([
  { localVerified: true, githubVerified: true, links: true },
  { localVerified: true, githubVerified: false, links: false },
  { localVerified: false, githubVerified: true, links: false },
])(
  'GitHub account linking requires both verified emails: %j',
  async ({ localVerified, githubVerified, links }) => {
    const origin = 'http://localhost:5173'
    const email = 'folio-fixture@example.com'
    const database = new DatabaseSync(':memory:')
    try {
      database.exec(readFileSync('migrations/0001_better_auth.sql', 'utf8'))
      database
        .prepare(
          'INSERT INTO "user" (id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,?,?,?)',
        )
        .run(
          'original-account',
          'Email user',
          email,
          Number(localVerified),
          0,
          0,
        )
      Object.assign(env, {
        DB: database,
        APP_MARKET: 'cn',
        BETTER_AUTH_URL: origin,
        BETTER_AUTH_SECRET: 'fake-local-test-secret-at-least-32-characters',
        GITHUB_CLIENT_ID: 'fixture',
        GITHUB_CLIENT_SECRET: 'fixture',
      })
      vi.stubGlobal(
        'fetch',
        vi.fn(async (target: string | URL | Request) => {
          const url = new URL(target instanceof Request ? target.url : target)
          if (
            url.hostname === 'github.com' &&
            url.pathname === '/login/oauth/access_token'
          )
            return Response.json({
              access_token: 'fixture-token',
              token_type: 'bearer',
              scope: 'user:email',
            })
          if (url.hostname === 'api.github.com' && url.pathname === '/user')
            return Response.json({ id: 123, login: 'fixture', email })
          if (
            url.hostname === 'api.github.com' &&
            url.pathname === '/user/emails'
          )
            return Response.json([
              { email, primary: true, verified: githubVerified },
            ])
          throw new Error('Unexpected provider URL')
        }),
      )
      const auth = getAuth()
      const initial = await auth.handler(
        new Request(origin + '/api/auth/sign-in/social', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', origin },
          body: JSON.stringify({
            provider: 'github',
            callbackURL: '/',
            errorCallbackURL: '/?loginFailed=1',
          }),
        }),
      )
      expect(initial.ok).toBe(true)
      const authorization = new URL(
        ((await initial.json()) as { url: string }).url,
      )
      const callback = new URL(origin + '/api/auth/callback/github')
      callback.searchParams.set(
        'state',
        authorization.searchParams.get('state')!,
      )
      callback.searchParams.set('code', 'fixture-code')
      const result = await auth.handler(
        new Request(callback, {
          headers: {
            cookie: initial.headers
              .getSetCookie()
              .map((cookie) => cookie.split(';')[0])
              .join('; '),
          },
        }),
      )
      const target = new URL(result.headers.get('location')!, origin)
      expect(target.searchParams.has('loginFailed')).toBe(!links)
      if (links) {
        const sessionResponse = await auth.handler(
          new Request(origin + '/api/auth/get-session', {
            headers: {
              cookie: result.headers
                .getSetCookie()
                .map((cookie) => cookie.split(';')[0])
                .join('; '),
            },
          }),
        )
        expect(await sessionResponse.json()).toMatchObject({
          user: { id: 'original-account' },
        })
      }
      const account = database
        .prepare("SELECT userId FROM account WHERE providerId='github'")
        .get()
      expect(account?.userId).toBe(links ? 'original-account' : undefined)
      expect(
        database.prepare('SELECT COUNT(*) AS total FROM "user"').get()?.total,
      ).toBe(1)
    } finally {
      database.close()
    }
  },
)
