import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { configure, runtimeSecretKeys } from './configure.mjs'

const config = configure()
const action = process.argv[2]
const env = {
  ...process.env,
  ...(config.CLOUDFLARE_API_TOKEN && {
    CLOUDFLARE_API_TOKEN: config.CLOUDFLARE_API_TOKEN,
  }),
  ...(config.CLOUDFLARE_ACCOUNT_ID && {
    CLOUDFLARE_ACCOUNT_ID: config.CLOUDFLARE_ACCOUNT_ID,
  }),
}

function wrangler(args, input) {
  const result = spawnSync(
    process.execPath,
    ['node_modules/wrangler/bin/wrangler.js', ...args],
    { env, input, stdio: input ? ['pipe', 'inherit', 'inherit'] : 'inherit' },
  )
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

if (action === 'deploy') {
  if (
    config.CLOUDFLARE_D1_DATABASE_ID === '00000000-0000-0000-0000-000000000000'
  )
    throw new Error('Configure a real D1 database before deployment.')
  // Vite writes a preview-only dotenv file; it is never a deployment artifact.
  fs.rmSync('dist/server/.dev.vars', { force: true })
  // Synchronize only explicitly permitted runtime secrets, never CF credentials.
  const secrets = Object.fromEntries(
    runtimeSecretKeys(config).map((key) => [key, config[key]]),
  )
  wrangler(
    ['secret', 'bulk', '--config', 'dist/server/wrangler.json'],
    JSON.stringify(secrets),
  )
  wrangler(['deploy', '--config', 'dist/server/wrangler.json'])
} else if (action === 'migrate') {
  wrangler([
    'd1',
    'migrations',
    'apply',
    'DB',
    '--config',
    'wrangler.jsonc',
    process.argv.includes('--remote') ? '--remote' : '--local',
  ])
} else {
  throw new Error('Expected deploy or migrate.')
}
