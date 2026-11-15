import { Buffer } from 'node:buffer'
import type { ProxyAgent } from 'alipay-sdk'

type Dispatch = ProxyAgent['dispatch']

// alipay-sdk's urllib transport needs Node TLS options that Workers do not
// implement. Route the SDK's pre-signed request through the Worker fetch API.
export function alipayTransport(gateway: string): ProxyAgent {
  const allowed = new URL(gateway)
  const dispatch: Dispatch = (request, handler) => {
    const controller = new AbortController()
    handler.onConnect?.((reason) => controller.abort(reason))
    void (async () => {
      try {
        const url = new URL(request.path, request.origin)
        if (
          url.origin !== allowed.origin ||
          url.pathname !== allowed.pathname ||
          request.method !== 'POST'
        )
          throw new Error('Unexpected Alipay SDK destination')
        const body = request.body
        if (
          typeof body !== 'string' &&
          !(body instanceof Uint8Array) &&
          body != null
        )
          throw new Error('Unexpected Alipay SDK body')
        const headers = new Headers(request.headers as HeadersInit)
        const response = await fetch(url, {
          method: request.method,
          headers,
          body: body instanceof Uint8Array ? new Uint8Array(body) : body,
          redirect: 'manual',
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(5000),
          ]),
        })
        if (response.status >= 300 && response.status < 400)
          throw new Error('Unexpected Alipay redirect')
        const bytes = Buffer.from(await response.arrayBuffer())
        const rawHeaders: Buffer[] = []
        response.headers.forEach((value, name) => {
          // Fetch returns the decoded body. urllib must not decompress again.
          if (name !== 'content-encoding' && name !== 'content-length')
            rawHeaders.push(Buffer.from(name), Buffer.from(value))
        })
        rawHeaders.push(
          Buffer.from('content-length'),
          Buffer.from(String(bytes.length)),
        )
        handler.onHeaders?.(
          response.status,
          rawHeaders,
          () => {},
          response.statusText,
        )
        if (bytes.length) handler.onData?.(bytes)
        handler.onComplete?.([])
      } catch (error) {
        handler.onError?.(
          error instanceof Error ? error : new Error('Alipay transport failed'),
        )
      }
    })()
    return true
  }
  // The SDK passes this object as an Undici dispatcher and calls dispatch only.
  return { dispatch } as ProxyAgent
}
