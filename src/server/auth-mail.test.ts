import { expect, it, vi } from 'vitest'
import { sendLoginCode } from './auth-mail'

it('puts the six-digit code on a line by itself and preserves leading zeros', async () => {
  const send = vi.fn(async (_url: string, _init: RequestInit) =>
    Response.json({ id: 'fixture' }),
  )
  vi.stubGlobal('fetch', send)
  try {
    await sendLoginCode({
      apiKey: 'fixture',
      from: 'Folio <login@example.com>',
      email: 'fixture@example.com',
      otp: '012345',
    })
    const envelope = JSON.parse(String(send.mock.calls[0][1].body))
    expect(
      envelope.text
        .split('\n')
        .filter((line: string) => line.includes('012345')),
    ).toEqual(['012345'])
  } finally {
    vi.unstubAllGlobals()
  }
})
