import { test, expect } from '@playwright/test'
import { AgentRequestSchema, demoAgent } from '../src/domain/resume'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/config', (route) =>
    route.fulfill({
      json: { mode: 'demo', authConfigured: false },
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

test('新对话图示引导复用操作，保留输入，发送后收起，刷新不重放', async ({
  page,
}) => {
  let requests = 0
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/agent'))
      requests++
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.getByRole('button', { name: '试用示例' }).click()
  const guide = page.getByRole('region', { name: '简历使用引导' })
  const input = page.getByRole('textbox', { name: '发送给 Folio' })
  await expect(guide).toBeVisible()
  const original = await page.evaluate(() =>
    localStorage.getItem('folio:resumes:v1:guest'),
  )
  await page.screenshot({ path: '/tmp/folio-chat-welcome-desktop.png' })
  await guide.getByRole('button', { name: /导入已有简历/ }).click()
  await expect(page.getByRole('dialog', { name: '导入简历' })).toBeVisible()
  await page.keyboard.press('Escape')
  await guide.getByRole('button', { name: /按 JD 定制投递版本/ }).click()
  await expect(page.getByRole('dialog', { name: /岗位/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await guide.getByRole('button', { name: /用对话修改简历/ }).click()
  await expect(input).toBeFocused()
  await expect(input).toHaveValue('帮我精简个人简介，保留真实经历和核心优势。')
  await input.fill('我还没写完的修改要求')
  await guide.getByRole('button', { name: /用对话修改简历/ }).click()
  await expect(input).toHaveValue('我还没写完的修改要求')
  expect(requests).toBe(0)
  expect(
    await page.evaluate(() => localStorage.getItem('folio:resumes:v1:guest')),
  ).toBe(original)
  await input.fill('帮我精简个人简介')
  await page.getByRole('button', { name: '发送消息' }).click()
  await expect(guide).toHaveCount(0)
  await expect(page.locator('.message-text')).toBeVisible()
  await page.reload()
  await expect(page.locator('.user-message')).toHaveText('帮我精简个人简介')
  await expect(guide).toHaveCount(0)
  expect(requests).toBe(1)
  await page.getByRole('button', { name: '开启新对话' }).click()
  await expect(guide).toBeVisible()
  expect(requests).toBe(1)
})

test('空库与手机引导不遮挡输入框，未导入时禁用修改和定制', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('folio:resumes:v1:guest', '[]'),
  )
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: '试用示例' }).click()
  const guide = page.getByRole('region', { name: '简历使用引导' })
  await expect(guide).toBeVisible()
  await expect(
    guide.getByRole('button', { name: /用对话修改简历/ }),
  ).toBeDisabled()
  await expect(
    guide.getByRole('button', { name: /按 JD 定制投递版本/ }),
  ).toBeDisabled()
  await page.screenshot({ path: '/tmp/folio-chat-welcome-mobile.png' })
  for (const height of [844, 420]) {
    await page.setViewportSize({ width: 390, height })
    await expect(
      page.getByRole('textbox', { name: '发送给 Folio' }),
    ).toBeInViewport()
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth &&
          document.documentElement.scrollHeight <= innerHeight,
      ),
    ).toBe(true)
  }
  await page.locator('.chat-scroll').evaluate((element) => {
    element.scrollTop = 0
  })
  await guide.getByRole('button', { name: /导入已有简历/ }).click()
  await expect(page.getByRole('dialog', { name: '导入简历' })).toBeVisible()
})
