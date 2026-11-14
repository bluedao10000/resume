import fs from 'node:fs'
import { parseEnv } from 'node:util'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'

export const secretKeys = [
  'BETTER_AUTH_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'AI_API_KEY',
]

const positiveInteger = z
  .string()
  .regex(/^[1-9]\d*$/)
  .refine((value) => Number.isSafeInteger(Number(value)))
const schema = z.object({
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
  if (
    config.APP_MODE === 'live' &&
    (!config.AI_API_KEY ||
      !config.AI_MODEL ||
      !config.GOOGLE_CLIENT_ID ||
      !config.GOOGLE_CLIENT_SECRET)
  )
    throw new Error('Live mode requires model and Google OAuth configuration.')
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
