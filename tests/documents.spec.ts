import type { Editor } from '@tiptap/react'
import { test, expect, type Page, type Locator } from '@playwright/test'
import { AgentRequestSchema, demoAgent } from '../src/domain/resume'
const limits = {
  maxFileBytes: 10485760,
  maxPages: 30,
  maxTextCharacters: 20000,
  timeoutMs: 20000,
  maxExpandedBytes: 52428800,
}
test.beforeEach(async ({ page }) => {
  await page.route('**/api/config', (route) =>
    route.fulfill({
      json: { mode: 'demo', authConfigured: false, importLimits: limits },
    }),
  )
  await page.route('**/api/auth/get-session', (route) =>
    route.fulfill({ json: null }),
  )
  await page.route('**/api/agent', (route) =>
    route.fulfill({
      json: demoAgent(AgentRequestSchema.parse(route.request().postDataJSON())),
    }),
  )
})
async function workspace(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: '试用示例' }).click()
  await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true')
}
async function paste(target: Locator, html: string) {
  await target.focus()
  await target.press('ControlOrMeta+a')
  await target.evaluate((element, value) => {
    const clipboardData = new DataTransfer()
    clipboardData.setData('text/html', value)
    clipboardData.setData(
      'text/plain',
      new DOMParser().parseFromString(value, 'text/html').body.textContent ??
        '',
    )
    element.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData,
        bubbles: true,
        cancelable: true,
      }),
    )
  }, html)
}
test('真实 DOCX 提取标题、强调和列表，核对前不调用 Agent', async ({ page }) => {
  const requests: ReturnType<typeof AgentRequestSchema.parse>[] = []
  await page.route('**/api/agent', (route) => {
    const input = AgentRequestSchema.parse(route.request().postDataJSON())
    requests.push(input)
    return route.fulfill({ json: demoAgent(input) })
  })
  await workspace(page)
  await page.locator('.import-prompt').click()
  await page
    .getByLabel('选择简历文件', { exact: true })
    .setInputFiles('tests/fixtures/resume.docx')
  const original = page.getByRole('textbox', { name: '简历原文', exact: true })
  await expect(original).toContainText('测试候选人')
  await expect(original.locator('strong')).toHaveText('微服务架构设计')
  await expect(original.locator('h3')).toHaveText('核心工作')
  await expect(original.locator('li')).toContainText('主导平台')
  expect(requests).toHaveLength(0)
  await page.getByRole('button', { name: '整理为简历', exact: true }).click()
  await expect(page.locator('.preview-panel .resume-heading h1')).toHaveText(
    '测试候选人',
  )
  await expect(
    page.locator('.preview-panel .resume-summary strong'),
  ).toHaveText('微服务架构设计')
  expect(requests[0].text).toContain('**微服务架构设计**')
  expect(requests[0].text).toContain('### 核心工作')
})
for (const [file, text] of [
  ['resume.pdf', 'Test Candidate'],
  ['resume-cjk.pdf', '测试候选人'],
]) {
  test(`真实 PDF 文字提取：${file}`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await workspace(page)
    await page.locator('.import-prompt').click()
    await page
      .getByLabel('选择简历文件', { exact: true })
      .setInputFiles(`tests/fixtures/${file}`)
    await expect(
      page.getByRole('textbox', { name: '简历原文', exact: true }),
    ).toContainText(text)
    await expect(
      page.getByRole('button', { name: '整理为简历', exact: true }),
    ).toBeEnabled()
    expect(errors).toEqual([])
  })
}
for (const [file, error] of [
  ['no-text.pdf', 'OCR'],
  ['too-many-pages.pdf', '超过 30 页'],
]) {
  test(`无文字或超页数不覆盖已有原文：${file}`, async ({ page }) => {
    await workspace(page)
    await page.locator('.import-prompt').click()
    await page
      .getByRole('textbox', { name: '简历原文', exact: true })
      .fill('尚未提交的简历原文')
    await page
      .getByLabel('选择简历文件', { exact: true })
      .setInputFiles(`tests/fixtures/${file}`)
    await expect(page.locator('.toast')).toContainText(error)
    await expect(
      page.getByRole('textbox', { name: '简历原文', exact: true }),
    ).toHaveText('尚未提交的简历原文')
    await expect(page.locator('.nav-count')).toHaveText('1')
  })
}
test('简介、技能和工作要点保留粘贴样式，模板、打印与刷新同源且无脚本执行', async ({
  page,
}) => {
  await workspace(page)
  await page.getByRole('button', { name: '编辑内容' }).click()
  const summary = page.getByRole('textbox', { name: '个人简介', exact: true })
  await paste(
    summary,
    '<h2>核心工作</h2><p>主导<span style="font-weight:700">微服务架构设计</span>。</p><ul><li>设计<em>实时通信</em></li></ul><img src=x onerror="window.hacked=1"><script>window.hacked=1</script>',
  )
  await expect(summary.locator('strong')).toHaveText('微服务架构设计')
  await paste(
    page.getByRole('textbox', { name: '专业技能', exact: true }),
    '<ul><li><strong>Go / Gin</strong></li><li>WebSocket / Redis</li></ul>',
  )
  await paste(
    page.getByRole('textbox', { name: '工作要点 1', exact: true }),
    '<ul><li>设计 <strong>WebSocket 实时通信架构</strong></li><li>支持 <em>Pipeline</em> 模式</li></ul>',
  )
  await page.getByRole('button', { name: '预览', exact: true }).click()
  const preview = page.locator('.preview-panel')
  await expect(preview.locator('.resume-summary strong')).toHaveText(
    '微服务架构设计',
  )
  await expect(preview.locator('.resume-summary h3')).toHaveText('核心工作')
  await expect(preview.locator('.resume-skills strong')).toHaveText('Go / Gin')
  await expect(
    preview.locator('.resume-job strong').filter({ hasText: 'WebSocket' }),
  ).toHaveText('WebSocket 实时通信架构')
  await page.getByRole('button', { name: '简历模板', exact: true }).click()
  await page.getByRole('button', { name: /02 \/ 极简留白/ }).click()
  await expect(preview.locator('.resume-summary strong')).toHaveText(
    '微服务架构设计',
  )
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('.print-only .resume-summary strong')).toHaveText(
    '微服务架构设计',
  )
  await page.emulateMedia({ media: 'screen' })
  await page.reload()
  await expect(preview.locator('.resume-summary strong')).toHaveText(
    '微服务架构设计',
  )
  expect(await page.evaluate(() => 'hacked' in window)).toBe(false)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '简历预览', exact: true }).click()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: '.wrangler/rich-resume-mobile.png',
    fullPage: true,
  })
})
test('格式工具实际应用加粗，JSON 备份保留 Markdown', async ({ page }) => {
  await workspace(page)
  await page.getByRole('button', { name: '编辑内容' }).click()
  const summary = page.getByRole('textbox', { name: '个人简介', exact: true })
  await summary.fill('架构设计')
  await summary.press('ControlOrMeta+a')
  await page
    .getByRole('toolbar', { name: '个人简介格式' })
    .getByRole('button', { name: '加粗', exact: true })
    .click()
  await expect(summary.locator('strong')).toHaveText('架构设计')
  const data = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('folio:resumes:v1:guest')!),
  )
  expect(data[0].summary).toBe('**架构设计**')
})
test('聊天粘贴将 HTML 基本格式交给 Agent，不混入可执行内容', async ({
  page,
}) => {
  await workspace(page)
  const input = page.getByRole('textbox', { name: '发送给 Folio' })
  await input.evaluate((element) => {
    const data = new DataTransfer()
    data.setData(
      'text/html',
      '<p>测试候选人</p><p>工程师</p><p>test@example.invalid</p><p>设计<strong>消息架构</strong></p><script>alert(1)</script>',
    )
    element.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    )
  })
  await expect(input).toHaveValue(/\*\*消息架构\*\*/)
  const request = page.waitForRequest(
    (request) =>
      request.method() === 'POST' && request.url().endsWith('/api/agent'),
  )
  await page.getByRole('button', { name: '发送消息' }).click()
  expect((await request).postDataJSON().text).toContain('**消息架构**')
  await expect(
    page.locator('.preview-panel .resume-summary strong'),
  ).toHaveText('消息架构')
})
test('超长原文不覆盖草稿，取消提取不创建简历', async ({ page }) => {
  let calls = 0
  await page.route('**/api/agent', (route) => {
    calls++
    return route.fulfill({
      json: demoAgent(AgentRequestSchema.parse(route.request().postDataJSON())),
    })
  })
  await workspace(page)
  await page.locator('.import-prompt').click()
  const original = page.getByRole('textbox', { name: '简历原文', exact: true })
  await original.fill('尚未提交的原文')
  await page.getByLabel('选择简历文件', { exact: true }).setInputFiles({
    name: 'long.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('经历'.repeat(10001)),
  })
  await expect(page.locator('.toast')).toContainText('超过 20,000 字符')
  await expect(original).toHaveText('尚未提交的原文')
  await page
    .getByLabel('选择简历文件', { exact: true })
    .setInputFiles('tests/fixtures/resume.pdf')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.locator('.nav-count')).toHaveText('1')
  expect(calls).toBe(0)
})
test('连续输入技能和工作要点不重排光标或丢失字符', async ({ page }) => {
  await workspace(page)
  await page.getByRole('button', { name: '编辑内容' }).click()
  for (const label of ['专业技能', '工作要点 1']) {
    const editor = page.getByRole('textbox', { name: label, exact: true })
    await editor.fill('')
    await editor.pressSequentially('Architecture design', { delay: 15 })
    await expect(editor).toHaveText('Architecture design')
    await editor.press('Enter')
    await editor.pressSequentially('Distributed systems', { delay: 15 })
    await expect(editor).toContainText('Distributed systems')
  }
  await page.reload()
  await expect(page.locator('.preview-panel .resume-skills')).toContainText(
    'Distributed systems',
  )
})

test('编辑列表前面的条目时光标保持原位', async ({ page }) => {
  await workspace(page)
  expect(new URL(page.url()).hostname).toBe('localhost')
  await page.getByRole('button', { name: '编辑内容' }).click()
  for (const label of ['专业技能', '工作要点 1']) {
    const editor = page.getByRole('textbox', { name: label, exact: true })
    await paste(editor, '<ul><li>Alpha</li><li>Omega</li></ul>')
    await editor.focus()
    await editor.evaluate((element) => {
      const tiptap = (element as HTMLElement & { editor: Editor }).editor
      const paragraph = element.querySelector('li p')!
      const end = tiptap.view.posAtDOM(paragraph, paragraph.childNodes.length)
      tiptap.commands.setTextSelection(end)
    })
    await page.keyboard.press('Enter')
    await expect(editor.locator('li')).toHaveText(['Alpha', '', 'Omega'])
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.type('XY', { delay: 100 })
    await expect(editor.locator('li')).toHaveText(['AlphaXY', '', 'Omega'])
  }
})

test('PDF 剪贴板的预格式换行、文本项目符号和字体强调保留到工作预览', async ({
  page,
}) => {
  await workspace(page)
  await page.getByRole('button', { name: '编辑内容' }).click()
  const editor = page.getByRole('textbox', { name: '工作要点 1', exact: true })
  await editor.focus()
  await editor.press('ControlOrMeta+a')
  await editor.evaluate((element) => {
    const data = new DataTransfer()
    data.setData(
      'text/html',
      '<span style="white-space: pre-wrap">负责<span style="font-family: TestSans-Bold">服务平台</span>。\n\n<span style="font-weight:700">核心工作</span>\n• 构建<span style="font-weight:700">消息系统</span>\n• 设计订单服务\n\n<span style="font-weight:700">技术栈</span>\nJava / Redis</span>',
    )
    data.setData(
      'text/plain',
      '负责服务平台。\n\n核心工作\n• 构建消息系统\n• 设计订单服务\n\n技术栈\nJava / Redis',
    )
    element.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    )
  })
  await expect(
    editor.locator('strong').filter({ hasText: '服务平台' }),
  ).toHaveText('服务平台')
  await expect(
    editor.locator('li').filter({ hasText: /^构建消息系统$/ }),
  ).toHaveCount(1)
  await page.getByRole('button', { name: '预览', exact: true }).click()
  const job = page.locator('.preview-panel .resume-job').first()
  await expect(
    job.locator('strong').filter({ hasText: '消息系统' }),
  ).toHaveText('消息系统')
  await expect(
    job.locator('li').filter({ hasText: /^设计订单服务$/ }),
  ).toHaveCount(1)
  await page.reload()
  await expect(
    job.locator('strong').filter({ hasText: '核心工作' }),
  ).toHaveText('核心工作')
  await expect(
    job.locator('li').filter({ hasText: /^设计订单服务$/ }),
  ).toHaveCount(1)
})

test('PDF 纯文本粘贴识别分行项目符号，不凭空添加强调', async ({ page }) => {
  await workspace(page)
  await page.getByRole('button', { name: '编辑内容' }).click()
  const editor = page.getByRole('textbox', { name: '个人简介', exact: true })
  await editor.focus()
  await editor.press('ControlOrMeta+a')
  await editor.evaluate((element) => {
    const data = new DataTransfer()
    data.setData(
      'text/plain',
      '平台开发\r\n\r\n• 消息服务\r\n• 订单服务\r\n\r\n技术栈\r\nJava / Redis',
    )
    element.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    )
  })
  await expect(editor.locator('li')).toHaveCount(2)
  await expect(editor.locator('strong')).toHaveCount(0)
  await expect(editor.locator('p').filter({ hasText: /^技术栈$/ })).toHaveCount(
    1,
  )
  await page.reload()
  await expect(page.locator('.preview-panel .resume-summary li')).toHaveCount(2)
})

test('扁平 PDF HTML 使用匹配的纯文本换行，保留强调、编号和本机 Markdown', async ({
  page,
}) => {
  await workspace(page)
  await page.getByRole('button', { name: '编辑内容' }).click()
  const editor = page.getByRole('textbox', { name: '个人简介', exact: true })
  await editor.focus()
  await editor.press('ControlOrMeta+a')
  await editor.evaluate((element) => {
    const data = new DataTransfer()
    data.setData(
      'text/html',
      '<p>平台开发 3. <span style="font-weight:700;font-style:italic">消息服务</span> 4. 订单服务</p>',
    )
    data.setData('text/plain', '平台开发\n3. 消息服务\n4. 订单服务')
    element.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    )
  })
  await expect(editor.locator('ol')).toHaveAttribute('start', '3')
  await expect(editor.locator('li')).toHaveCount(2)
  await expect(editor.locator('strong em, em strong')).toHaveText('消息服务')
  const data = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('folio:resumes:v1:guest')!),
  )
  expect(data[0].summary).toMatch(/3\. .*消息服务/)
  expect(data[0].summary).toContain('***消息服务***')
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('.print-only .resume-summary ol')).toHaveAttribute(
    'start',
    '3',
  )
})

test('在选区粘贴只替换选中文字，并支持一次撤销', async ({ page }) => {
  await workspace(page)
  await page.getByRole('button', { name: '编辑内容' }).click()
  const editor = page.getByRole('textbox', { name: '个人简介', exact: true })
  await editor.fill('before OLD after')
  await expect(editor).toHaveText('before OLD after')
  await editor.evaluate((element) => {
    const text = element.querySelector('p')!.firstChild!
    window.getSelection()!.setBaseAndExtent(text, 7, text, 10)
  })
  // Wait for the browser selectionchange to reach ProseMirror before sending
  // a synthetic paste event; real clipboard events arrive in a later task.
  await expect
    .poll(() =>
      editor.evaluate((element) => {
        const instance = (
          element as HTMLElement & { editor: import('@tiptap/react').Editor }
        ).editor
        const { from, to } = instance.state.selection
        return instance.state.doc.textBetween(from, to)
      }),
    )
    .toBe('OLD')
  await editor.evaluate((element) => {
    const data = new DataTransfer()
    data.setData('text/html', '<b>NEW</b>')
    data.setData('text/plain', 'NEW')
    element.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    )
  })
  await expect(editor).toHaveText('before NEW after')
  await expect(editor.locator('strong')).toHaveText('NEW')
  await editor.press('ControlOrMeta+z')
  await expect(editor).toHaveText('before OLD after')
})

test('PDF 粘贴超出条数或长度时保留已有草稿', async ({ page }) => {
  await workspace(page)
  await page.getByRole('button', { name: '编辑内容' }).click()
  const editor = page.getByRole('textbox', { name: '工作要点 1', exact: true })
  const before = await editor.textContent()
  await paste(
    editor,
    `<ul>${Array.from({ length: 13 }, (_, i) => `<li>条目 ${i}</li>`).join('')}</ul>`,
  )
  await expect(page.getByRole('alert')).toContainText('最多保留 12 条')
  await expect(editor).toHaveText(before!)
  const summary = page.getByRole('textbox', { name: '个人简介', exact: true })
  const original = await summary.textContent()
  await paste(summary, `<p>${'字'.repeat(20001)}</p>`)
  await expect(
    page.getByRole('alert').filter({ hasText: '内容过长' }),
  ).toBeVisible()
  await expect(summary).toHaveText(original!)
})
