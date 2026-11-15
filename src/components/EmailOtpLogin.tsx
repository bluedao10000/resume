import { useState, type FormEvent } from 'react'
import { authClient } from '../lib/auth-client'

export function EmailOtpLogin() {
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const address = email.trim().toLowerCase()
      if (!sent) {
        const result = await authClient.emailOtp.sendVerificationOtp({
          email: address,
          type: 'sign-in',
        })
        if (result.error) {
          setError('验证码发送失败，请稍后重试。')
          return
        }
        setSent(true)
        return
      }

      const result = await authClient.signIn.emailOtp({ email: address, otp })
      if (result.error) {
        setError('验证码校验失败，请检查验证码或重新发送。')
        return
      }
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
