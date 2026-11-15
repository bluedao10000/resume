import { AlipaySdk } from 'alipay-sdk'
import type { BillingEnv } from './billing'

import { alipayTransport } from './alipay-transport'
import { alipayConfigured } from './alipay-config'

export function alipaySdk(config: BillingEnv) {
  if (!alipayConfigured(config)) throw new Error('ALIPAY_NOT_CONFIGURED')
  const gateway =
    config.ALIPAY_MODE === 'sandbox'
      ? 'https://openapi-sandbox.dl.alipaydev.com/gateway.do'
      : 'https://openapi.alipay.com/gateway.do'
  return new AlipaySdk({
    appId: config.ALIPAY_APP_ID,
    privateKey: config.ALIPAY_PRIVATE_KEY,
    alipayPublicKey: config.ALIPAY_PUBLIC_KEY,
    gateway,
    proxyAgent: alipayTransport(gateway),
    keyType: 'PKCS1',
    signType: 'RSA2',
    camelcase: false,
  })
}
