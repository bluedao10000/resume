import { test, expect, type Page } from '@playwright/test'
import { AgentRequestSchema, demoAgent } from '../src/domain/resume'

async function openWorkspace(page: Page) {
  await page.goto('/')
  const demo = page.getByRole('button', { name: '试用示例' })
  await expect(
    page.locator('.app-shell[data-ready="true"]').or(demo),
  ).toBeVisible()
  if (await demo.isVisible()) await demo.click()
  await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true')
}

async function resumeAction(page: Page, name: string) {
  await page.getByRole('button', { name: '简历操作', exact: true }).click()
  await page
    .getByRole('dialog', { name: '简历操作', exact: true })
    .getByRole('button', { name, exact: true })
    .click()
}

test.beforeEach(async ({ page }) => {
  // Browser workflows are deterministic even when the developer uses live mode.
  // The real provider path is verified separately with synthetic input.
  await page.route('**/api/config', (route) =>
    route.fulfill({
      json: {
        mode: 'demo',
        authConfigured: false,
        importLimits: {
          maxFileBytes: 10485760,
          maxPages: 30,
          maxTextCharacters: 20000,
          timeoutMs: 20000,
          maxExpandedBytes: 52428800,
        },
      },
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

test('移动章节实际改变两种模板与打印顺序，刷新恢复对话和排序', async ({
  page,
}) => {
  let calls = 0
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/agent'))
      calls++
  })
  await openWorkspace(page)
  const text = '把简历里的专业技能移动到工作经历上方'
  await page.getByRole('textbox', { name: '发送给 Folio' }).fill(text)
  await page.getByRole('button', { name: '发送消息' }).click()
  await expect(page.locator('.message-text')).toContainText('已将')
  const order = async (selector: string) => {
    const headings = await page
      .locator(`${selector} .resume-section h2`)
      .allTextContents()
    expect(headings.findIndex((h) => h.includes('专业技能'))).toBeLessThan(
      headings.findIndex((h) => h.includes('工作经历')),
    )
  }
  await order('.preview-panel')
  await expect(page.locator('.nav-count')).toHaveText('1')
  await page.getByRole('button', { name: '简历模板', exact: true }).click()
  await page.getByRole('button', { name: /02 \/ 极简留白/ }).click()
  await order('.preview-panel')
  await page.emulateMedia({ media: 'print' })
  await order('.print-only')
  await page.emulateMedia({ media: 'screen' })
  await page.reload()
  await expect(page.locator('.user-message')).toHaveText(text)
  await expect(page.locator('.message-text')).toContainText('已将')
  await order('.preview-panel')
  expect(calls).toBe(1)
})

test('JD 定制入口直接可见，取消不生成，确认保留来源且刷新不重放', async ({
  page,
}) => {
  const { sampleResume } = await import('../src/domain/resume')
  await page.addInitScript(
    (resume) => {
      if (!localStorage.getItem('folio:resumes:v1:guest'))
        localStorage.setItem('folio:resumes:v1:guest', JSON.stringify([resume]))
    },
    { ...sampleResume, isExample: false, label: '基础简历' },
  )
  const requests: ReturnType<typeof AgentRequestSchema.parse>[] = []
  await page.route('**/api/agent', (route) => {
    const input = AgentRequestSchema.parse(route.request().postDataJSON())
    requests.push(input)
    return route.fulfill({ json: demoAgent(input) })
  })
  await openWorkspace(page)
  const source = await page.evaluate(
    () => JSON.parse(localStorage.getItem('folio:resumes:v1:guest')!)[0],
  )
  const entry = page.getByRole('button', { name: '按 JD 定制', exact: true })
  const composer = page.getByRole('textbox', { name: '发送给 Folio' })
  await expect(entry).toBeVisible()
  await expect(composer).toHaveAttribute('placeholder', /岗位描述（JD）/)
  await composer.fill('尚未发送的修改要求')
  await entry.click()
  const dialog = page.getByRole('dialog', { name: '按岗位定制', exact: true })
  await expect(dialog).toContainText('生成独立版本，保留原简历')
  await expect(
    dialog.getByRole('button', { name: '生成定制草稿' }),
  ).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(entry).toBeFocused()
  await expect(composer).toHaveValue('尚未发送的修改要求')
  expect(requests).toHaveLength(0)
  await expect(page.locator('.nav-count')).toHaveText('1')
  await entry.click()
  await dialog
    .getByLabel('岗位描述（JD）')
    .fill('前端工程师\nReact / TypeScript\n投递邮箱：talent@example.invalid')
  await dialog.getByRole('button', { name: '生成定制草稿' }).click()
  await expect(page.locator('.nav-count')).toHaveText('2')
  expect(requests).toHaveLength(1)
  expect(requests[0].intent).toBe('tailor')
  expect(requests[0].library?.[0].id).toBe(source.id)
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('folio:resumes:v1:guest')!),
  )
  expect(
    saved.find((resume: { id: string }) => resume.id === source.id),
  ).toEqual(source)
  expect(saved[0].id).not.toBe(source.id)
  await page.reload()
  await expect(page.locator('.nav-count')).toHaveText('2')
  await expect(entry).toBeVisible()
  expect(requests).toHaveLength(1)
})

test('手机 JD 入口不挤出发送按钮或增加对话顶部占用，生成时禁用', async ({
  page,
}) => {
  let finish!: () => void
  const gate = new Promise<void>((resolve) => {
    finish = resolve
  })
  await page.route('**/api/agent', async (route) => {
    await gate
    return route.fulfill({
      json: demoAgent(AgentRequestSchema.parse(route.request().postDataJSON())),
    })
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await openWorkspace(page)
  const entry = page.getByRole('button', { name: '按 JD 定制', exact: true })
  await expect(entry).toBeInViewport()
  await expect(page.getByRole('button', { name: '发送消息' })).toBeInViewport()
  const bounds = await page.locator('.chat-scroll').boundingBox()
  expect(bounds?.y).toBe(0)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await entry.click()
  await page
    .getByLabel('岗位描述（JD）')
    .fill('前端工程师\n任职要求：React、TypeScript')
  await page.getByRole('button', { name: '生成定制草稿' }).click()
  await expect(entry).toBeDisabled()
  await expect(page.getByRole('button', { name: '停止生成' })).toBeInViewport()
  finish()
  await expect(entry).toBeEnabled()
  await expect(page.locator('.nav-count')).toHaveText('2')
})

test('空库先引导导入，已有简历后显示 JD 定制入口', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('folio:resumes:v1:guest'))
      localStorage.setItem('folio:resumes:v1:guest', '[]')
  })
  await openWorkspace(page)
  const entry = page.getByRole('button', { name: '按 JD 定制', exact: true })
  await expect(entry).toHaveCount(0)
  await expect(page.locator('.import-prompt')).toBeVisible()
  await page.locator('.import-prompt').click()
  await page.getByRole('button', { name: '填入示例' }).click()
  await page.getByRole('button', { name: '整理为简历' }).click()
  await expect(entry).toBeVisible()
  await expect(page.locator('.nav-count')).toHaveText('1')
})

test('刷新后携带历史上下文，新对话隔离上下文且旧对话可再次打开', async ({
  page,
}) => {
  const requests: ReturnType<typeof AgentRequestSchema.parse>[] = []
  await page.route('**/api/agent', (route) => {
    const input = AgentRequestSchema.parse(route.request().postDataJSON())
    requests.push(input)
    const result = demoAgent(input)
    result.message = input.history.some((m) =>
      m.content.includes('突出架构经验'),
    )
      ? '你希望突出架构经验。'
      : '已记下你的要求。'
    result.applied = false
    result.changes = []
    return route.fulfill({ json: result })
  })
  await openWorkspace(page)
  const send = async (text: string) => {
    await page.getByRole('textbox', { name: '发送给 Folio' }).fill(text)
    await page.getByRole('button', { name: '发送消息' }).click()
    await expect(page.getByRole('button', { name: '发送消息' })).toBeVisible()
  }
  await send('希望突出架构经验')
  await expect(page.locator('.message-text')).toHaveText('已记下你的要求。')
  await page.reload()
  await expect(page.locator('.user-message')).toHaveText('希望突出架构经验')
  await send('我刚才希望突出什么？')
  await expect(page.locator('.message-text').last()).toHaveText(
    '你希望突出架构经验。',
  )
  expect(requests[1].history).toEqual([
    { role: 'user', content: '希望突出架构经验' },
    { role: 'assistant', content: '已记下你的要求。' },
  ])
  await expect(page.locator('.change-card')).toHaveCount(0)
  await page.getByRole('button', { name: '开启新对话' }).click()
  await send('新的要求')
  await expect(page.locator('.message-text')).toHaveText('已记下你的要求。')
  expect(requests[2].history).toEqual([])
  expect(requests[2].threadId).not.toBe(requests[1].threadId)
  await page.getByRole('button', { name: '历史对话', exact: true }).click()
  await page
    .getByRole('dialog', { name: '历史对话' })
    .getByRole('button', { name: '希望突出架构经验', exact: true })
    .click()
  await expect(page.locator('.user-message')).toHaveCount(2)
  await expect(page.locator('.message-text').last()).toHaveText(
    '你希望突出架构经验。',
  )
  expect(requests).toHaveLength(3)
})

test('pi-durable 生成中刷新复用原请求并恢复最终结果，不重复用户消息', async ({
  page,
}) => {
  await page.route('**/api/config', (route) =>
    route.fulfill({
      json: { mode: 'demo', authConfigured: false, runtime: 'pi-durable' },
    }),
  )
  const requests: unknown[] = []
  let complete = false
  let input: ReturnType<typeof AgentRequestSchema.parse>
  await page.route('**/api/agent**', (route) => {
    if (route.request().method() === 'POST') {
      input = AgentRequestSchema.parse(route.request().postDataJSON())
      requests.push(input)
      return route.fulfill({ status: 202, json: { status: 'running' } })
    }
    return route.fulfill(
      complete
        ? { json: { status: 'completed', result: demoAgent(input) } }
        : { status: 202, json: { status: 'running' } },
    )
  })
  await openWorkspace(page)
  await page
    .getByRole('textbox', { name: '发送给 Folio' })
    .fill('把专业技能移动到工作经历上方')
  await page.getByRole('button', { name: '发送消息' }).click()
  await expect(page.getByRole('button', { name: '停止生成' })).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('folio:chats:v1:guest')!).threads[0]
            .pendingRequest?.requestId,
      ),
    )
    .toBeTruthy()
  await page.reload()
  await expect.poll(() => requests.length).toBe(2)
  expect(requests[1]).toEqual(requests[0])
  complete = true
  await expect(page.locator('.message-text')).toContainText('已将')
  await expect(page.locator('.user-message')).toHaveCount(1)
  await expect(page.locator('.assistant-message')).toHaveCount(1)
  await expect(page.locator('.nav-count')).toHaveText('1')
  await page.reload()
  await expect(page.locator('.message-text')).toContainText('已将')
  expect(requests).toHaveLength(2)
})

test('对话独享全屏高度，长消息独立滚动，工具菜单不挤占布局', async ({
  page,
}) => {
  await page.route('**/api/agent', (route) => {
    const result = demoAgent(
      AgentRequestSchema.parse(route.request().postDataJSON()),
    )
    result.message = Array.from(
      { length: 80 },
      (_, index) => `第 ${index + 1} 行：保留原始经历，调整表达。`,
    ).join('\n')
    return route.fulfill({ json: result })
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await openWorkspace(page)
  await expect(page.getByRole('region', { name: '简历使用引导' })).toBeVisible()
  await expect(page.locator('.import-prompt')).toBeVisible()
  const initialHeight = await page
    .locator('.chat-scroll')
    .evaluate((el) => el.clientHeight)
  await page.getByRole('button', { name: '简历操作', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '简历操作' })).toBeVisible()
  expect(
    await page.locator('.chat-scroll').evaluate((el) => el.clientHeight),
  ).toBe(initialHeight)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: '简历操作' })).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: '简历操作', exact: true }),
  ).toBeFocused()
  await resumeAction(page, '润色简历')
  await expect(page.locator('.message-text')).toContainText('第 80 行')
  await expect(page.locator('.import-prompt')).toHaveCount(0)
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    { width: 390, height: 420 },
  ]) {
    await page.setViewportSize(viewport)
    const metrics = await page.evaluate(() => {
      const panel = document
        .querySelector('.chat-panel')!
        .getBoundingClientRect()
      const messages = document.querySelector('.chat-scroll')!
      const box = messages.getBoundingClientRect()
      const input = document
        .querySelector('.composer-container')!
        .getBoundingClientRect()
      return {
        top: panel.top,
        height: panel.height,
        messageTop: box.top,
        messageBottom: box.bottom,
        inputTop: input.top,
        inputBottom: input.bottom,
        viewport: innerHeight,
        pageHeight: document.documentElement.scrollHeight,
        overflows: messages.scrollHeight > messages.clientHeight,
      }
    })
    expect(metrics.top).toBe(0)
    expect(metrics.height).toBe(metrics.viewport)
    expect(metrics.messageTop).toBe(0)
    expect(metrics.messageBottom).toBeLessThanOrEqual(metrics.inputTop + 1)
    expect(metrics.inputBottom).toBeLessThanOrEqual(metrics.viewport)
    expect(metrics.pageHeight).toBeLessThanOrEqual(metrics.viewport)
    expect(metrics.overflows).toBe(true)
    await expect(
      page.getByRole('button', { name: '发送消息' }),
    ).toBeInViewport()
  }
  await page.getByRole('button', { name: '简历预览', exact: true }).click()
  await expect(page.locator('.preview-panel')).toBeVisible()
  await page.getByRole('button', { name: '开启新对话' }).click()
  await expect(page.locator('.chat-panel')).toBeVisible()
  await expect(page.locator('.user-message')).toHaveCount(0)
})

test('未登录展示独立落地页，Google 登录失败可重试且不访问简历库', async ({
  page,
}) => {
  await page.route('**/api/config', (route) =>
    route.fulfill({ json: { mode: 'live', authConfigured: true } }),
  )
  const attempts: unknown[] = []
  await page.route('**/api/auth/sign-in/social', (route) => {
    attempts.push(route.request().postDataJSON())
    return route.fulfill({
      status: 503,
      json: { code: 'TEST_UNAVAILABLE', message: '登录暂不可用，请重试。' },
    })
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '简历工作台' })).toBeVisible()
  await expect(page.locator('.app-shell')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '试用示例' })).toHaveCount(0)
  expect(
    await page.evaluate(() => localStorage.getItem('folio:resumes:v1:guest')),
  ).toBeNull()
  await page.getByRole('button', { name: '使用 Google 继续' }).click()
  await expect(page.getByRole('alert')).toContainText('登录暂不可用')
  await page.getByRole('button', { name: '使用 Google 继续' }).click()
  expect(attempts).toHaveLength(2)
  expect(attempts[0]).toMatchObject({ provider: 'google', callbackURL: '/' })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})

test('演示从落地页主动进入，刷新保留工作台且不展示宣传文案', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('.landing-page')).toBeVisible()
  expect(
    await page.evaluate(() => localStorage.getItem('folio:resumes:v1:guest')),
  ).toBeNull()
  await page.getByRole('button', { name: '试用示例' }).click()
  await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true')
  await expect(page.locator('.app-shell')).not.toContainText(
    '你的经历，不止一面',
  )
  await expect(page.locator('.app-shell')).not.toContainText('由你掌控')
  await expect(page.locator('.app-shell')).not.toContainText('值得被看见')
  await expect(page.locator('.app-shell')).not.toContainText('NEW')
  await page.reload()
  await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true')
})

test('生产登录后直接进入工作台，退出回落地页并保留账户简历', async ({
  page,
}) => {
  let signedIn = true
  const now = new Date().toISOString()
  await page.route('**/api/config', (route) =>
    route.fulfill({ json: { mode: 'live', authConfigured: true } }),
  )
  await page.route('**/api/auth/get-session', (route) =>
    route.fulfill({
      json: signedIn
        ? {
            session: {
              id: 'entry-session',
              token: 'test-only',
              userId: 'entry-user',
              expiresAt: '2099-01-01T00:00:00.000Z',
              createdAt: now,
              updatedAt: now,
            },
            user: {
              id: 'entry-user',
              name: '测试账户',
              email: 'entry@example.com',
              emailVerified: true,
              createdAt: now,
              updatedAt: now,
            },
          }
        : null,
    }),
  )
  await page.route('**/api/auth/sign-out', (route) => {
    signedIn = false
    return route.fulfill({ json: { success: true } })
  })
  await page.goto('/')
  await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true')
  await expect(page.locator('.landing-page')).toHaveCount(0)
  await page.getByRole('button', { name: '账户设置' }).click()
  await expect(page.locator('.account-details')).toContainText('当前浏览器')
  await page.getByRole('button', { name: '退出登录' }).click()
  await expect(page.locator('.landing-page')).toBeVisible()
  await expect(page.locator('.app-shell')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '试用示例' })).toHaveCount(0)
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('folio:resumes:v1:entry-user')!).length,
    ),
  ).toBe(1)
  expect(
    await page.evaluate(() => localStorage.getItem('folio:resumes:v1:guest')),
  ).toBeNull()
})

test('配置请求失败显示重试，不隐式进入演示或改写简历', async ({ page }) => {
  await page.route('**/api/config', (route) =>
    route.fulfill({ status: 503, json: { error: 'unavailable' } }),
  )
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('暂时无法加载')
  await expect(page.getByRole('button', { name: '重试' })).toBeVisible()
  await expect(page.locator('.app-shell')).toHaveCount(0)
  expect(
    await page.evaluate(() => localStorage.getItem('folio:resumes:v1:guest')),
  ).toBeNull()
})

test('删除简历先确认，取消和 Escape 保留原稿，确认后侧栏同步移除', async ({
  page,
}) => {
  await openWorkspace(page)
  await page.getByRole('button', { name: '删除当前简历' }).click()
  await expect(
    page.getByRole('dialog', { name: '删除这份简历？' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: '取消', exact: true }),
  ).toBeFocused()
  await expect(page.locator('.nav-count')).toHaveText('1')
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await expect(page.locator('.recent-list button')).toHaveCount(1)
  await page.getByRole('button', { name: '删除当前简历' }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.nav-count')).toHaveText('1')
  await page.getByRole('button', { name: '删除当前简历' }).click()
  await page.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(page.locator('.recent-list button')).toHaveCount(0)
  await expect(page.locator('.composer-context')).toHaveCount(0)
  await expect(page.locator('.nav-count')).toHaveText('0')
})

test('编辑经历删除先确认，取消不变更，确认持久化且不会删除整份简历', async ({
  page,
}) => {
  await openWorkspace(page)
  await page.getByRole('button', { name: '编辑内容' }).click()
  await page.getByRole('button', { name: '删除这段经历' }).first().click()
  await expect(page.getByRole('dialog')).toContainText('山海科技')
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await expect(page.locator('.resume-editor fieldset')).toHaveCount(2)
  await page.getByRole('button', { name: '删除这段经历' }).first().click()
  await page.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(page.locator('.resume-editor fieldset')).toHaveCount(1)
  await expect(page.locator('.nav-count')).toHaveText('1')
  await page.reload()
  await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true')
  await expect(page.locator('.preview-panel .resume-paper')).not.toContainText(
    '山海科技',
  )
  await expect(page.locator('.preview-panel .resume-paper')).toContainText(
    '一间数字',
  )
})

test('更新卡片默认折叠且可键盘展开，聊天字号一致并支持手机', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await openWorkspace(page)
  await resumeAction(page, '润色简历')
  await expect(page.locator('.change-card')).toBeVisible()
  await expect(page.locator('.change-card details')).not.toHaveAttribute('open')
  const collapsed = await page.locator('.change-card').boundingBox()
  expect(collapsed!.height).toBeLessThan(60)
  for (const selector of [
    '.user-message',
    '.message-text',
    '.composer textarea',
    '.change-card summary',
  ]) {
    expect(
      await page
        .locator(selector)
        .first()
        .evaluate((el) => getComputedStyle(el).fontSize),
    ).toBe('12px')
  }
  await page.locator('.change-card summary').focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.change-details')).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await expect(page.getByRole('button', { name: '发送消息' })).toBeVisible()
})

test('其他标签页删除后，当前导航和预览同步且不重放 Agent', async ({
  page,
  context,
}) => {
  let agentRequests = 0
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/agent'))
      agentRequests++
  })
  await openWorkspace(page)
  const second = await context.newPage()
  await second.route('**/api/config', (route) =>
    route.fulfill({
      json: {
        mode: 'demo',
        authConfigured: false,
        importLimits: {
          maxFileBytes: 10485760,
          maxPages: 30,
          maxTextCharacters: 20000,
          timeoutMs: 20000,
          maxExpandedBytes: 52428800,
        },
      },
    }),
  )
  await second.route('**/api/auth/get-session', (route) =>
    route.fulfill({ json: null }),
  )
  await openWorkspace(second)
  await second.getByRole('button', { name: '删除当前简历' }).click()
  await second.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(page.locator('.nav-count')).toHaveText('0')
  await expect(page.locator('.recent-list button')).toHaveCount(0)
  await expect(page.locator('.resume-paper')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '撤销删除' })).toHaveCount(0)
  await second.getByRole('button', { name: '撤销删除', exact: true }).click()
  await expect(page.locator('.nav-count')).toHaveText('1')
  await expect(page.locator('.recent-list button')).toHaveCount(1)
  expect(agentRequests).toBe(0)
  await second.close()
})

test('示例有标识，可删除最后一份、撤销，刷新保持空库并直接聊天导入', async ({
  page,
}) => {
  const intents: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/agent'))
      intents.push(request.postDataJSON().intent)
  })
  await openWorkspace(page)
  await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true')
  await expect(page.locator('.preview-panel .resume-example-note')).toHaveText(
    '示例简历 · 虚构内容，仅供体验',
  )
  await page.getByRole('button', { name: '我的简历库' }).click()
  await expect(page.locator('.library-card-actions .example-badge')).toHaveText(
    '示例简历',
  )
  const deleteExample = page.getByRole('button', {
    name: '删除简历：示例简历（林知夏）',
    exact: true,
  })
  await deleteExample.click()
  await page.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(page.locator('.resume-library-card')).toHaveCount(0)
  await expect(page.locator('.nav-count')).toHaveText('0')
  await expect(page.locator('.chat-root')).toHaveCount(0)
  await page.getByRole('button', { name: '撤销删除', exact: true }).click()
  await expect(page.locator('.resume-library-card')).toHaveCount(1)
  await deleteExample.click()
  await page.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(page.locator('.nav-count')).toHaveText('0')
  await page.reload()
  await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true')
  await expect(page.locator('.nav-count')).toHaveText('0')
  await expect(page.locator('.resume-paper')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: '删除当前简历' }),
  ).toBeDisabled()
  await expect(page.getByRole('button', { name: '撤销删除' })).toHaveCount(0)
  expect(intents).toEqual([])
  await page.getByRole('button', { name: /简历模板/ }).click()
  await expect(
    page.getByRole('heading', { name: '先创建一份简历' }),
  ).toBeVisible()
  await expect(page.locator('.resume-paper')).toHaveCount(0)
  await page.getByRole('button', { name: '简历 Agent', exact: true }).click()
  await page
    .getByRole('textbox', { name: '发送给 Folio' })
    .fill('陈星\n产品设计师\n负责设计工具的交互与视觉方案。')
  await page.getByRole('button', { name: '发送消息' }).click()
  await expect(page.locator('.nav-count')).toHaveText('1')
  await expect(page.locator('.preview-panel .resume-heading h1')).toHaveText(
    '陈星',
  )
  await expect(page.locator('.preview-panel .resume-paper')).not.toContainText(
    '山海科技',
  )
  await expect(page.locator('.resume-example-note')).toHaveCount(0)
  expect(intents).toEqual(['import'])
})

test('删除未选简历保留当前预览，画布删除切换来源，撤销恢复且编辑后失效', async ({
  page,
}) => {
  const { sampleResume } = await import('../src/domain/resume')
  await page.addInitScript((resume) => {
    localStorage.setItem(
      'folio:resumes:v1:guest',
      JSON.stringify([
        {
          ...resume,
          id: 'mine',
          name: '陈星',
          label: '我的履历',
          isExample: false,
        },
        resume,
        {
          ...resume,
          id: 'another',
          name: '周安',
          label: '另一份',
          isExample: false,
        },
      ]),
    )
  }, sampleResume)
  await openWorkspace(page)
  await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true')
  await page.getByRole('button', { name: '我的简历库' }).click()
  await page
    .getByRole('button', { name: '删除简历：示例简历（林知夏）' })
    .click()
  await page.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(page.locator('.resume-library-card')).toHaveCount(2)
  await page.getByRole('button', { name: '简历 Agent', exact: true }).click()
  await expect(page.locator('.preview-panel .resume-heading h1')).toHaveText(
    '陈星',
  )
  await page.getByRole('button', { name: '删除当前简历' }).click()
  await page.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(page.locator('.preview-panel .resume-heading h1')).toHaveText(
    '周安',
  )
  await expect(page.locator('.nav-count')).toHaveText('1')
  await page.getByRole('button', { name: '撤销删除', exact: true }).click()
  await expect(page.locator('.preview-panel .resume-heading h1')).toHaveText(
    '陈星',
  )
  await page.getByRole('button', { name: '删除当前简历' }).click()
  await page.getByRole('button', { name: '确认删除', exact: true }).click()
  await page.getByRole('button', { name: '编辑内容' }).click()
  await page.getByLabel('姓名', { exact: true }).fill('周安修改稿')
  await page.getByRole('button', { name: '我的简历库' }).click()
  await expect(page.getByRole('button', { name: '撤销删除' })).toHaveCount(0)
  await expect(page.locator('.resume-library-card')).toHaveCount(1)
})

test('删除账户最后一份后，访客数据不变且重新进入账户仍为空库', async ({
  page,
}) => {
  const { sampleResume } = await import('../src/domain/resume')
  let signedIn = true
  const now = new Date().toISOString()
  await page.addInitScript((resume) => {
    for (const scope of ['guest', 'user-delete']) {
      const key = `folio:resumes:v1:${scope}`
      if (localStorage.getItem(key) === null)
        localStorage.setItem(key, JSON.stringify([resume]))
    }
  }, sampleResume)
  await page.route('**/api/auth/get-session', (route) =>
    route.fulfill({
      json: signedIn
        ? {
            session: {
              id: 'delete-test-session',
              token: 'test-only',
              userId: 'user-delete',
              expiresAt: '2099-01-01T00:00:00.000Z',
              createdAt: now,
              updatedAt: now,
            },
            user: {
              id: 'user-delete',
              name: '删除测试',
              email: 'delete@example.com',
              emailVerified: true,
              createdAt: now,
              updatedAt: now,
            },
          }
        : null,
    }),
  )
  await page.route('**/api/auth/sign-out', (route) => {
    signedIn = false
    return route.fulfill({ json: { success: true } })
  })
  await openWorkspace(page)
  await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true')
  await page.getByRole('button', { name: '删除当前简历' }).click()
  await page.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(page.locator('.nav-count')).toHaveText('0')
  await page.getByRole('button', { name: '账户设置' }).click()
  await page.getByRole('button', { name: '退出登录' }).click()
  await expect(page.locator('.landing-page')).toBeVisible()
  await page.getByRole('button', { name: '试用示例' }).click()
  await expect(page.locator('.nav-count')).toHaveText('1')
  await expect(page.getByRole('button', { name: '撤销删除' })).toHaveCount(0)
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem('folio:resumes:v1:user-delete')!),
    ),
  ).toEqual([])
  signedIn = true
  await page.reload()
  await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true')
  await expect(page.locator('.nav-count')).toHaveText('0')
  await expect(page.locator('.resume-paper')).toHaveCount(0)
})

test('打开简历、返回聊天和切换模板不会重放已执行的生成命令', async ({
  page,
}) => {
  const agentRequests: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/agent'))
      agentRequests.push(request.postData() ?? '')
  })
  await openWorkspace(page)
  await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true')
  await resumeAction(page, '润色简历')
  await expect(page.getByText('本次草稿更新')).toBeVisible()
  await expect(page.locator('.nav-count')).toHaveText('1')

  await page.getByRole('button', { name: '我的简历库' }).click()
  await page.locator('.resume-library-card').last().click()
  await expect(page.locator('.chat-root')).toBeVisible()
  await expect(page.locator('.user-message')).toHaveCount(1)
  await expect(page.locator('.nav-count')).toHaveText('1')

  await page.getByRole('button', { name: '我的简历库' }).click()
  await page.getByRole('button', { name: '简历 Agent', exact: true }).click()
  await expect(page.locator('.chat-root')).toBeVisible()
  await expect(page.locator('.user-message')).toHaveCount(1)

  await page.getByRole('button', { name: /简历模板/ }).click()
  await page.getByRole('button', { name: /02 \/ 极简留白/ }).click()
  await expect(page.locator('.preview-panel .resume-paper')).toHaveClass(
    /minimal/,
  )
  await expect(page.locator('.user-message')).toHaveCount(1)
  await expect(page.locator('.nav-count')).toHaveText('1')
  await page.getByRole('button', { name: '我的简历库' }).click()
  await page.locator('.recent-list button').last().click()
  await expect(page.locator('.user-message')).toHaveCount(1)
  expect(agentRequests).toHaveLength(1)

  await resumeAction(page, '润色简历')
  await expect(page.locator('.nav-count')).toHaveText('1')
  await expect(page.getByText('本次草稿更新')).toBeVisible()
  await expect(page.getByRole('button', { name: '发送消息' })).toBeVisible()
  expect(agentRequests).toHaveLength(2)
})

test('已有完全重复副本可清理和撤销，保留不同投递版本并持久化', async ({
  page,
}) => {
  const { sampleResume } = await import('../src/domain/resume')
  let agentRequests = 0
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/agent'))
      agentRequests++
  })
  await page.addInitScript((resume) => {
    if (localStorage.getItem('folio:resumes:v1:guest')) return
    localStorage.setItem(
      'folio:resumes:v1:guest',
      JSON.stringify([
        resume,
        { ...resume, id: 'duplicate', updatedAt: '2026-11-15' },
        { ...resume, id: 'distinct-version', label: '另一份投递版本' },
      ]),
    )
  }, sampleResume)
  await openWorkspace(page)
  await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true')
  await page.getByRole('button', { name: '我的简历库' }).click()
  await expect(page.locator('.resume-library-card')).toHaveCount(3)
  await page.getByRole('button', { name: '清理 1 份重复副本' }).click()
  await expect(page.locator('.resume-library-card')).toHaveCount(3)
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('button', { name: '清理 1 份重复副本' }).click()
  await page.getByRole('button', { name: '确认清理', exact: true }).click()
  await expect(page.locator('.resume-library-card')).toHaveCount(2)
  await expect(page.locator('.nav-count')).toHaveText('2')
  await expect(
    page.locator('.library-card-caption strong').filter({
      hasText: '另一份投递版本',
    }),
  ).toBeVisible()
  await page.getByRole('button', { name: '撤销清理', exact: true }).click()
  await expect(page.locator('.resume-library-card')).toHaveCount(3)
  await page.getByRole('button', { name: '清理 1 份重复副本' }).click()
  await page.getByRole('button', { name: '确认清理', exact: true }).click()
  await page.locator('.resume-library-card').last().click()
  await page.getByRole('button', { name: '编辑内容' }).click()
  await page.getByLabel('姓名', { exact: true }).fill('修改后的姓名')
  await page.getByRole('button', { name: '我的简历库' }).click()
  await expect(page.getByRole('button', { name: '撤销清理' })).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true')
  await page.getByRole('button', { name: '我的简历库' }).click()
  await expect(page.locator('.resume-library-card')).toHaveCount(2)
  await expect(page.getByRole('button', { name: /份重复副本/ })).toHaveCount(0)
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem('folio:resumes:v1:guest')!).map(
        (resume: { id: string }) => resume.id,
      ),
    ),
  ).toEqual([sampleResume.id, 'distinct-version'])
  expect(agentRequests).toBe(0)
})
test('连续对话更新当前简历，JD 才新增，继续修改定制版不复制且刷新保留', async ({
  page,
}) => {
  const { sampleResume } = await import('../src/domain/resume')
  const other = { ...sampleResume, id: 'other-resume', label: '另一份简历' }
  await page.addInitScript(
    (resumes) => {
      if (!localStorage.getItem('folio:resumes:v1:guest'))
        localStorage.setItem('folio:resumes:v1:guest', JSON.stringify(resumes))
    },
    [sampleResume, other],
  )
  const requests: { intent: string; id: string }[] = []
  await page.route('**/api/agent', (route) => {
    const input = AgentRequestSchema.parse(route.request().postDataJSON())
    requests.push({ intent: input.intent, id: input.resume.id })
    const result = demoAgent(input)
    result.resume.summary = `第 ${requests.length} 次修改：${input.text}`
    return route.fulfill({ json: result })
  })
  await openWorkspace(page)
  const saved = () =>
    page.evaluate(() =>
      JSON.parse(localStorage.getItem('folio:resumes:v1:guest')!),
    )
  for (const text of ['帮我润色这份简历', '把简介写得更简洁', '保留真实经历']) {
    await page.getByRole('textbox', { name: '发送给 Folio' }).fill(text)
    await page.getByRole('button', { name: '发送消息' }).click()
    await expect(page.locator('.preview-panel .resume-paper')).toContainText(
      text,
    )
    await expect(page.locator('.nav-count')).toHaveText('2')
    const resumes = await saved()
    expect(resumes.map((r: { id: string }) => r.id)).toEqual([
      sampleResume.id,
      other.id,
    ])
    expect(resumes[0].label).toBe(sampleResume.label)
    expect(resumes[1]).toEqual(other)
  }
  expect(requests.map((r) => r.id)).toEqual(Array(3).fill(sampleResume.id))
  await resumeAction(page, '按岗位定制')
  await page.getByRole('button', { name: '填入示例' }).click()
  await page.getByRole('button', { name: '生成定制草稿' }).click()
  await expect(page.locator('.nav-count')).toHaveText('3')
  const before = await saved()
  const tailored = before[0]
  expect(tailored.id).not.toBe(sampleResume.id)
  await page
    .getByRole('textbox', { name: '发送给 Folio' })
    .fill('缩短定制版的简介')
  await page.getByRole('button', { name: '发送消息' }).click()
  await expect(page.locator('.preview-panel .resume-paper')).toContainText(
    '缩短定制版的简介',
  )
  await expect(page.locator('.nav-count')).toHaveText('3')
  const after = await saved()
  expect(after[0]).toMatchObject({ id: tailored.id, label: tailored.label })
  expect(after.slice(1)).toEqual(before.slice(1))
  expect(requests.at(-1)).toEqual({ intent: 'polish', id: tailored.id })
  await page.reload()
  await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true')
  await expect(page.locator('.nav-count')).toHaveText('3')
  expect(await saved()).toEqual(after)
})

test('聊天润色、JD 定制、编辑、持久化与模板切换', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await openWorkspace(page)
  await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true')
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight,
    ),
  ).toBe(true)
  await expect(page.locator('.composer-context')).toBeVisible()
  await resumeAction(page, '润色简历')
  await expect(page.getByText('本次草稿更新')).toBeVisible()
  await expect(page.locator('.nav-count')).toHaveText('1')
  await resumeAction(page, '按岗位定制')
  await page.getByRole('button', { name: '填入示例' }).click()
  await page.getByRole('button', { name: '生成定制草稿' }).click()
  await expect(page.locator('.missing-note')).toContainText('B2B SaaS')
  await expect(page.locator('.nav-count')).toHaveText('2')
  await page.getByRole('button', { name: '编辑内容' }).click()
  await page.getByLabel('姓名', { exact: true }).fill('陈小雨')
  await page.getByRole('button', { name: '预览', exact: true }).click()
  await expect(page.locator('.preview-panel .resume-heading h1')).toHaveText(
    '陈小雨',
  )
  await page.reload()
  await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true')
  await expect(page.locator('.preview-panel .resume-heading h1')).toHaveText(
    '陈小雨',
  )
  await page.getByRole('button', { name: '简历模板' }).click()
  await page.getByRole('button', { name: /02 \/ 极简留白/ }).click()
  await expect(page.locator('.preview-panel .resume-paper')).toHaveClass(
    /minimal/,
  )
  await page
    .getByRole('button', { name: '导出简历', exact: true })
    .first()
    .click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出结构化 JSON' }).click()
  expect((await download).suggestedFilename()).toContain('陈小雨')
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('.print-only')).toBeVisible()
  await expect(page.locator('.main-shell')).toBeHidden()
  await expect(page.locator('.print-only .resume-heading h1')).toHaveText(
    '陈小雨',
  )
  expect(errors).toEqual([])
})
test('导入新简历，跨视图检索与 JSON 文件导入', async ({ page }) => {
  await openWorkspace(page)
  await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true')
  let calls = 0
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/agent'))
      calls++
  })
  await page.locator('.import-prompt').click()
  await expect(page.getByRole('dialog', { name: '导入简历' })).toBeVisible()
  await page.keyboard.press('Escape')
  expect(calls).toBe(0)
  await expect(page.locator('.nav-count')).toHaveText('1')
  await expect(page.locator('.import-prompt')).toBeVisible()
  await page.locator('.import-prompt').click()
  await page.getByRole('button', { name: '填入示例' }).click()
  await page.getByRole('button', { name: '整理为简历' }).click()
  await expect(page.locator('.preview-panel .resume-heading h1')).toHaveText(
    '陈亦舟',
  )
  await expect(page.locator('.preview-panel .resume-paper')).not.toContainText(
    '山海科技',
  )
  await expect(page.locator('.import-prompt')).toHaveCount(0)
  await page.getByRole('button', { name: '开启新对话' }).click()
  await expect(page.locator('.user-message')).toHaveCount(0)
  await expect(page.locator('.import-prompt')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true')
  await expect(page.locator('.import-prompt')).toHaveCount(0)
  await page.getByRole('button', { name: '我的简历库' }).click()
  await page.getByPlaceholder('搜索姓名、职位或版本…').fill('陈亦舟')
  await expect(page.locator('.resume-library-card')).toHaveCount(1)
  await page.getByPlaceholder('搜索姓名、职位或版本…').fill('不存在的名字')
  await expect(
    page.getByRole('heading', { name: '没有找到这份简历' }),
  ).toBeVisible()
})
test('手机切换预览、弹窗键盘退出与页面无横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openWorkspace(page)
  await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true')
  await page.getByRole('button', { name: '简历预览', exact: true }).click()
  await expect(page.locator('.preview-panel')).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page
    .getByRole('button', { name: '导出简历', exact: true })
    .first()
    .click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
test('API 验证格式、限长和会话查询', async ({ request }) => {
  expect((await request.get('/api/config')).status()).toBe(200)
  expect(
    (
      await request.post('/api/agent', { data: { intent: 'unknown' } })
    ).status(),
  ).toBe(400)
  expect(
    (
      await request.post('/api/agent', {
        data: 'bad-json',
        headers: { 'Content-Type': 'application/json' },
      })
    ).status(),
  ).toBe(400)
  expect(
    (await request.post('/api/agent', { data: 'x'.repeat(100001) })).status(),
  ).toBe(413)
  expect((await request.get('/api/auth/get-session')).status()).toBe(200)
})

test('系统深色模式下聊天、侧栏和简历仍有清晰的浅色主题对比度', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await openWorkspace(page)
  await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true')
  await resumeAction(page, '润色简历')
  await expect(page.getByText('本次草稿更新')).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  for (const selector of [
    '.workspace-brand',
    '.sidebar nav button',
    '.composer-context',
    '.user-message',
    '.message-text',
    '.preview-panel .resume-heading h1',
  ]) {
    const contrast = await page
      .locator(selector)
      .first()
      .evaluate((element) => {
        const rgb = getComputedStyle(element).color.match(/\d+/g)!.map(Number)
        const luminance = (channels: number[]) =>
          channels
            .map((value) => {
              const channel = value / 255
              return channel <= 0.04045
                ? channel / 12.92
                : ((channel + 0.055) / 1.055) ** 2.4
            })
            .reduce(
              (sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i],
              0,
            )
        let parent: Element | null = element
        let background = [255, 255, 255]
        while (parent) {
          const color = getComputedStyle(parent).backgroundColor
          if (color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') {
            background = color
              .match(/[\d.]+/g)!
              .slice(0, 3)
              .map(Number)
            break
          }
          parent = parent.parentElement
        }
        const a = luminance(rgb)
        const b = luminance(background)
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
      })
    expect(contrast, `${selector} contrast`).toBeGreaterThanOrEqual(4.5)
  }
})

for (const outcome of ['success', 'failure', 'cancel'] as const) {
  test(`生成时仅一条助手等待消息，${outcome} 后无重复或空白消息`, async ({
    page,
  }) => {
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/api/agent', async (route) => {
      await pending
      if (outcome === 'cancel') {
        await route.abort().catch(() => {})
      } else if (outcome === 'failure') {
        await route.fulfill({
          status: 502,
          json: { error: '测试生成失败' },
        })
      } else {
        await route.fulfill({
          json: demoAgent(
            AgentRequestSchema.parse(route.request().postDataJSON()),
          ),
        })
      }
    })
    try {
      await openWorkspace(page)
      await resumeAction(page, '润色简历')
      await expect(page.getByRole('button', { name: '停止生成' })).toBeVisible()
      await expect(page.locator('.assistant-message')).toHaveCount(1)
      await expect(page.locator('.chat-scroll .agent-avatar')).toHaveCount(1)
      await expect(page.locator('.chat-scroll').getByRole('status')).toHaveText(
        '正在生成…',
      )
      await expect(page.locator('.assistant-message')).toContainText(
        '正在生成…',
      )
      if (outcome === 'cancel')
        await page.getByRole('button', { name: '停止生成' }).click()
    } finally {
      release()
    }
    await expect(page.getByRole('button', { name: '发送消息' })).toBeVisible()
    await expect(page.locator('.thinking')).toHaveCount(0)
    await expect(page.locator('.assistant-message')).toHaveCount(
      outcome === 'cancel' ? 0 : 1,
    )
    if (outcome === 'failure')
      await expect(page.locator('.message-text')).toHaveText('测试生成失败')
    await expect(page.locator('.nav-count')).toHaveText('1')
  })
}

test('Agent 失败时显示错误说明并保留原稿', async ({ page }) => {
  await page.route('**/api/agent', (route) =>
    route.fulfill({
      status: 502,
      json: { error: '模型服务调用失败。参考编号：test-reference' },
    }),
  )
  await openWorkspace(page)
  await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true')
  await resumeAction(page, '润色简历')
  await expect(page.locator('.message-text')).toContainText('test-reference')
  await expect(page.locator('.nav-count')).toHaveText('1')
  await expect(page.locator('.preview-panel .resume-heading h1')).toHaveText(
    '林知夏',
  )
})
test('取消生成保留原始简历', async ({ page }) => {
  await openWorkspace(page)
  await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true')
  await page.route('**/api/agent', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700))
    await route.abort().catch(() => {})
  })
  await resumeAction(page, '润色简历')
  await expect(page.getByRole('button', { name: '停止生成' })).toBeVisible()
  await page.getByRole('button', { name: '停止生成' }).click()
  await expect(page.getByRole('button', { name: '发送消息' })).toBeVisible()
  await expect(page.locator('.nav-count')).toHaveText('1')
  await expect(page.locator('.preview-panel .resume-heading h1')).toHaveText(
    '林知夏',
  )
})
test('JSON 备份重新导入，直接聊天识别新简历', async ({ page }) => {
  const { sampleResume } = await import('../src/domain/resume')
  await openWorkspace(page)
  await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true')
  await resumeAction(page, '导入简历')
  await page.locator('input[type=file]').setInputFiles({
    name: 'resume.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({ ...sampleResume, name: 'JSON 用户', label: '备份' }),
    ),
  })
  await expect(page.locator('.preview-panel .resume-heading h1')).toHaveText(
    'JSON 用户',
  )
  await page
    .getByRole('textbox', { name: '发送给 Folio' })
    .fill('赵山\nReact 工程师\nzhao@example.com\n使用 React 开发产品')
  await page.getByRole('button', { name: '发送消息' }).click()
  await expect(page.locator('.preview-panel .resume-heading h1')).toHaveText(
    '赵山',
  )
  await expect(page.locator('.preview-panel .resume-paper')).not.toContainText(
    '山海科技',
  )
  await page
    .getByRole('textbox', { name: '发送给 Folio' })
    .fill('帮我润色这份简历')
  await page.getByRole('button', { name: '发送消息' }).click()
  await expect(page.locator('.nav-count')).toHaveText('3')
  await expect(page.locator('.preview-panel .resume-heading h1')).toHaveText(
    '赵山',
  )
})
test('退出账户时不把账户简历写入访客分区', async ({ page }) => {
  const { sampleResume } = await import('../src/domain/resume')
  const now = new Date().toISOString()
  let signedIn = true
  await page.addInitScript(
    ({ resume }) => {
      localStorage.setItem(
        'folio:resumes:v1:guest',
        JSON.stringify([{ ...resume, name: '访客原稿' }]),
      )
      localStorage.setItem(
        'folio:resumes:v1:user-1',
        JSON.stringify([{ ...resume, name: '账户原稿' }]),
      )
    },
    { resume: sampleResume },
  )
  await page.route('**/api/auth/get-session', (route) =>
    route.fulfill({
      json: signedIn
        ? {
            session: {
              id: 'session-1',
              token: 'test-only',
              userId: 'user-1',
              expiresAt: '2099-01-01T00:00:00.000Z',
              createdAt: now,
              updatedAt: now,
            },
            user: {
              id: 'user-1',
              name: '测试账户',
              email: 'test@example.com',
              emailVerified: true,
              createdAt: now,
              updatedAt: now,
            },
          }
        : null,
    }),
  )
  await page.route('**/api/auth/sign-out', (route) => {
    signedIn = false
    return route.fulfill({ json: { success: true } })
  })
  await openWorkspace(page)
  await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true')
  await expect(page.locator('.preview-panel .resume-heading h1')).toHaveText(
    '账户原稿',
  )
  await page.getByRole('button', { name: '账户设置' }).click()
  await page.getByRole('button', { name: '退出登录' }).click()
  await expect(page.locator('.landing-page')).toBeVisible()
  await page.getByRole('button', { name: '试用示例' }).click()
  await expect(page.locator('.preview-panel .resume-heading h1')).toHaveText(
    '访客原稿',
  )
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('folio:resumes:v1:user-1')!)[0].name,
    ),
  ).toBe('账户原稿')
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('folio:resumes:v1:guest')!)[0].name,
    ),
  ).toBe('访客原稿')
})
