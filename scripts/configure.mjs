import fs from 'node:fs'
import { parseEnv } from 'node:util'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'

export const secretKeys = [
  'BETTER_AUTH_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
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
  STRIPE_PLUS_PRICE_ID: z.string(),
  STRIPE_PRO_PRICE_ID: z.string(),
  STRIPE_PORTAL_CONFIGURATION_ID: z.string(),
  STRIPE_API_BASE_URL: z.url(),
  STRIPE_API_VERSION: z.string().min(1),
  STRIPE_TIMEOUT_MS: positiveInteger,
  STRIPE_SYNC_LOCK_MS: positiveInteger,
  STRIPE_WEBHOOK_TOLERANCE_SECONDS: positiveInteger,
  STRIPE_CHECKOUT_TTL_SECONDS: positiveInteger.refine(
    (value) => Number(value) >= 1800 && Number(value) <= 86400,
  ),
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
  APP_MODE: z.enum(['demo', 'live']),
  BETTER_AUTH_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
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
  CLOUDFLARE_COMPATIBILITY_DATE: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  CLOUDFLARE_D1_DATABASE_NAME: z.string().min(1),
  CLOUDFLARE_D1_DATABASE_ID: z.uuid(),
  CLOUDFLARE_CUSTOM_DOMAIN: z.string().optional(),
  CLOUDFLARE_OBSERVABILITY_ENABLED: z.enum(['true', 'false']),
})

export function parseConfiguration(values) {
  const parsed = schema.safeParse({
    ...values,
    CLOUDFLARE_ACCOUNT_ID: values.CLOUDFLARE_ACCOUNT_ID || undefined,
  })
  if (!parsed.success)
    throw new Error(
      `Invalid .env fields: ${[...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))].join(', ')}`,
    )
  const config = parsed.data
  if (Number(config.STRIPE_SYNC_LOCK_MS) < Number(config.STRIPE_TIMEOUT_MS) * 2)
    throw new Error('Stripe sync lease must exceed twice the request timeout.')
  if (
    Number(config.BILLING_MIN_OUTPUT_TOKENS) >
    Number(config.AI_MAX_OUTPUT_TOKENS)
  )
    throw new Error('Billing minimum output must fit the model output limit.')
  if (
    config.APP_MODE === 'live' &&
    (!config.AI_API_KEY ||
      !config.AI_MODEL ||
      !config.GOOGLE_CLIENT_ID ||
      !config.GOOGLE_CLIENT_SECRET)
  )
    throw new Error('Live mode requires model and Google OAuth configuration.')
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
      ],
    }),
    vars: {
      ...Object.fromEntries(
        Object.keys(importSchema).map((key) => [key, config[key]]),
      ),
      ...Object.fromEntries(
        Object.keys(billingSchema)
          .filter((key) => !secretKeys.includes(key))
          .map((key) => [key, config[key]]),
      ),
      APP_MODE: config.APP_MODE,
      BETTER_AUTH_URL: config.BETTER_AUTH_URL,
      AI_BASE_URL: config.AI_BASE_URL,
      AI_MODEL: config.AI_MODEL,
      AGENT_RUNTIME: config.AGENT_RUNTIME,
      AGENT_TIMEOUT_MS: config.AGENT_TIMEOUT_MS,
      AI_CONTEXT_WINDOW: config.AI_CONTEXT_WINDOW,
      AI_MAX_OUTPUT_TOKENS: config.AI_MAX_OUTPUT_TOKENS,
      AI_MODEL_REASONING: config.AI_MODEL_REASONING,
      AI_API: config.AI_API,
      AI_REASONING_EFFORT: config.AI_REASONING_EFFORT,
    },
    secrets: {
      required: secretKeys.filter((key) => config[key]),
    },
    observability: {
      enabled: config.CLOUDFLARE_OBSERVABILITY_ENABLED === 'true',
    },
  }
}

export function configure() {
  const config = loadConfiguration()
  for (const folder of ['cmaps', 'standard_fonts', 'wasm']) {
    fs.cpSync(`node_modules/pdfjs-dist/${folder}`, `public/pdfjs/${folder}`, {
      recursive: true,
    })
  }
  fs.copyFileSync('node_modules/pdfjs-dist/LICENSE', 'public/pdfjs/LICENSE')
  fs.writeFileSync(
    'wrangler.jsonc',
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
