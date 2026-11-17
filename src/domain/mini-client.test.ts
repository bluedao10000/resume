import { buildSync } from 'esbuild'
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'

const code = buildSync({
  entryPoints: ['wechat-mini/src/pages/workspace/index.ts'],
  bundle: true,
  platform: 'neutral',
  mainFields: ['module', 'main'],
  conditions: ['module'],
  format: 'cjs',
  target: 'es2020',
  write: false,
  define: { __MINI_API_BASE__: JSON.stringify('https://example.com') },
}).outputFiles[0].text
function client(storage = new Map<string, unknown>(), restricted = false) {
  const dynamicFunction = vi.fn(function () {
    return Object.create(null)
  })
  let page: any
  const wx = {
    request: vi.fn(),
    chooseMessageFile: vi.fn(),
    getFileSystemManager: vi.fn(),
    getStorageSync: (key: string) => storage.get(key) ?? '',
    setStorageSync: vi.fn((key: string, value: unknown) =>
      storage.set(key, JSON.parse(JSON.stringify(value))),
    ),
    getStorageInfoSync: () => ({ keys: [...storage.keys()] }),
    showModal: ({ success }: any) => success({ confirm: true }),
    removeStorageSync: (key: string) => storage.delete(key),
  }
  runInNewContext(code, {
    Page: (value: unknown) => {
      page = value
    },
    wx,
    setTimeout,
    clearTimeout,
    console,
    ...(restricted ? { Function: dynamicFunction } : {}),
  })
  page.setData = (patch: object) => Object.assign(page.data, patch)
  return { page, wx, storage, dynamicFunction }
}
it('runs the built native bundle without browser globals, preserves deletion and restores pending state', async () => {
  const { page, storage } = client()
  page.demo()
  expect(page.data.resumes).toHaveLength(1)
  page.data.intent = 'import'
  page.data.input = '测试人物\n开发者\n熟悉 React'
  await page.send()
  expect(page.data.error).toBe('')
  expect(page.data.resumes).toHaveLength(2)
  expect(page.data.selected.name).toBe('测试人物')
  page.remove({ currentTarget: { dataset: { id: page.data.selected.id } } })
  expect(page.data.resumes).toHaveLength(1)
  page.undo()
  expect(page.data.resumes).toHaveLength(2)
  for (const resume of [...page.data.resumes])
    page.remove({ currentTarget: { dataset: { id: resume.id } } })
  const reopened = client(storage).page
  reopened.demo()
  expect(reopened.data.resumes).toEqual([])
})
it('does not report saved results when local storage fails', async () => {
  const { page, wx } = client()
  page.demo()
  wx.setStorageSync.mockImplementation(() => {
    throw new Error('storage full')
  })
  page.data.intent = 'import'
  page.data.input = '测试人物\n开发者'
  await page.send()
  expect(page.data.error).toContain('本机保存失败')
  expect(page.data.resumes).toHaveLength(1)
  expect(page.data.pending).toBe(false)
})

it('keeps guest and signed-in libraries separate and discards late responses after a scope switch', async () => {
  const { page, wx, storage } = client()
  page.demo()
  page.enter('user:fixture', false)
  expect(page.data.resumes).toEqual([])
  let finish: (value: unknown) => void = () => {}
  Object.assign(wx, {
    request: ({ success }: { success: (value: unknown) => void }) => {
      finish = success
    },
  })
  page.data.intent = 'import'
  page.data.input = '独立用户\n开发者'
  const running = page.send()
  page.demo()
  finish({
    statusCode: 200,
    data: {
      message: 'done',
      resume: {},
      missing: [],
      changes: [],
      keywords: [],
    },
  })
  await running
  expect(page.data.resumes).toHaveLength(1)
  expect(page.data.selected.name).toBe('林知夏')
  expect(
    (storage.get('folio:mini:v1:user:fixture') as { pending: unknown }).pending,
  ).toBeTruthy()
  expect(storage.get('folio:mini:v1:guest')).toBeUndefined()
})

it('opens native composer actions without replaying or overwriting unsent text', () => {
  const { page, wx } = client()
  page.demo()
  const writes = wx.setStorageSync.mock.calls.length
  page.data.input = '尚未发送的经历'
  page.toggleTools()
  page.chooseIntent({ currentTarget: { dataset: { intent: 'tailor' } } })
  expect(page.data.input).toBe('尚未发送的经历')
  expect(page.data.toolsOpen).toBe(false)
  expect(page.data.pending).toBe(false)
  expect(wx.setStorageSync.mock.calls.length).toBe(writes)
})
it('applies layout preferences in place and preserves them on reselecting the same template', () => {
  const { page } = client()
  page.demo()
  const selectedId = page.data.selected.id
  page.layout({
    currentTarget: { dataset: { index: 3 } },
    detail: { value: '1' },
  })
  expect(page.data.selected.id).toBe(selectedId)
  expect(page.data.resumes).toHaveLength(1)
  expect(page.data.presentation.density).toBe('compact')
  page.chooseTemplate({ currentTarget: { dataset: { index: 0 } } })
  expect(page.data.presentation.density).toBe('compact')
})

it('runs parsing, rendering and edits when the native sandbox cannot construct functions', async () => {
  const { page, dynamicFunction } = client(new Map(), true)
  page.demo()
  expect(page.data.error).toBe('')
  expect(page.data.resumes).toHaveLength(1)
  page.data.intent = 'import'
  page.data.input = '测试人物\n开发者\n熟悉 React'
  await page.send()
  expect(page.data.error).toBe('')
  expect(page.data.selected.name).toBe('测试人物')
  page.newChat()
  expect(page.data.error).toBe('')
  expect(dynamicFunction).not.toHaveBeenCalled()
})

it('keeps the first resume import in chat and requires explicit confirmation before generating', async () => {
  const { page, wx } = client()
  page.demo()
  const count = page.data.resumes.length
  const writes = wx.setStorageSync.mock.calls.length
  page.data.tab = 'account'
  page.openImport()
  expect(page.data.tab).toBe('chat')
  expect(page.data.importOpen).toBe(true)
  page.inputImport({ detail: { value: '测试人物\n开发者\n熟悉 React' } })
  expect(wx.setStorageSync.mock.calls.length).toBe(writes)
  page.closeImport()
  expect(page.data.resumes).toHaveLength(count)
  page.openImport()
  await page.confirmImport()
  expect(page.data.importOpen).toBe(false)
  expect(page.data.selected.name).toBe('测试人物')
  expect(page.data.resumes).toHaveLength(count + 1)
})

it('discards a document response after cancelling and never sends extraction directly to the Agent', async () => {
  const storage = new Map<string, unknown>([
    [
      'folio:mini:auth',
      {
        token: 'fixture-token',
        user: { id: 'fixture-user' },
        expiresAt: Date.now() + 100000,
      },
    ],
  ])
  const { page, wx } = client(storage)
  let finish: (result: unknown) => void = () => {}
  const abort = vi.fn()
  wx.request.mockImplementation((options) => {
    if (options.url.includes('/document?')) {
      finish = options.success
      return { abort }
    }
    options.success({
      statusCode: 200,
      data: options.url.endsWith('/config')
        ? {
            mode: 'live',
            runtime: 'pi-durable',
            loginEnabled: true,
            importLimits: {
              maxFileBytes: 100000,
              maxPages: 30,
              maxTextCharacters: 20000,
              timeoutMs: 20000,
              maxExpandedBytes: 200000,
            },
          }
        : { user: { id: 'fixture-user' } },
    })
    return { abort }
  })
  wx.chooseMessageFile.mockImplementation((options) =>
    options.success({
      tempFiles: [{ name: 'resume.pdf', path: '/synthetic.pdf', size: 10 }],
    }),
  )
  wx.getFileSystemManager.mockReturnValue({
    readFile: (options: any) => options.success({ data: new ArrayBuffer(10) }),
  })
  await page.onLoad()
  expect(page.data.resumes).toHaveLength(0)
  page.openImport()
  page.chooseDocument()
  page.closeImport()
  finish({ statusCode: 200, data: { text: '迟到的原文' } })
  await Promise.resolve()
  await Promise.resolve()
  expect(abort).toHaveBeenCalled()
  expect(page.data.importText).toBe('')
  expect(page.data.resumes).toHaveLength(0)
  expect(wx.request.mock.calls.some(([o]) => o.url.includes('/agent'))).toBe(
    false,
  )
})

it('starts an empty library in import mode and returns to editing after each creation', async () => {
  const { page } = client()
  page.demo()
  page.remove({ currentTarget: { dataset: { id: page.data.selected.id } } })
  expect(page.data.intent).toBe('import')
  page.data.input = '测试人物\n开发者'
  await page.send()
  expect(page.data.intent).toBe('polish')
  page.chooseIntent({ currentTarget: { dataset: { intent: 'tailor' } } })
  page.data.input = '要求 React'
  await page.send()
  const selected = page.data.selected.id
  expect(page.data.intent).toBe('polish')
  page.data.input = '精简简介'
  await page.send()
  expect(page.data.resumes).toHaveLength(2)
  expect(page.data.selected.id).toBe(selected)
})

it.each([
  [402, '额度不足'],
  [410, '请求已结束'],
] as const)(
  'retains the request on timeout and restores the composer on HTTP %i',
  async (status, error) => {
    const { page, wx, storage } = client()
    page.enter('user:one', false)
    page.data.input = '测试人物\n开发者'
    const requests: unknown[] = []
    Object.assign(wx, {
      request: (options: any) => {
        requests.push(options.data)
        if (requests.length === 1) options.fail({ errMsg: 'timeout' })
        else options.success({ statusCode: status, data: { error } })
      },
    })
    await page.send()
    expect(page.data.pending).toBe(true)
    await page.resume()
    expect(requests[1]).toEqual(requests[0])
    expect(page.data).toMatchObject({
      pending: false,
      busy: false,
      error,
      input: '测试人物\n开发者',
      intent: 'import',
    })
    expect(storage.get('folio:mini:v1:user:one')).toMatchObject({
      pending: null,
      resumes: [],
    })
  },
)

it('ignores session restoration after explicit demo entry and clears editor data on scope changes', async () => {
  const { page, wx, storage } = client()
  storage.set('folio:mini:auth', {
    token: 'test',
    expiresAt: Date.now() + 60000,
    user: { id: 'one' },
  })
  let finish: ((result: object) => void) | undefined
  Object.assign(wx, {
    request: (options: any) => {
      if (options.url.endsWith('/config'))
        options.success({
          statusCode: 200,
          data: { mode: 'live', runtime: 'pi-durable', loginEnabled: true },
        })
      else finish = options.success
    },
  })
  const restoring = page.onLoad()
  await vi.waitFor(() => expect(finish).toBeDefined())
  page.demo()
  finish!({ statusCode: 200, data: { user: { id: 'one' } } })
  await restoring
  expect(page.data).toMatchObject({ demo: true, entered: true, loading: false })
  page.edit()
  page.data.input = '未发送草稿'
  page.enter('user:one', false)
  expect(page.data).toMatchObject({ edit: null, input: '', resumes: [] })
})

it('keeps the local session on a logout transport failure and exits on a confirmed expired session', async () => {
  const { page, wx, storage } = client()
  const session = {
    token: 'fixture',
    user: { id: 'one' },
    expiresAt: Date.now() + 60000,
  }
  storage.set('folio:mini:auth', session)
  page.enter('user:one', false, session)
  let expired = false
  Object.assign(wx, {
    request: (options: any) => {
      if (expired)
        options.success({ statusCode: 401, data: { error: '请先登录。' } })
      else options.fail({ errMsg: 'timeout' })
    },
  })
  await page.logout()
  expect(page.data).toMatchObject({ entered: true, busy: false })
  expect(storage.get('folio:mini:auth')).toEqual(session)
  expired = true
  await page.logout()
  expect(page.data).toMatchObject({ entered: false, busy: false, error: '' })
  expect(storage.has('folio:mini:auth')).toBe(false)
})

it('keeps the new identity’s reviewed document text when an older import finishes', async () => {
  const { page, wx } = client()
  page.enter('user:one', false)
  let finish!: (response: object) => void
  wx.request.mockImplementation((options) => {
    finish = options.success
  })
  page.openImport()
  page.inputImport({ detail: { value: '旧原文' } })
  const sending = page.confirmImport()
  page.enter('user:two', false)
  page.openImport()
  page.inputImport({ detail: { value: '新原文' } })
  finish({ statusCode: 402, data: { error: '原请求被拒绝' } })
  await sending
  expect(page.data).toMatchObject({
    importOpen: true,
    importText: '新原文',
    pending: false,
    error: '',
  })
})
