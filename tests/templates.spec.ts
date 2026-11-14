import { expect, test, type Page } from '@playwright/test'
import {
  AgentRequestSchema,
  demoAgent,
  sampleResume,
} from '../src/domain/resume'
import { resumeTemplates } from '../src/domain/resume-presentation'

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
async function workspace(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: '试用示例' }).click()
  await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true')
}
async function saved(page: Page) {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem('folio:resumes:v1:guest')!),
  )
}

test('四套模板显示不同排版，切换保持正文、顺序和身份且不请求 Agent', async ({
  page,
}) => {
  let calls = 0
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/agent'))
      calls++
  })
  await workspace(page)
  const original = (await saved(page))[0]
  for (const { id, name, presentation } of resumeTemplates) {
    await page.getByRole('button', { name: '简历模板', exact: true }).click()
    await expect(page.locator('.template-card')).toHaveCount(4)
    await page.getByRole('button', { name: new RegExp(`/ ${name}`) }).click()
    const paper = page.locator('.preview-panel .resume-paper')
    await expect(paper).toHaveClass(new RegExp(id))
    await expect(paper).toHaveAttribute('data-skills', presentation.skills)
    await expect(paper).toHaveAttribute(
      'data-experience',
      presentation.experience,
    )
    const current = (await saved(page))[0]
    expect(current).toMatchObject({
      id: original.id,
      summary: original.summary,
      experience: original.experience,
      skills: original.skills,
      isExample: true,
    })
    expect(current.sectionOrder).toEqual(original.sectionOrder)
    expect(await saved(page)).toHaveLength(1)
  }
  expect(calls).toBe(0)
  await page.screenshot({
    path: '.wrangler/templates-technical-desktop.png',
    fullPage: true,
  })
  await page.getByRole('button', { name: '简历模板', exact: true }).click()
  await page.screenshot({
    path: '.wrangler/templates-gallery-desktop.png',
    fullPage: true,
  })
})

test('局部排版同步预览、刷新、打印与 JSON 备份，恢复预设不改写内容', async ({
  page,
}) => {
  await workspace(page)
  await page.getByRole('button', { name: '简历模板', exact: true }).click()
  await page.getByLabel('个人简介', { exact: true }).selectOption('inset')
  await page.getByLabel('专业技能', { exact: true }).selectOption('columns')
  await page.getByLabel('工作要点', { exact: true }).selectOption('ruled')
  await page.getByLabel('排版密度', { exact: true }).selectOption('compact')
  await page.getByRole('button', { name: '查看简历', exact: true }).click()
  const paper = page.locator('.preview-panel .resume-paper')
  await expect(paper).toHaveAttribute('data-summary', 'inset')
  await expect(paper).toHaveAttribute('data-skills', 'columns')
  await expect(paper).toHaveAttribute('data-experience', 'ruled')
  await expect(paper).toHaveAttribute('data-density', 'compact')
  const original = (await saved(page))[0]
  await page.reload()
  await expect(paper).toHaveAttribute('data-skills', 'columns')
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('.print-only .resume-paper')).toHaveAttribute(
    'data-summary',
    'inset',
  )
  expect(
    await page
      .locator('.print-only .resume-bullets')
      .first()
      .evaluate((e) => getComputedStyle(e).listStyleType),
  ).toBe('none')
  await page.emulateMedia({ media: 'screen' })
  await page
    .locator('.preview-panel')
    .getByLabel('导出简历', { exact: true })
    .click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /导出结构化 JSON/ }).click()
  const download = await downloadPromise
  const { readFile } = await import('node:fs/promises')
  const backup = JSON.parse(await readFile((await download.path())!, 'utf8'))
  expect(backup.presentation).toEqual(original.presentation)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '简历模板', exact: true }).click()
  await page.getByRole('button', { name: '恢复模板排版', exact: true }).click()
  await expect(page.getByLabel('专业技能', { exact: true })).toHaveValue('tags')
  const reset = (await saved(page))[0]
  expect(reset.presentation).toBeUndefined()
  expect(reset.summary).toBe(original.summary)
})

test('通过聊天实际改变排版，普通润色不覆盖手工设置，不创建副本', async ({
  page,
}) => {
  await workspace(page)
  const input = page.getByRole('textbox', { name: '发送给 Folio' })
  await input.fill('使用技术清单模板，专业技能使用双列，排版紧凑')
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  await expect(page.locator('.preview-panel .resume-paper')).toHaveClass(
    /technical/,
  )
  await expect(page.locator('.message-text')).toContainText('已更新')
  await input.fill('帮我润色这份简历')
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  await expect(page.locator('.preview-panel .resume-paper')).toHaveAttribute(
    'data-skills',
    'columns',
  )
  await expect(page.locator('.nav-count')).toHaveText('1')
  expect((await saved(page))[0].id).toBe(sampleResume.id)
})

test('手机模板与双列长技能不溢出，空章节隐藏，长经历打印允许跨页', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(
    (resume) =>
      localStorage.setItem('folio:resumes:v1:guest', JSON.stringify([resume])),
    {
      ...sampleResume,
      template: 'technical',
      summary: '',
      location: '',
      email: '',
      skills: [
        '**后端技术**：' + 'LongTechnologyName'.repeat(12),
        '**工具链**：Git / Linux',
      ],
      experience: [
        {
          ...sampleResume.experience[0],
          bullets: Array.from(
            { length: 12 },
            (_, i) =>
              `要点 ${i + 1} **分布式架构** ` + '真实工作内容。'.repeat(25),
          ),
        },
      ],
    },
  )
  await workspace(page)
  await page.getByRole('button', { name: '简历模板', exact: true }).click()
  await expect(page.locator('.template-card')).toHaveCount(4)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: '.wrangler/templates-mobile.png',
    fullPage: true,
  })
  await page.getByRole('button', { name: '查看简历', exact: true }).click()
  await expect(page.locator('.preview-panel .resume-contact')).toHaveCount(0)
  await expect(page.locator('.preview-panel .resume-summary')).toHaveCount(0)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.emulateMedia({ media: 'print' })
  expect(
    await page
      .locator('.print-only .resume-job')
      .evaluate((e) => getComputedStyle(e).breakInside),
  ).toBe('auto')
  await expect(page.locator('.print-only .resume-bullets > li')).toHaveCount(12)
  const pdf = await page.pdf({
    path: '.wrangler/templates-long.pdf',
    preferCSSPageSize: true,
    printBackground: true,
  })
  expect(
    pdf.toString('latin1').match(/\/Type \/Page\b/g)!.length,
  ).toBeGreaterThan(1)
})
