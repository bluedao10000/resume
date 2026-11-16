import { expect, test } from '@playwright/test'

const wechatURL =
  'https://open.weixin.qq.com/connect/qrconnect?appid=wx-fixture&scope=snsapi_login&state=fixture&redirect_uri=http%3A%2F%2Flocalhost%3A5173%2Fapi%2Fauth%2Fcallback%2Fwechat#wechat_redirect'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/config', (route) =>
    route.fulfill({
      json: {
        mode: 'live',
        market: 'cn',
        authConfigured: true,
        authMethods: { market: true, github: true, email: true },
      },
    }),
  )
})

for (const width of [1440, 390]) {
  test(`login options fit at ${width}px and Escape restores focus`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    const start = page
      .locator('.landing-intro')
      .getByRole('button', { name: '开始定制简历' })
    await start.click()
    const dialog = page.getByRole('dialog', { name: '登录 Folio' })
    for (const name of ['使用微信登录', '使用 GitHub 登录', '邮箱验证码登录']) {
      await expect(dialog.getByRole('button', { name })).toBeVisible()
    }
    expect(
      await dialog.evaluate((el) => ({
        width: el.getBoundingClientRect().width,
        overflow: el.scrollWidth > el.clientWidth,
      })),
    ).toEqual({ width: Math.min(440, width - 32), overflow: false })
    if (process.env.FOLIO_LOGIN_SCREENSHOTS) {
      await page.screenshot({
        path: `${process.env.FOLIO_LOGIN_SCREENSHOTS}/folio-login-${width}.png`,
        animations: 'disabled',
      })
    }
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(start).toBeFocused()
  })
}

test('WeChat QR reports readiness, expires and retries without accepting a message as login', async ({
  page,
}) => {
  await page.clock.install()
  let attempts = 0
  await page.route('**/api/auth/sign-in/social', (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      provider: 'wechat',
      disableRedirect: true,
      callbackURL: '/',
    })
    attempts++
    return route.fulfill({ json: { url: wechatURL, redirect: false } })
  })
  await page.route(
    'https://open.weixin.qq.com/connect/qrconnect?*',
    (route) => {
      expect(
        new URL(route.request().url()).searchParams.get('self_redirect'),
      ).toBe('false')
      return route.fulfill({
        contentType: 'text/html',
        body:
          attempts === 1
            ? '<script>parent.postMessage(JSON.stringify({type:"status",status:"wxQRcodeReady"}),"*")</script>'
            : '',
      })
    },
  )
  await page.goto('/')
  await page
    .locator('.landing-intro')
    .getByRole('button', { name: '开始定制简历' })
    .click()
  const dialog = page.getByRole('dialog', { name: '登录 Folio' })
  await dialog.getByRole('button', { name: '使用微信登录' }).click()
  await expect(dialog.getByText('请使用微信扫码并在手机上确认。')).toBeVisible()
  await page.clock.fastForward(241_000)
  await expect(
    dialog.getByText('二维码等待时间已结束，请重新获取。'),
  ).toBeVisible()
  await dialog.getByRole('button', { name: '重新获取二维码' }).click()
  await expect(dialog.getByText('正在加载微信二维码…')).toBeVisible()
  await page.clock.fastForward(16_000)
  await expect(
    dialog.getByText('未能加载微信二维码，请重试或打开微信授权页。'),
  ).toBeVisible()
  await expect(
    dialog.getByRole('link', { name: '打开微信授权页' }),
  ).toHaveAttribute('href', wechatURL)
  await expect(page).toHaveURL('/')
})

test('GitHub shows pending status and follows the existing OAuth redirect', async ({
  page,
}) => {
  const githubURL =
    'https://github.com/login/oauth/authorize?client_id=fixture&state=fixture'
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/auth/sign-in/social', async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      provider: 'github',
      callbackURL: '/auth/callback',
    })
    await pending
    await route.fulfill({ json: { url: githubURL, redirect: false } })
  })
  await page.route('https://github.com/login/oauth/authorize?*', (route) =>
    route.fulfill({ body: 'GitHub OAuth fixture' }),
  )
  await page.goto('/')
  await page
    .locator('.landing-intro')
    .getByRole('button', { name: '开始定制简历' })
    .click()
  const dialog = page.getByRole('dialog', { name: '登录 Folio' })
  await dialog.getByRole('button', { name: '使用 GitHub 登录' }).click()
  await expect(dialog.getByRole('status')).toContainText('正在连接 GitHub')
  await expect(
    dialog.getByRole('button', { name: '使用微信登录' }),
  ).toBeDisabled()
  release()
  await expect(page).toHaveURL(githubURL)
})

test('email code expires, resends and returns focus to the method', async ({
  page,
}) => {
  await page.clock.install()
  let sends = 0
  await page.route('**/api/auth/email-otp/send-verification-otp', (route) => {
    sends++
    return route.fulfill({ json: { success: true } })
  })
  await page.goto('/')
  await page
    .locator('.landing-intro')
    .getByRole('button', { name: '开始定制简历' })
    .click()
  const dialog = page.getByRole('dialog', { name: '登录 Folio' })
  const method = dialog.getByRole('button', { name: '邮箱验证码登录' })
  await method.click()
  await dialog
    .getByRole('textbox', { name: '邮箱' })
    .fill('fixture@example.com')
  await dialog.getByRole('button', { name: '发送验证码' }).click()
  await expect(dialog.getByRole('button', { name: '重新发送' })).toBeDisabled()
  await page.clock.fastForward(301_000)
  await expect(dialog.getByRole('status')).toContainText('验证码已过期')
  await expect(
    dialog.getByRole('button', { name: '验证并登录' }),
  ).toBeDisabled()
  await dialog.getByRole('button', { name: '重新发送' }).click()
  await expect(dialog.getByRole('status')).toContainText('验证码已发送')
  expect(sends).toBe(2)
  await dialog.getByRole('button', { name: '返回登录方式' }).click()
  await expect(method).toBeFocused()
})
