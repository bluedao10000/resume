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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const address = email.trim().toLowerCase()
      if (!sent) {
        const sentAt = Date.now()
        const result = await authClient.emailOtp.sendVerificationOtp({
          email: address,
          type: 'sign-in',
        })
        if (result.error) {
          setError('验证码发送失败，请稍后重试。')
          return
        }
        savePendingEmailLogin(address, sentAt)
        setEmail(address)
        setSent(true)
        return
      }

      const result = await authClient.signIn.emailOtp({ email: address, otp })
      if (result.error) {
        setError('验证码校验失败，请检查验证码或重新发送。')
        return
      }
      clearPendingEmailLogin()
      window.location.assign('/auth/callback')
    } catch {
      setError('无法连接登录服务，请重试。')
    } finally {
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
          <p role="status">验证码已发送，5 分钟内有效。</p>
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
              required
            />
          </label>
        </>
      )}
      <div className="landing-actions">
        <button className="primary-button" disabled={busy}>
          {sent ? '验证并登录' : '发送验证码'}
        </button>
        {sent && (
          <button
            type="button"
            className="outline-button"
            disabled={busy}
            onClick={() => {
              clearPendingEmailLogin()
              setSent(false)
              setOtp('')
              setError('')
            }}
          >
            修改邮箱或重发
          </button>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
    </form>
  )
}
