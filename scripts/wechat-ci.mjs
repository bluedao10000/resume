import fs from 'node:fs'
import path from 'node:path'
import { createHash, createPrivateKey } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { parseEnv } from 'node:util'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
process.chdir(root)
const env = {
  ...(fs.existsSync('.env') ? parseEnv(fs.readFileSync('.env', 'utf8')) : {}),
  ...process.env,
}
const output = path.join(root, 'artifacts/wechat')
const staged = path.join(output, 'project')
const manifestPath = path.join(output, 'release.json')
const action = process.argv[2]

function files(directory) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const file = path.join(directory, entry.name)
      if (entry.isSymbolicLink())
        throw new Error('Upload artifacts must not contain symlinks.')
      return entry.isDirectory() ? files(file) : [file]
    })
}
function fingerprint(directory) {
  const hash = createHash('sha256')
  for (const file of files(directory)) {
    hash.update(path.relative(directory, file))
    hash.update('\0')
    hash.update(fs.readFileSync(file))
    hash.update('\0')
  }
  return hash.digest('hex')
}
function writeManifest(manifest) {
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
}
function readProject(directory) {
  const config = JSON.parse(
    fs.readFileSync(path.join(directory, 'project.config.json'), 'utf8'),
  )
  if (
    !/^wx[a-f0-9]{16}$/.test(config.appid) ||
    config.appid !== env.WECHAT_MINI_APP_ID
  )
    throw new Error(
      'Project AppID must match WECHAT_MINI_APP_ID in .env; run wx:prepare after configuring it.',
    )
  if (config.compileType !== 'miniprogram')
    throw new Error('Expected a native Mini Program project.')
  const code = path.resolve(directory, config.miniprogramRoot)
  if (!code.startsWith(directory + path.sep))
    throw new Error('miniprogramRoot must be inside projectPath.')
  for (const name of ['app.json', 'app.js'])
    if (!fs.existsSync(path.join(code, name)))
      throw new Error('Missing build output: ' + name)
  return { config, code }
}
async function main() {
  if (!['prepare', 'preview', 'upload'].includes(action))
    throw new Error('Use prepare, preview or upload.')
  if (action === 'prepare') {
    const projectPath = path.join(root, 'wechat-mini')
    const { config, code } = readProject(projectPath)
    const commit = execFileSync('git', ['rev-parse', '--short=8', 'HEAD'], {
      encoding: 'utf8',
    }).trim()
    const dirty = !!execFileSync('git', ['status', '--porcelain'], {
      encoding: 'utf8',
    }).trim()
    // Never stage sources, .env, keys, node_modules or backend code.
    fs.rmSync(path.join(output, 'preview.jpg'), { force: true })
    fs.rmSync(staged, { recursive: true, force: true })
    fs.mkdirSync(staged, { recursive: true })
    for (const file of files(code))
      if (
        !/\.(js|json|wxml|wxss|wxs|png|jpg|jpeg|svg|webp|ttf|woff2?)$/i.test(
          file,
        )
      )
        throw new Error(
          'Unexpected upload file extension: ' + path.relative(code, file),
        )
    fs.cpSync(code, path.join(staged, 'dist'), { recursive: true })
    fs.writeFileSync(
      path.join(staged, 'project.config.json'),
      JSON.stringify({ ...config, miniprogramRoot: 'dist/' }, null, 2) + '\n',
    )
    const hash = fingerprint(staged)
    const date = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .format(new Date())
      .replace(/\D/g, '')
    const version = env.WECHAT_CI_VERSION || `${date}-${commit}`
    const desc =
      env.WECHAT_CI_DESC ||
      `Folio wechat ${commit}${dirty ? ' dirty' : ''} build ${hash.slice(0, 12)}`
    if (!version || version.length > 32 || !desc || desc.length > 200)
      throw new Error(
        'Version must be 1–32 characters; description 1–200 characters.',
      )
    const manifest = {
      appid: config.appid,
      version,
      desc,
      commit,
      dirty,
      sha256: hash,
      sourceSha256: fingerprint(code),
      createdAt: new Date().toISOString(),
      projectPath: staged,
      miniprogramRoot: 'dist/',
    }
    writeManifest(manifest)
    console.log(JSON.stringify(manifest, null, 2))
    return
  }
  if (!fs.existsSync(manifestPath))
    throw new Error('No prepared release. Run npm run wx:prepare first.')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const { config } = readProject(staged)
  const source = readProject(path.join(root, 'wechat-mini'))
  if (
    manifest.appid !== config.appid ||
    fingerprint(staged) !== manifest.sha256 ||
    fingerprint(source.code) !== manifest.sourceSha256
  )
    throw new Error(
      'Build changed since preparation. Run wx:prepare and preview again.',
    )
  if (
    (env.WECHAT_CI_VERSION && env.WECHAT_CI_VERSION !== manifest.version) ||
    (env.WECHAT_CI_DESC && env.WECHAT_CI_DESC !== manifest.desc)
  )
    throw new Error('Release metadata changed. Run wx:prepare again.')
  if (!env.WECHAT_CI_PRIVATE_KEY_PATH)
    throw new Error(
      'MISSING_UPLOAD_KEY: set WECHAT_CI_PRIVATE_KEY_PATH in .env (path to the code-upload private key, not AppSecret).',
    )
  const privateKeyPath = fs.realpathSync(
    path.resolve(env.WECHAT_CI_PRIVATE_KEY_PATH),
  )
  if (
    privateKeyPath.startsWith(staged + path.sep) ||
    privateKeyPath.startsWith(source.code + path.sep)
  )
    throw new Error('Private key must be outside upload artifacts.')
  if (privateKeyPath.startsWith(root)) {
    const relativeKey = path.relative(root, privateKeyPath)
    try {
      execFileSync('git', ['check-ignore', '--quiet', '--', relativeKey], {
        stdio: 'ignore',
      })
    } catch {
      throw new Error(
        'A key inside the repository must be Git-ignored; prefer a file outside the repository.',
      )
    }
    const tracked = execFileSync('git', ['ls-files', '--', relativeKey], {
      encoding: 'utf8',
    }).trim()
    if (tracked)
      throw new Error('Refusing to use a private key tracked by Git.')
  }
  createPrivateKey(fs.readFileSync(privateKeyPath)) // Check format without logging the key.
  const robot = Number(env.WECHAT_CI_ROBOT || 1)
  if (!Number.isInteger(robot) || robot < 1 || robot > 30)
    throw new Error('WECHAT_CI_ROBOT must be 1–30.')
  if (action === 'upload' && manifest.preview?.sha256 !== manifest.sha256)
    throw new Error(
      'This artifact has not been previewed successfully. Run npm run wx:preview first.',
    )
  const { default: ci } = await import('miniprogram-ci')
  const project = new ci.Project({
    appid: config.appid,
    type: 'miniProgram',
    projectPath: staged,
    privateKeyPath,
    ignores: ['node_modules/**/*'],
  })
  const options = {
    project,
    desc: manifest.desc,
    setting: { useProjectConfig: true },
    robot,
    threads: 2,
    onProgressUpdate: () => {},
  }
  console.log(
    `${action}: AppID=${manifest.appid} version=${manifest.version} sha256=${manifest.sha256}`,
  )
  // Remove stale success records before trying again; old QR codes are not evidence.
  delete manifest[action]
  writeManifest(manifest)
  let result
  if (action === 'preview') {
    const qr = path.join(output, 'preview.jpg')
    fs.rmSync(qr, { force: true })
    result = await ci.preview({
      ...options,
      pagePath: JSON.parse(
        fs.readFileSync(path.join(source.code, 'app.json'), 'utf8'),
      ).pages[0],
      qrcodeFormat: 'image',
      qrcodeOutputDest: qr,
    })
    if (!fs.existsSync(qr) || fs.statSync(qr).size === 0)
      throw new Error('Preview returned without a QR image.')
  } else result = await ci.upload({ ...options, version: manifest.version })
  if (
    result &&
    typeof result === 'object' &&
    result.errCode &&
    result.errCode !== 0
  )
    throw new Error(`WeChat returned errCode=${result.errCode}`)
  // Only store public completion metadata, never project options/private key material.
  manifest[action] = {
    sha256: manifest.sha256,
    completedAt: new Date().toISOString(),
    robot,
    ...(action === 'preview' ? { qr: path.join(output, 'preview.jpg') } : {}),
  }
  writeManifest(manifest)
  console.log(
    JSON.stringify(
      {
        action,
        success: true,
        appid: manifest.appid,
        version: manifest.version,
        sha256: manifest.sha256,
        ...manifest[action],
        ...(result?.subPackageInfo
          ? { subPackageInfo: result.subPackageInfo }
          : {}),
      },
      null,
      2,
    ),
  )
}
main().catch((error) => {
  const message = String(error?.message || error).replace(
    /-----BEGIN [\s\S]*?-----END [^-]+-----/g,
    '[REDACTED KEY]',
  )
  console.error(
    error?.errCode !== undefined
      ? `WeChat errCode=${error.errCode}: ${message}`
      : message,
  )
  process.exitCode = 1
})
