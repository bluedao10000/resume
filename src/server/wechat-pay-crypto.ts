import { z } from 'zod'

const encoder = new TextEncoder()
const rsa = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }
function der(pem: string) {
  return bytes(pem.replace(/-----[^-]+-----|\s/g, ''))
}
function bytes(base64: string) {
  return Uint8Array.from(atob(base64), (byte) => byte.charCodeAt(0))
}
export async function verifyWechatSignature(
  config: Record<string, string>,
  headers: Headers,
  body: string,
  now = Date.now(),
) {
  const serial = headers.get('wechatpay-serial')
  const timestamp = headers.get('wechatpay-timestamp') ?? ''
  const nonce = headers.get('wechatpay-nonce')
  const signature = headers.get('wechatpay-signature')
  if (
    !serial ||
    serial !== config.WECHAT_PAY_PUBLIC_KEY_ID ||
    !/^\d{10}$/.test(timestamp) ||
    Math.abs(now - Number(timestamp) * 1000) > 300000 ||
    !nonce ||
    !signature
  )
    return false
  try {
    const key = await crypto.subtle.importKey(
      'spki',
      der(config.WECHAT_PAY_PUBLIC_KEY),
      rsa,
      false,
      ['verify'],
    )
    return await crypto.subtle.verify(
      rsa,
      key,
      bytes(signature),
      encoder.encode(`${timestamp}\n${nonce}\n${body}\n`),
    )
  } catch {
    return false
  }
}
export async function wechatPayRequest(
  config: Record<string, string>,
  method: 'GET' | 'POST',
  path: string,
  data?: object,
) {
  const body = data ? JSON.stringify(data) : ''
  const timestamp = Math.floor(Date.now() / 1000)
  const nonce = crypto.randomUUID()
  const key = await crypto.subtle.importKey(
    'pkcs8',
    der(config.WECHAT_PAY_PRIVATE_KEY),
    rsa,
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    rsa,
    key,
    encoder.encode(`${method}\n${path}\n${timestamp}\n${nonce}\n${body}\n`),
  )
  const authorization = `WECHATPAY2-SHA256-RSA2048 mchid="${config.WECHAT_PAY_MCH_ID}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${config.WECHAT_PAY_MERCHANT_SERIAL}",signature="${btoa(String.fromCharCode(...new Uint8Array(signature)))}"`
  const response = await fetch(`https://api.mch.weixin.qq.com${path}`, {
    method,
    body: data ? body : undefined,
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
    headers: {
      Authorization: authorization,
      'Wechatpay-Serial': config.WECHAT_PAY_PUBLIC_KEY_ID,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'Folio-WeChatPay/1.0',
    },
  })
  const raw = await response.text()
  // The official SDK validates successful API responses. Error responses
  // can lack signatures and must never be used as evidence of payment.
  if (
    response.ok &&
    !(await verifyWechatSignature(config, response.headers, raw))
  )
    throw new Error('WECHAT_RESPONSE_SIGNATURE_INVALID')
  return {
    status: response.status,
    data: raw ? (JSON.parse(raw) as unknown) : null,
  }
}
const notification = z.object({
  event_type: z.literal('TRANSACTION.SUCCESS'),
  resource_type: z.literal('encrypt-resource'),
  resource: z.object({
    original_type: z.literal('transaction'),
    algorithm: z.literal('AEAD_AES_256_GCM'),
    nonce: z.string(),
    associated_data: z.string().default(''),
    ciphertext: z.string(),
  }),
})
export async function decryptWechatNotification(
  config: Record<string, string>,
  raw: string,
) {
  const { resource } = notification.parse(JSON.parse(raw))
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(config.WECHAT_PAY_API_V3_KEY),
    'AES-GCM',
    false,
    ['decrypt'],
  )
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: encoder.encode(resource.nonce),
      additionalData: encoder.encode(resource.associated_data),
    },
    key,
    bytes(resource.ciphertext),
  )
  return JSON.parse(new TextDecoder().decode(plaintext)) as unknown
}
