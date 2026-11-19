import { expect, it, vi } from 'vitest'
import worker from './worker'

vi.mock('@tanstack/react-start/server-entry', () => ({
  default: { fetch: () => new Response('SSR') },
}))
vi.mock('./server/resume-session', () => ({ ResumeAgentSession: class {} }))
vi.mock('./server/wechat-mini', () => ({
  miniApi: () => Response.json({ mini: true }),
}))
vi.mock('./server/alipay-orders', () => ({ reconcilePendingAlipay: vi.fn() }))

const config = {
  APP_MODE: 'live',
  APP_MARKET: 'cn',
  BETTER_AUTH_URL: 'https://r.codeiy.com',
}

it.each(['GET', 'HEAD'])(
  'redirects the live alias homepage on %s and keeps the query',
  async (method) => {
    const response = await worker.fetch(
      new Request('https://codeiy.com/?utm_source=docs&x=a%2Bb', { method }),
      config,
    )
    expect(response.status).toBe(308)
    expect(response.headers.get('Location')).toBe(
      'https://r.codeiy.com/?utm_source=docs&x=a%2Bb',
    )
  },
)

it.each([
  ['https://r.codeiy.com/', 'GET', 'live'],
  ['https://r.codeiy.com/', 'HEAD', 'live'],
  ['https://codeiy.com/api/config', 'GET', 'live'],
  ['https://codeiy.com/', 'POST', 'live'],
  ['https://codeiy.com/', 'GET', 'demo'],
])('passes %s %s (%s) through to SSR', async (url, method, mode) => {
  const response = await worker.fetch(new Request(url, { method }), {
    ...config,
    APP_MODE: mode,
  })
  expect(response.status).toBe(200)
  expect(response.headers.has('Location')).toBe(false)
})

it('routes native mini requests before the SSR handler', async () => {
  const response = await worker.fetch(
    new Request('https://r.codeiy.com/api/wechat-mini/config'),
    config,
  )
  expect(await response.json()).toEqual({ mini: true })
})

it.each([
  '/',
  '/api/auth/callback/wechat',
  '/api/auth/callback/github',
  '/billing/alipay-return',
])(
  'temporarily forwards the old Folio URL %s without caching it',
  async (path) => {
    const response = await worker.fetch(
      new Request('https://www.codeiy.com' + path + '?x=a%2Bb'),
      config,
    )
    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe(
      'https://r.codeiy.com' + path + '?x=a%2Bb',
    )
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  },
)
