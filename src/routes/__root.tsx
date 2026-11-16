import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from '@tanstack/react-router'
import { Theme } from '@astryxdesign/core/theme'
import { neutralTheme } from '@astryxdesign/theme-neutral/built'
import css from '../styles.css?url'
export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Folio · 简历工作台' },
      { name: 'description', content: '在对话中整理经历，按岗位调整简历。' },
    ],
    links: [
      { rel: 'stylesheet', href: css },
      { rel: 'icon', type: 'image/svg+xml', href: '/folio.svg' },
      { rel: 'apple-touch-icon', sizes: '144x144', href: '/folio-144.png' },
    ],
  }),
  component: () => (
    <html lang="zh-CN" data-theme="light">
      <head>
        <HeadContent />
      </head>
      <body>
        <Theme theme={neutralTheme} mode="light">
          <Outlet />
        </Theme>
        <Scripts />
      </body>
    </html>
  ),
  notFoundComponent: () => (
    <main className="empty">
      <h1>页面不在这里</h1>
      <a href="/">返回工作台</a>
    </main>
  ),
})
