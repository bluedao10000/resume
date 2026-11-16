import { build } from 'esbuild'
import fs from 'node:fs'
import { parseEnv } from 'node:util'
const env = fs.existsSync('.env')
  ? parseEnv(fs.readFileSync('.env', 'utf8'))
  : {}
const base = env.BETTER_AUTH_URL || 'https://www.codeiy.com'
if (
  new URL(base).protocol !== 'https:' &&
  new URL(base).hostname !== 'localhost'
)
  throw new Error('Mini Program API requires HTTPS')
fs.mkdirSync('wechat-mini/dist', { recursive: true })
for (const file of [
  'app.json',
  'sitemap.json',
  'app.wxss',
  'pages/workspace/index.wxml',
  'pages/workspace/index.wxss',
  'pages/workspace/index.json',
]) {
  fs.mkdirSync('wechat-mini/dist/' + file.split('/').slice(0, -1).join('/'), {
    recursive: true,
  })
  fs.copyFileSync('wechat-mini/src/' + file, 'wechat-mini/dist/' + file)
}
fs.cpSync('wechat-mini/src/assets', 'wechat-mini/dist/assets', {
  recursive: true,
})
await build({
  entryPoints: [
    'wechat-mini/src/app.ts',
    'wechat-mini/src/pages/workspace/index.ts',
  ],
  outbase: 'wechat-mini/src',
  outdir: 'wechat-mini/dist',
  bundle: true,
  platform: 'neutral',
  mainFields: ['module', 'main'],
  conditions: ['module'],
  format: 'cjs',
  target: 'es2020',
  minify: true,
  define: { __MINI_API_BASE__: JSON.stringify(new URL(base).origin) },
})
fs.writeFileSync(
  'wechat-mini/project.config.json',
  JSON.stringify(
    {
      appid: env.WECHAT_MINI_APP_ID || 'touristappid',
      projectname: 'Folio',
      miniprogramRoot: 'dist/',
      compileType: 'miniprogram',
      setting: { es6: true, minified: true, urlCheck: true },
      description: 'Folio 微信小程序',
    },
    null,
    2,
  ) + '\n',
)
console.log('Built wechat-mini/dist; import wechat-mini/ in WeChat DevTools.')
