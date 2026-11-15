import { useState } from 'react'
import { EmailOtpLogin } from './EmailOtpLogin'
import { readPendingEmailLogin } from '../lib/email-login-state'

export type SocialProvider = 'github' | 'wechat' | 'google'

const socialLabels = {
  github: '使用 GitHub 登录',
  wechat: '使用微信登录',
  google: '使用 Google 登录',
} satisfies Record<SocialProvider, string>

export function LoginMethods({
  social,
  email,
  busy,
  error,
  onLogin,
}: {
  social: SocialProvider[]
  email: boolean
  busy: boolean
  error: string
  onLogin: (provider: SocialProvider) => void
}) {
  const [emailOpen, setEmailOpen] = useState(
    () => email && !!readPendingEmailLogin(),
  )
  return (
    <div className="login-methods">
      {social.map((provider) => (
        <button
          key={provider}
          type="button"
          className="outline-button"
          disabled={busy}
          onClick={() => onLogin(provider)}
        >
          {socialLabels[provider]}
        </button>
      ))}
      {email ? (
        <button
          className="outline-button"
          type="button"
          aria-expanded={emailOpen}
          disabled={busy}
          onClick={() => setEmailOpen((open) => !open)}
        >
          邮箱验证码登录
        </button>
      ) : null}
      {emailOpen && email ? <EmailOtpLogin /> : null}
      {!email && !social.length ? <p>登录暂不可用，请稍后重试。</p> : null}
      {busy ? <p role="status">正在连接登录服务…</p> : null}
      {error ? (
        <p className="landing-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
