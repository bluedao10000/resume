import fs from 'node:fs'
import { parseEnv } from 'node:util'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import { runtimeDefaults } from '../src/config/runtime-defaults.mjs'

export const secretKeys = [
  'BETTER_AUTH_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GITHUB_CLIENT_SECRET',
  'AUTH_RESEND_API_KEY',
  'ALIPAY_PRIVATE_KEY',
  'WECHAT_APP_SECRET',
  'WECHAT_MINI_APP_SECRET',
  'WECHAT_PAY_PRIVATE_KEY',
  'WECHAT_PAY_API_V3_KEY',
  'AI_API_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
]

const positiveInteger = z
  .string()
  .regex(/^[1-9]\d*$/)
  .refine((value) => Number.isSafeInteger(Number(value)))
const credits = z
  .string()
  .regex(/^\d+(\.\d{1,6})?$/)
  .refine((value) => Number.isSafeInteger(Number(value) * 1000000))
const billingSchema = {
  BILLING_FREE_MONTHLY_CENTS: z.literal('0'),
  BILLING_PLUS_MONTHLY_CENTS: z.literal('1000'),
  BILLING_PRO_MONTHLY_CENTS: z.literal('5000'),
  BILLING_FREE_CREDITS: credits,
  BILLING_PLUS_CREDITS: credits,
  BILLING_PRO_CREDITS: credits,
  BILLING_MODEL: z.string().min(1),
  BILLING_TARIFF_VERSION: z.string().min(1),
  BILLING_INPUT_CREDITS_PER_MILLION: credits,
  BILLING_OUTPUT_CREDITS_PER_MILLION: credits.refine(
    (value) => Number(value) > 0,
  ),
  BILLING_CACHE_READ_CREDITS_PER_MILLION: credits,
  BILLING_CACHE_WRITE_CREDITS_PER_MILLION: credits,
  BILLING_INPUT_RESERVE_MULTIPLIER: positiveInteger.refine(
    (value) => Number(value) >= 2,
  ),
  BILLING_MIN_OUTPUT_TOKENS: positiveInteger,
  BILLING_MAX_CONCURRENT_RUNS: positiveInteger,
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PLUS_PRICE_ID: z.string().optional(),
  STRIPE_PRO_PRICE_ID: z.string().optional(),
  STRIPE_PORTAL_CONFIGURATION_ID: z.string().optional(),
  STRIPE_API_BASE_URL: z.url(),
  STRIPE_API_VERSION: z.string().min(1),
  STRIPE_TIMEOUT_MS: positiveInteger,
  STRIPE_SYNC_LOCK_MS: positiveInteger,
  STRIPE_WEBHOOK_TOLERANCE_SECONDS: positiveInteger,
  STRIPE_CHECKOUT_TTL_SECONDS: positiveInteger.refine(
    (value) => Number(value) >= 1800 && Number(value) <= 86400,
  ),
}
const wechatSchema = {
  WECHAT_MINI_APP_ID: z.string().optional(),
  WECHAT_MINI_APP_SECRET: z.string().optional(),
  WECHAT_APP_ID: z.string().optional(),
  WECHAT_APP_SECRET: z.string().optional(),
  WECHAT_PAY_APP_ID: z.string().optional(),
  WECHAT_PAY_MCH_ID: z.string().regex(/^\d+$/).or(z.literal('')).optional(),
  WECHAT_PAY_MERCHANT_SERIAL: z
    .string()
    .regex(/^[a-fA-F0-9]+$/)
    .or(z.literal(''))
    .optional(),
  WECHAT_PAY_PRIVATE_KEY: z.string().optional(),
  WECHAT_PAY_API_V3_KEY: z
    .string()
    .regex(/^[\x21-\x7e]{32}$/)
    .or(z.literal(''))
    .optional(),
  WECHAT_PAY_PUBLIC_KEY_ID: z
    .string()
    .regex(/^PUB_KEY_ID_\d+$/)
    .or(z.literal(''))
    .optional(),
  WECHAT_PAY_PUBLIC_KEY: z.string().optional(),
  WECHAT_PAY_PLUS_FEN: positiveInteger.optional(),
  WECHAT_PAY_PRO_FEN: positiveInteger.optional(),
}
const importSchema = {
  IMPORT_MAX_FILE_BYTES: positiveInteger,
  IMPORT_MAX_PDF_PAGES: positiveInteger,
  IMPORT_MAX_TEXT_CHARACTERS: positiveInteger.refine(
    (value) => Number(value) <= 20000,
  ),
  IMPORT_TIMEOUT_MS: positiveInteger,
  IMPORT_MAX_EXPANDED_BYTES: positiveInteger,
}
const schema = z.object({
  ...billingSchema,
  ...importSchema,
  ...wechatSchema,
  APP_MARKET: z.enum(['global', 'cn']).default('global'),
  APP_MODE: z.enum(['demo', 'live']).default('demo'),
  BETTER_AUTH_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  AUTH_RESEND_API_KEY: z.string().optional(),
  AUTH_EMAIL_FROM: z.string().optional(),
  ALIPAY_MODE: z.enum(['off', 'sandbox', 'production']).default('off'),
  ALIPAY_APP_ID: z.string().optional(),
  ALIPAY_PRIVATE_KEY: z.string().optional(),
  ALIPAY_PUBLIC_KEY: z.string().optional(),
  ALIPAY_SELLER_ID: z.string().optional(),
  ALIPAY_NOTIFY_URL: z.url().or(z.literal('')).optional(),
  ALIPAY_OPERATOR_USER_ID: z.string().optional(),
  AI_BASE_URL: z.url(),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string(),
  AGENT_RUNTIME: z.enum(['pi-ai', 'pi-durable']),
  AGENT_TIMEOUT_MS: positiveInteger,
  AI_CONTEXT_WINDOW: positiveInteger,
  AI_MAX_OUTPUT_TOKENS: positiveInteger,
  AI_MODEL_REASONING: z.enum(['true', 'false']),
  AI_API: z.enum(['openai-completions', 'openai-responses']),
  AI_REASONING_EFFORT: z.enum([
    'off',
    'minimal',
    'low',
    'medium',
    'high',
    'xhigh',
    'max',
  ]),
  CLOUDFLARE_API_TOKEN: z.string().optional(),
  CLOUDFLARE_ACCOUNT_ID: z
    .string()
    .regex(/^[a-f0-9]{32}$/)
    .optional(),
  CLOUDFLARE_WORKER_NAME: z.string().regex(/^[a-z0-9-]+$/),
  CLOUDFLARE_COMPATIBILITY_DATE: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .default('2026-11-14'),
  CLOUDFLARE_D1_DATABASE_NAME: z.string().min(1),
  CLOUDFLARE_D1_DATABASE_ID: z.uuid(),
  CLOUDFLARE_CUSTOM_DOMAIN: z.string().optional(),
  CLOUDFLARE_CUSTOM_DOMAIN_ALIAS: z.hostname().or(z.literal('')).optional(),
  CLOUDFLARE_OBSERVABILITY_ENABLED: z.enum(['true', 'false']).default('true'),
  CLOUDFLARE_ANALYTICS_ENABLED: z.enum(['true', 'false']).default('true'),
  CLOUDFLARE_ANALYTICS_DATASET: z
    .string()
    .regex(/^[a-z0-9_]{1,32}$/)
    .default('folio_events'),
})

export function parseConfiguration(values) {
  const parsed = schema.safeParse({
    ...runtimeDefaults(values.APP_MARKET),
    ...values,
    CLOUDFLARE_ACCOUNT_ID: values.CLOUDFLARE_ACCOUNT_ID || undefined,
  })
  if (!parsed.success)
    throw new Error(
      `Invalid .env fields: ${[...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))].join(', ')}`,
    )
  const config = parsed.data
  if (
    config.ALIPAY_MODE !== 'off' &&
    (config.APP_MARKET !== 'cn' ||
      !config.ALIPAY_APP_ID ||
      !config.ALIPAY_PRIVATE_KEY ||
      !config.ALIPAY_PUBLIC_KEY ||
      !config.ALIPAY_SELLER_ID)
  )
    throw new Error(
      'Alipay requires CN mode and a complete application configuration.',
    )
  if (
    config.ALIPAY_MODE === 'production' &&
    (new URL(config.BETTER_AUTH_URL).protocol !== 'https:' ||
      (config.ALIPAY_NOTIFY_URL &&
        new URL(config.ALIPAY_NOTIFY_URL).protocol !== 'https:'))
  )
    throw new Error(
      'Production Alipay requires an HTTPS return address and HTTPS if notifications are configured.',
    )
  if (config.APP_MARKET === 'cn') {
    const paymentKeys = Object.keys(wechatSchema).filter(
      (key) => key.startsWith('WECHAT_PAY_') && !key.endsWith('_FEN'),
    )
    if (!config.WECHAT_PAY_PLUS_FEN || !config.WECHAT_PAY_PRO_FEN)
      throw new Error('CN mode requires CNY plan prices.')
    if (
      paymentKeys.some((key) => config[key]) &&
      (paymentKeys.some((key) => !config[key]) ||
        new URL(config.BETTER_AUTH_URL).protocol !== 'https:')
    )
      throw new Error(
        'WeChat Pay requires all merchant fields and an HTTPS origin.',
      )
  }
  if (Number(config.STRIPE_SYNC_LOCK_MS) < Number(config.STRIPE_TIMEOUT_MS) * 2)
    throw new Error('Stripe sync lease must exceed twice the request timeout.')
  if (
    Number(config.BILLING_MIN_OUTPUT_TOKENS) >
    Number(config.AI_MAX_OUTPUT_TOKENS)
  )
    throw new Error('Billing minimum output must fit the model output limit.')
  if (!!config.GITHUB_CLIENT_ID !== !!config.GITHUB_CLIENT_SECRET)
    throw new Error('GitHub login requires both OAuth credentials.')
  if (!!config.AUTH_EMAIL_FROM !== !!config.AUTH_RESEND_API_KEY)
    throw new Error('Email login requires a sender and a Resend API key.')
  if (config.WECHAT_MINI_APP_SECRET && !config.WECHAT_MINI_APP_ID)
    throw new Error('Mini Program login requires both credentials.')
  const wechatLogin =
    config.APP_MARKET === 'cn' &&
    config.WECHAT_APP_ID &&
    config.WECHAT_APP_SECRET
  const googleLogin =
    config.APP_MARKET === 'global' &&
    config.GOOGLE_CLIENT_ID &&
    config.GOOGLE_CLIENT_SECRET
  if (
    (wechatLogin ||
      (config.WECHAT_MINI_APP_ID && config.WECHAT_MINI_APP_SECRET)) &&
    config.APP_MODE === 'live' &&
    new URL(config.BETTER_AUTH_URL).protocol !== 'https:'
  )
    throw new Error('Live WeChat login requires an HTTPS origin.')
  if (
    config.APP_MODE === 'live' &&
    (!config.AI_API_KEY ||
      !config.AI_MODEL ||
      !(
        wechatLogin ||
        (config.APP_MARKET === 'cn' &&
          config.WECHAT_MINI_APP_ID &&
          config.WECHAT_MINI_APP_SECRET) ||
        googleLogin ||
        config.GITHUB_CLIENT_ID ||
        config.AUTH_EMAIL_FROM
      ))
  )
    throw new Error(
      'Live mode requires model configuration and a login method.',
    )
  if (config.APP_MODE === 'live' && config.BILLING_MODEL !== config.AI_MODEL)
    throw new Error(
      'BILLING_MODEL must match AI_MODEL; verify the tariff before changing models.',
    )
  if (
    config.CLOUDFLARE_CUSTOM_DOMAIN &&
    new URL(config.BETTER_AUTH_URL).origin !==
      `https://${config.CLOUDFLARE_CUSTOM_DOMAIN}`
  )
    throw new Error('BETTER_AUTH_URL must match the HTTPS custom domain.')
  return config
}

export function loadConfiguration() {
  const conflicts = fs
    .readdirSync('.')
    .filter(
      (name) =>
        name.startsWith('.dev.vars') ||
        (name.startsWith('.env.') && name !== '.env.example'),
    )
  if (conflicts.length)
    throw new Error(`Use only .env; conflicting files: ${conflicts.join(', ')}`)
  return parseConfiguration(parseEnv(fs.readFileSync('.env', 'utf8')))
}

export function runtimeSecretKeys(config) {
  return secretKeys.filter(
    (key) =>
      config[key] &&
      (config.APP_MARKET === 'cn'
        ? !key.startsWith('GOOGLE_') && !key.startsWith('STRIPE_')
        : !key.startsWith('WECHAT_')),
  )
}

export function workerConfiguration(config) {
  return {
    $schema: 'node_modules/wrangler/config-schema.json',
    name: config.CLOUDFLARE_WORKER_NAME,
    ...(config.CLOUDFLARE_ACCOUNT_ID && {
      account_id: config.CLOUDFLARE_ACCOUNT_ID,
    }),
    main: './src/worker.ts',
    compatibility_date: config.CLOUDFLARE_COMPATIBILITY_DATE,
    compatibility_flags: ['nodejs_compat'],
    workers_dev: false,
    preview_urls: false,
    assets: { binding: 'ASSETS', directory: './dist/client' },
    ...(config.CLOUDFLARE_ANALYTICS_ENABLED === 'true' && {
      analytics_engine_datasets: [
        { binding: 'ANALYTICS', dataset: config.CLOUDFLARE_ANALYTICS_DATASET },
      ],
    }),
    d1_databases: [
      {
        binding: 'DB',
        database_name: config.CLOUDFLARE_D1_DATABASE_NAME,
        database_id: config.CLOUDFLARE_D1_DATABASE_ID,
        migrations_dir: 'migrations',
      },
    ],
    durable_objects: {
      bindings: [{ name: 'RESUME_AGENT', class_name: 'ResumeAgentSession' }],
    },
    migrations: [
      { tag: 'resume-agent-v1', new_sqlite_classes: ['ResumeAgentSession'] },
    ],
    ...(config.CLOUDFLARE_CUSTOM_DOMAIN && {
      routes: [
        { pattern: config.CLOUDFLARE_CUSTOM_DOMAIN, custom_domain: true },
        ...(config.CLOUDFLARE_CUSTOM_DOMAIN_ALIAS
          ? [
              {
                pattern: config.CLOUDFLARE_CUSTOM_DOMAIN_ALIAS,
                custom_domain: true,
              },
            ]
          : []),
      ],
    }),
    ...(config.ALIPAY_MODE !== 'off' && {
      triggers: { crons: ['* * * * *'] },
    }),
    keep_vars: false,
    vars: Object.fromEntries(
      Object.entries(config).filter(
        ([key, value]) =>
          value &&
          !key.startsWith('CLOUDFLARE_') &&
          !secretKeys.includes(key) &&
          value !== runtimeDefaults(config.APP_MARKET)[key] &&
          (config.APP_MARKET === 'cn'
            ? !key.startsWith('STRIPE_')
            : !key.startsWith('WECHAT_')),
      ),
    ),
    secrets: {
      required: runtimeSecretKeys(config),
    },
    observability: {
      enabled: config.CLOUDFLARE_OBSERVABILITY_ENABLED === 'true',
    },
  }
}

export function configure(
  config = loadConfiguration(),
  output = 'wrangler.jsonc',
) {
  for (const folder of ['cmaps', 'standard_fonts', 'wasm']) {
    fs.cpSync(`node_modules/pdfjs-dist/${folder}`, `public/pdfjs/${folder}`, {
      recursive: true,
    })
  }
  fs.copyFileSync('node_modules/pdfjs-dist/LICENSE', 'public/pdfjs/LICENSE')
  fs.writeFileSync(
    output,
    '// Generated from .env by scripts/configure.mjs. Do not edit.\n' +
      JSON.stringify(workerConfiguration(config), null, 2) +
      '\n',
  )
  return config
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  configure()
  console.log('Generated Wrangler configuration from .env (secrets excluded).')
}
