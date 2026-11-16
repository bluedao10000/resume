import { buildSync } from 'esbuild'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'
const code = buildSync({
  entryPoints: ['wechat-mini/src/api.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
  define: { __MINI_API_BASE__: JSON.stringify('https://www.codeiy.com') },
}).outputFiles[0].text
function api(reply: object, fail = false) {
  const module = { exports: {} as any }
  runInNewContext(code, {
    module,
    exports: module.exports,
    wx: {
      request: (options: any) =>
        fail ? options.fail(reply) : options.success(reply),
    },
  })
  return module.exports
}
it('distinguishes missing backend from transport failure and non-JSON challenge pages', async () => {
  await expect(
    api({ statusCode: 404, data: '<html>not found</html>' }).request('config'),
  ).rejects.toThrow('HTTP 404')
  await expect(
    api({ statusCode: 200, data: '<html>challenge</html>' }).request('config'),
  ).rejects.toThrow('非 JSON')
  await expect(
    api({ errMsg: 'request:fail url not in domain list' }, true).request(
      'config',
    ),
  ).rejects.toThrow('合法域名')
  await expect(
    api({ errMsg: 'request:fail timeout', errno: 5 }, true).request('config'),
  ).rejects.toThrow('超时')
})
it('redacts URLs from transport diagnostics and preserves successful JSON', async () => {
  const client = api({ statusCode: 200, data: { mode: 'live' } })
  expect(
    client.networkError({
      errMsg: 'request:fail https://example.com/?token=secret',
    }),
  ).not.toContain('secret')
  await expect(client.request('config')).resolves.toEqual({
    status: 200,
    data: { mode: 'live' },
  })
})
