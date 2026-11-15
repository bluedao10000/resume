import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseEnv } from 'node:util'
import { fileURLToPath } from 'node:url'
import {
  configure,
  parseConfiguration,
  runtimeSecretKeys,
} from './configure.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const sandboxUrl = new URL('../.alipay-sandbox.json', import.meta.url)
const info = fs.lstatSync(sandboxUrl)
if (!info.isFile() || info.mode & 0o077)
  throw new Error(
    'Expected a private .alipay-sandbox.json from the official Skill.',
  )
const sandbox = JSON.parse(fs.readFileSync(sandboxUrl, 'utf8'))
const app = sandbox.appIds?.[0]
if (!app?.appId || !app.appPrivatePkcsKey || !app.alipayPublicKey || !app.pid)
  throw new Error(
    'The official sandbox application configuration is incomplete.',
  )
process.chdir(root)

const source = parseEnv(
  fs.readFileSync(new URL('../.env', import.meta.url), 'utf8'),
)
const settings = {
  APP_MARKET: 'cn',
  APP_MODE: 'demo',
  AI_API_KEY: '',
  BETTER_AUTH_URL: 'http://localhost:5173',
  CLOUDFLARE_CUSTOM_DOMAIN: '',
  CLOUDFLARE_CUSTOM_DOMAIN_ALIAS: '',
  WECHAT_APP_ID: '',
  WECHAT_APP_SECRET: '',
  ALIPAY_MODE: 'sandbox',
  ALIPAY_APP_ID: app.appId,
  ALIPAY_PRIVATE_KEY: app.appPrivatePkcsKey,
  ALIPAY_PUBLIC_KEY: app.alipayPublicKey,
  ALIPAY_SELLER_ID: app.pid,
  ALIPAY_NOTIFY_URL: '',
  ALIPAY_OPERATOR_USER_ID: '',
}
for (const key of Object.keys(source)) {
  if (key.startsWith('WECHAT_PAY_') && !key.endsWith('_FEN')) settings[key] = ''
}
const config = parseConfiguration({ ...source, ...settings })
const sandboxConfig = 'wrangler.alipay-sandbox.jsonc'
const persistence = '.wrangler/alipay-sandbox'
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'folio-alipay-'))
const envPath = path.join(temporary, 'sandbox.env')
const wrangler = 'node_modules/wrangler/bin/wrangler.js'
const run = (script, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      stdio: 'inherit',
      env: {
        ...process.env,
        CLOUDFLARE_VITE_WRANGLER_CONFIG_PATH: sandboxConfig,
      },
    })
    const stop = (signal) => child.kill(signal)
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, stop)
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      for (const name of ['SIGINT', 'SIGTERM']) process.off(name, stop)
      resolve(signal ? 130 : code)
    })
  })

try {
  configure(config, sandboxConfig)
  fs.writeFileSync(
    envPath,
    runtimeSecretKeys(config)
      .map((key) => `${key}='${config[key]}'`)
      .join('\n'),
    { mode: 0o600 },
  )
  process.exitCode = await run(wrangler, [
    'd1',
    'migrations',
    'apply',
    'DB',
    '--local',
    '--config',
    sandboxConfig,
    '--persist-to',
    persistence,
  ])
  if (process.exitCode === 0)
    process.exitCode = await run('node_modules/vite/bin/vite.js', ['build'])
  if (process.exitCode === 0)
    process.exitCode = await run(wrangler, [
      'dev',
      '--local',
      '--config',
      'dist/server/wrangler.json',
      '--env-file',
      envPath,
      '--ip',
      'localhost',
      '--port',
      '5173',
      '--persist-to',
      persistence,
    ])
} finally {
  fs.rmSync(temporary, { recursive: true, force: true })
  fs.rmSync(sandboxConfig, { force: true })
}
