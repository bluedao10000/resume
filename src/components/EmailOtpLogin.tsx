import { useEffect, useRef, useState, type FormEvent } from 'react'
import { authClient } from '../lib/auth-client'
import {
  clearPendingEmailLogin,
  readPendingEmailLogin,
  savePendingEmailLogin,
} from '../lib/email-login-state'

export function EmailOtpLogin() {
  const emailInput = useRef<HTMLInputElement>(null)
  const codeInput = useRef<HTMLInputElement>(null)
  const [pending] = useState(readPendingEmailLogin)
  const [email, setEmail] = useState(pending?.email ?? '')
  const [otp, setOtp] = useState('')
  const request = useRef<AbortController | null>(null)
  const [expiresAt, setExpiresAt] = useState(pending?.expiresAt ?? 0)
  const [now, setNow] = useState(Date.now)
  const remaining = Math.max(0, Math.ceil((expiresAt - now) / 1000))
  const [sent, setSent] = useState(!!pending)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const input = sent ? codeInput.current : emailInput.current
      input?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [sent])

  useEffect(() => () => request.current?.abort(), [])
  useEffect(() => {
    if (!expiresAt) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [expiresAt])

  async function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    if (request.current || (event && sent && Date.now() >= expiresAt)) return
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    setError('')
    try {
      const address = email.trim().toLowerCase()
      if (!sent || !event) {
        const sentAt = Date.now()
        const result = await authClient.emailOtp.sendVerificationOtp(
          {
            email: address,
            type: 'sign-in',
          },
          { signal: controller.signal },
        )
        if (controller.signal.aborted) return
        if (result.error) {
          setError('验证码发送失败，请稍后重试。')
          return
        }
        savePendingEmailLogin(address, sentAt)
        setEmail(address)
        setSent(true)
        setOtp('')
        setNow(sentAt)
        setExpiresAt(sentAt + 300_000)
        codeInput.current?.focus()
        return
      }

      const result = await authClient.signIn.emailOtp(
        { email: address, otp },
        { signal: controller.signal },
      )
      if (controller.signal.aborted) return
      if (result.error) {
        setError('验证码校验失败，请检查验证码或重新发送。')
        return
      }
      clearPendingEmailLogin()
      window.location.assign('/auth/callback')
    } catch {
      if (!controller.signal.aborted) setError('无法连接登录服务，请重试。')
    } finally {
      request.current = null
      setBusy(false)
    }
  }

  return (
    <form className="landing-email-login" onSubmit={submit}>
      <label>
        邮箱
        <input
          ref={emailInput}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          readOnly={sent || busy}
          required
        />
      </label>
      {sent && (
        <>
          <p role="status">
            {remaining
              ? '验证码已发送，请查收。'
              : '验证码已过期，请重新发送。'}
          </p>
          {remaining > 0 && (
            <p className="login-countdown">
              有效期还剩 {Math.floor(remaining / 60)}:
              {String(remaining % 60).padStart(2, '0')}
            </p>
          )}
          <label>
            验证码
            <input
              ref={codeInput}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={otp}
              onChange={(event) => setOtp(event.target.value)}
              readOnly={busy}
              required
            />
          </label>
        </>
      )}
      <div className="landing-actions">
        <button
          className="primary-button"
          disabled={busy || (sent && !remaining)}
        >
          {busy ? '处理中…' : sent ? '验证并登录' : '发送验证码'}
        </button>
        {sent && (
          <button
            type="button"
            className="outline-button"
            disabled={busy || remaining > 240}
            onClick={() => void submit()}
          >
            重新发送
          </button>
        )}
        {sent && (
          <button
            type="button"
            className="outline-button"
            disabled={busy}
            onClick={() => {
              clearPendingEmailLogin()
              setSent(false)
              setExpiresAt(0)
              setOtp('')
              setError('')
            }}
          >
            修改邮箱
          </button>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
    </form>
  )
}
