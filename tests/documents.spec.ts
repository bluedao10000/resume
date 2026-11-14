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
  await target.evaluate((element, value) => {
    const range = document.createRange()
    range.selectNodeContents(element)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
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
  await page.getByRole('button', { name: '整理为简历' }).click()
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
    await expect(page.getByRole('button', { name: '整理为简历' })).toBeEnabled()
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
