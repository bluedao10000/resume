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
  })
  const worker = workerConfiguration(config)
  const serialized = JSON.stringify(worker)
  for (const key of [
    'AI_API_KEY',
    'BETTER_AUTH_SECRET',
    'GOOGLE_CLIENT_SECRET',
    'CLOUDFLARE_API_TOKEN',
  ])
    assert.ok(!serialized.includes(config[key]))
  assert.ok(worker.secrets.required.includes('AI_API_KEY'))
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
  ])
    assert.throws(
      () => parseConfiguration({ ...example, ...override }),
      /Invalid .env fields/,
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
