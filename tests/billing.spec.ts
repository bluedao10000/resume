import { test, expect } from '@playwright/test'
const catalog = [
  { id: 'free', name: 'Free', monthlyCents: 0, credits: 10 },
  { id: 'plus', name: 'Plus', monthlyCents: 1000, credits: 125 },
  { id: 'pro', name: 'Pro', monthlyCents: 5000, credits: 625 },
]
const summary = {
  plan: 'free',
  periodStart: Date.UTC(2026, 10, 1),
  periodEnd: Date.UTC(2026, 11, 1),
  allowance: 10000000,
  used: 750000,
  reserved: 1000000,
  remaining: 8250000,
  tokens: { input: 10000, output: 1000, cacheRead: 1000, cacheWrite: 0 },
  paymentConfigured: false,
  canManage: false,
  cancelAtPeriodEnd: false,
  plans: catalog,
  tariff: {
    version: 'fixture',
    model: 'fixture',
    input: 50000000,
    output: 250000000,
    cacheRead: 2500000,
    cacheWrite: 62500000,
  },
}
test.beforeEach(async ({ page }) => {
  await page.route('**/api/config', (route) =>
    route.fulfill({ json: { mode: 'live', authConfigured: true } }),
  )
  const date = new Date().toISOString()
  await page.route('**/api/auth/get-session', (route) =>
    route.fulfill({
      json: {
        session: {
          id: 's',
          token: 'fixture',
          userId: 'billing-user',
          expiresAt: '2099-01-01T00:00:00Z',
          createdAt: date,
          updatedAt: date,
        },
        user: {
          id: 'billing-user',
          name: '测试账户',
          email: 'fixture@example.com',
          emailVerified: true,
          createdAt: date,
          updatedAt: date,
        },
      },
    }),
  )
  await page.route('**/api/billing/', (route) =>
    route.fulfill({ json: summary }),
  )
})
test('三档价格、真实用量与禁用支付，支付回跳不能授予套餐', async ({ page }) => {
  await page.goto('/?billing=success')
  const panel = page.getByRole('dialog', { name: '套餐与用量' })
  await expect(panel).toBeVisible()
  for (const [name, price] of [
    ['Free', '$0'],
    ['Plus', '$10'],
    ['Pro', '$50'],
  ])
    await expect(
      panel.getByRole('region', { name: `${name} 套餐` }),
    ).toContainText(price)
  await expect(panel.getByRole('region', { name: 'Free 套餐' })).toContainText(
    '当前套餐',
  )
  await expect(panel.getByRole('progressbar')).toHaveAttribute(
    'value',
    '750000',
  )
  await expect(panel).toContainText('可用 8.25 credits')
  await expect(panel).toContainText('在线支付尚未开通')
  await expect(
    panel.getByRole('button', { name: '升级到 Plus' }),
  ).toBeDisabled()
  await panel.getByText('Token 用量与计费规则', { exact: true }).click()
  await expect(panel).toContainText('10,000 tokens')
  await expect(panel).toContainText('输出（含推理）')
  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: '.wrangler/billing-mobile.png',
    fullPage: true,
  })
})
test('本期暂无已结算用量，刷新后在展开的明细中显示真实 Token', async ({
  page,
}) => {
  let settled = false
  await page.route('**/api/billing/', (route) =>
    route.fulfill({
      json: settled
        ? summary
        : {
            ...summary,
            used: 0,
            tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          },
    }),
  )
  await page.goto('/?billing=success')
  const panel = page.getByRole('dialog', { name: '套餐与用量' })
  await panel.getByText('Token 用量与计费规则', { exact: true }).click()
  await expect(
    panel.getByText('本期暂无已结算 Token', { exact: false }),
  ).toBeVisible()
  settled = true
  await panel.getByRole('button', { name: '刷新用量' }).click()
  await expect(panel.getByText('10,000 tokens', { exact: true })).toBeVisible()
})

test('结账失败保留 Free，额度不足保留简历', async ({ page }) => {
  await page.route('**/api/billing/', (route) =>
    route.fulfill({ json: { ...summary, paymentConfigured: true } }),
  )
  await page.route('**/api/billing/checkout', (route) =>
    route.fulfill({ status: 502, json: { error: '支付服务暂时不可用' } }),
  )
  await page.route('**/api/agent', (route) =>
    route.fulfill({
      status: 402,
      json: { error: '本期可用额度不足，请升级套餐或等待下期重置。' },
    }),
  )
  await page.goto('/')
  await page.getByRole('button', { name: '套餐与用量' }).click()
  const panel = page.getByRole('dialog', { name: '套餐与用量' })
  await panel.getByRole('button', { name: '升级到 Plus' }).click()
  await expect(panel.getByRole('alert')).toContainText('支付服务暂时不可用')
  await expect(panel.getByRole('region', { name: 'Free 套餐' })).toContainText(
    '当前套餐',
  )
  await page.keyboard.press('Escape')
  await page.getByRole('textbox', { name: '发送给 Folio' }).fill('润色这份简历')
  await page.getByRole('button', { name: '发送消息' }).click()
  await expect(page.locator('.message-text')).toContainText('本期可用额度不足')
  await expect(page.locator('.nav-count')).toHaveText('1')
  await expect(page.locator('.preview-panel .resume-heading h1')).toHaveText(
    '林知夏',
  )
})
test('用量读取失败可重试，不显示错误套餐', async ({ page }) => {
  let fail = true
  await page.route('**/api/billing/', (route) =>
    route.fulfill(
      fail
        ? { status: 503, json: { error: '暂时无法读取' } }
        : { json: summary },
    ),
  )
  await page.goto('/?billing=return')
  await expect(page.getByRole('alert')).toContainText('暂时无法读取')
  await expect(page.getByRole('button', { name: '升级到 Plus' })).toHaveCount(0)
  fail = false
  await page.getByRole('button', { name: '重新读取' }).click()
  await expect(page.getByRole('region', { name: 'Free 套餐' })).toContainText(
    '当前套餐',
  )
})

test('国内套餐显示人民币，扫码订单可恢复，查单后刷新权益', async ({ page }) => {
  const cnPlans = catalog.map((plan, i) => ({
    ...plan,
    monthlyCents: [0, 2000, 9900][i],
  }))
  const order = {
    plan: 'plus',
    totalFen: 2000,
    expiresAt: Date.now() + 15 * 60000,
    qr: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX3cAAAAASUVORK5CYII=',
  }
  let pending = false
  let paid = false
  await page.route('**/api/config', (route) =>
    route.fulfill({
      json: { mode: 'live', market: 'cn', authConfigured: true },
    }),
  )
  await page.route('**/api/billing/', (route) =>
    route.fulfill({
      json: {
        ...summary,
        plans: cnPlans,
        paymentConfigured: true,
        plan: paid ? 'plus' : 'free',
      },
    }),
  )
  await page.route('**/api/billing/checkout', (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON()
      if (body.check) {
        paid = true
        pending = false
      } else {
        expect(body).toEqual({ plan: 'plus' })
        pending = true
      }
    }
    return route.fulfill({ json: { order: pending ? order : null } })
  })
  await page.goto('/?billing=success')
  const panel = page.getByRole('dialog', { name: '套餐与用量' })
  await expect(panel.getByRole('region', { name: 'Plus 套餐' })).toContainText(
    '¥20',
  )
  await panel.getByRole('button', { name: '微信支付购买 Plus' }).click()
  await expect(panel.getByRole('img', { name: '微信支付二维码' })).toBeVisible()
  await page.reload()
  await expect(panel.getByRole('img', { name: '微信支付二维码' })).toBeVisible()
  await panel.getByRole('button', { name: '查询支付结果' }).click()
  await expect(panel.getByRole('region', { name: 'Plus 套餐' })).toContainText(
    '当前套餐',
  )
  await expect(panel.getByRole('img', { name: '微信支付二维码' })).toHaveCount(
    0,
  )
})
