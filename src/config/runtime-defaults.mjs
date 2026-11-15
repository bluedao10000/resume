const common = {
  AI_BASE_URL: 'https://api.openai.com/v1',
  AGENT_RUNTIME: 'pi-durable',
  AGENT_TIMEOUT_MS: '45000',
  AI_CONTEXT_WINDOW: '128000',
  AI_MAX_OUTPUT_TOKENS: '12000',
  AI_MODEL_REASONING: 'true',
  AI_API: 'openai-responses',
  AI_REASONING_EFFORT: 'low',
  BILLING_FREE_MONTHLY_CENTS: '0',
  BILLING_PLUS_MONTHLY_CENTS: '1000',
  BILLING_PRO_MONTHLY_CENTS: '5000',
  BILLING_FREE_CREDITS: '10',
  BILLING_PLUS_CREDITS: '125',
  BILLING_PRO_CREDITS: '625',
  BILLING_MODEL: 'gpt-6.1-sol',
  BILLING_TARIFF_VERSION: '2026-11-14-standard-v1',
  BILLING_INPUT_CREDITS_PER_MILLION: '50',
  BILLING_OUTPUT_CREDITS_PER_MILLION: '250',
  BILLING_CACHE_READ_CREDITS_PER_MILLION: '2.5',
  BILLING_CACHE_WRITE_CREDITS_PER_MILLION: '62.5',
  BILLING_INPUT_RESERVE_MULTIPLIER: '2',
  BILLING_MIN_OUTPUT_TOKENS: '1024',
  BILLING_MAX_CONCURRENT_RUNS: '2',
  STRIPE_API_BASE_URL: 'https://api.stripe.com/v1',
  STRIPE_API_VERSION: '2025-03-31.basil',
  STRIPE_TIMEOUT_MS: '10000',
  STRIPE_WEBHOOK_TOLERANCE_SECONDS: '300',
  STRIPE_CHECKOUT_TTL_SECONDS: '1800',
  STRIPE_SYNC_LOCK_MS: '30000',
  IMPORT_MAX_FILE_BYTES: '10485760',
  IMPORT_MAX_PDF_PAGES: '30',
  IMPORT_MAX_TEXT_CHARACTERS: '20000',
  IMPORT_TIMEOUT_MS: '20000',
  IMPORT_MAX_EXPANDED_BYTES: '52428800',
  WECHAT_PAY_PLUS_FEN: '2000',
  WECHAT_PAY_PRO_FEN: '9900',
}

// Folio's existing conversion is 25 credits per USD. Use the published
// peak rates for a fixed allowance tariff across all hours.
/** @param {unknown} market */
export function runtimeDefaults(market) {
  if (market !== 'cn') return common
  return {
    ...common,
    AI_BASE_URL: 'https://api.deepseek.com',
    AI_MODEL: 'deepseek-flash',
    AI_REASONING_EFFORT: 'off',
    BILLING_MODEL: 'deepseek-flash',
    BILLING_TARIFF_VERSION: 'deepseek-flash-peak-v1',
    BILLING_INPUT_CREDITS_PER_MILLION: '7.5',
    BILLING_OUTPUT_CREDITS_PER_MILLION: '30',
    BILLING_CACHE_READ_CREDITS_PER_MILLION: '0.15',
    BILLING_CACHE_WRITE_CREDITS_PER_MILLION: '7.5',
  }
}

/** @template {object} T @param {T} bindings */
export function runtimeConfig(bindings) {
  return {
    ...runtimeDefaults(Reflect.get(bindings, 'APP_MARKET')),
    ...bindings,
  }
}
