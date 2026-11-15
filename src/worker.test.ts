import { expect, it, vi } from 'vitest'
import worker from './worker'

vi.mock('@tanstack/react-start/server-entry', () => ({
  default: { fetch: () => new Response('SSR') },
}))
vi.mock('./server/resume-session', () => ({ ResumeAgentSession: class {} }))
vi.mock('./server/alipay-orders', () => ({ reconcilePendingAlipay: vi.fn() }))

const config = {
  APP_MODE: 'live',
  APP_MARKET: 'cn',
  BETTER_AUTH_URL: 'https://www.codeiy.com',
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
      'https://www.codeiy.com/?utm_source=docs&x=a%2Bb',
    )
  },
)

it.each([
  ['https://www.codeiy.com/', 'GET', 'live'],
  ['https://www.codeiy.com/', 'HEAD', 'live'],
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
