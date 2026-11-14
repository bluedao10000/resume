import assert from 'node:assert/strict'
import fs from 'node:fs'
import { parseEnv } from 'node:util'
import { test } from 'node:test'
import { parseConfiguration, workerConfiguration } from './configure.mjs'

const example = parseEnv(fs.readFileSync('.env.example', 'utf8'))

test('generated configuration excludes credentials and declares allowed secrets', () => {
  const config = parseConfiguration({
    ...example,
    AI_API_KEY: 'model-secret-fixture',
    CLOUDFLARE_API_TOKEN: 'cf-secret-fixture',
    GOOGLE_CLIENT_SECRET: 'google-secret-fixture',
    WECHAT_APP_SECRET: 'wechat-login-secret-fixture',
    STRIPE_SECRET_KEY: 'stripe-secret-fixture',
    STRIPE_WEBHOOK_SECRET: 'webhook-secret-fixture',
  })
  const worker = workerConfiguration(config)
  const serialized = JSON.stringify(worker)
  for (const key of [
    'AI_API_KEY',
    'BETTER_AUTH_SECRET',
    'GOOGLE_CLIENT_SECRET',
    'WECHAT_APP_SECRET',
    'CLOUDFLARE_API_TOKEN',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
  ])
    assert.ok(!serialized.includes(config[key]))
  assert.ok(worker.secrets.required.includes('AI_API_KEY'))
  assert.ok(worker.secrets.required.includes('WECHAT_APP_SECRET'))
  assert.ok(!worker.secrets.required.includes('STRIPE_SECRET_KEY'))
  assert.ok(!worker.secrets.required.includes('CLOUDFLARE_API_TOKEN'))
  assert.equal(worker.main, './src/worker.ts')
  assert.deepEqual(worker.durable_objects.bindings, [
    { name: 'RESUME_AGENT', class_name: 'ResumeAgentSession' },
  ])
  assert.deepEqual(worker.migrations[0].new_sqlite_classes, [
    'ResumeAgentSession',
  ])
})

test('Agent runtime, protocol and positive limits are validated before deployment', () => {
  for (const override of [
    { AGENT_RUNTIME: 'unknown' },
    { AI_API: 'invalid' },
    { AGENT_TIMEOUT_MS: '0' },
    { AI_MAX_OUTPUT_TOKENS: '-1' },
    { AI_CONTEXT_WINDOW: 'NaN' },
    { AI_REASONING_EFFORT: 'none' },
    { BILLING_FREE_CREDITS: '-1' },
    { BILLING_INPUT_CREDITS_PER_MILLION: 'NaN' },
    { BILLING_PLUS_MONTHLY_CENTS: '999' },
    { IMPORT_MAX_FILE_BYTES: '0' },
    { IMPORT_MAX_PDF_PAGES: '-1' },
    { IMPORT_MAX_TEXT_CHARACTERS: '20001' },
    { IMPORT_TIMEOUT_MS: 'NaN' },
    { IMPORT_MAX_EXPANDED_BYTES: '0' },
  ])
    assert.throws(
      () => parseConfiguration({ ...example, ...override }),
      /Invalid .env fields/,
    )
  assert.throws(
    () => parseConfiguration({ ...example, STRIPE_SYNC_LOCK_MS: '1' }),
    /sync lease/,
  )
})

test('live mode fails without model and authentication configuration', () => {
  assert.throws(
    () => parseConfiguration({ ...example, APP_MODE: 'live' }),
    /Live mode requires/,
  )
})

test('OAuth origin must agree with the configured custom domain', () => {
  assert.throws(
    () =>
      parseConfiguration({
        ...example,
        CLOUDFLARE_CUSTOM_DOMAIN: 'resume.example.com',
      }),
    /must match/,
  )
})
