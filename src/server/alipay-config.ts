export function alipayConfigured(config: Record<string, string>) {
  return (
    config.APP_MARKET === 'cn' &&
    (config.ALIPAY_MODE === 'sandbox' || config.ALIPAY_MODE === 'production') &&
    !!(
      config.ALIPAY_APP_ID &&
      config.ALIPAY_PRIVATE_KEY &&
      config.ALIPAY_PUBLIC_KEY &&
      config.ALIPAY_SELLER_ID
    )
  )
}
