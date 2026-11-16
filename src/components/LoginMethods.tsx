import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Mail } from 'lucide-react'
import { EmailOtpLogin } from './EmailOtpLogin'
import { readPendingEmailLogin } from '../lib/email-login-state'

export type SocialProvider = 'github' | 'wechat' | 'google'
export type SocialLogin = (
  provider: SocialProvider,
  signal?: AbortSignal,
) => Promise<string | void>

const socialLabels = {
  github: '使用 GitHub 登录',
  wechat: '使用微信登录',
  google: '使用 Google 登录',
}

const wechatOrigin = 'https://open.weixin.qq.com'

export function LoginMethods({
  social,
  email,
  busy,
  error,
  onLogin,
  china,
}: {
  social: SocialProvider[]
  email: boolean
  busy: SocialProvider | null
  error: string
  onLogin: SocialLogin
  china: boolean
}) {
  const [emailOpen, setEmailOpen] = useState(
    () => email && !!readPendingEmailLogin(),
  )
  const [qr, setQr] = useState<{ url: string; embedded: string } | null>(null)
  const [qrStatus, setQrStatus] = useState<
    'loading' | 'ready' | 'expired' | 'failed'
  >('loading')
  const [localError, setLocalError] = useState('')
  const [policy, setPolicy] = useState<'terms' | 'privacy' | null>(null)
  const request = useRef<AbortController | null>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const back = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef<
    SocialProvider | 'email' | 'terms' | 'privacy' | null
  >(null)
  const methods = useRef<HTMLDivElement>(null)
  const subview = emailOpen || !!qr || !!policy

  useEffect(() => () => request.current?.abort(), [])
  useEffect(() => {
    if (qr || policy) back.current?.focus()
    if (!subview && restoreFocus.current) {
      methods.current
        ?.querySelector<HTMLButtonElement>(
          `[data-method="${restoreFocus.current}"]`,
        )
        ?.focus()
      restoreFocus.current = null
    }
  }, [qr, policy, subview])

  useEffect(() => {
    if (!qr || (qrStatus !== 'loading' && qrStatus !== 'ready')) return
    const timer = window.setTimeout(
      () => setQrStatus(qrStatus === 'loading' ? 'failed' : 'expired'),
      qrStatus === 'loading' ? 15_000 : 4 * 60_000,
    )
    function receive(event: MessageEvent) {
      if (
        event.origin !== wechatOrigin ||
        event.source !== frame.current?.contentWindow ||
        typeof event.data !== 'string'
      )
        return
      try {
        const message = JSON.parse(event.data)
        if (message?.type === 'status' && message.status === 'wxQRcodeReady')
          setQrStatus('ready')
      } catch {
        // Ignore messages outside the WeChat widget protocol.
      }
    }
    window.addEventListener('message', receive)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('message', receive)
    }
  }, [qr, qrStatus])

  async function start(provider: SocialProvider) {
    if (request.current || busy) return
    const controller = new AbortController()
    request.current = controller
    setLocalError('')
    try {
      const url = await onLogin(provider, controller.signal)
      if (!url || controller.signal.aborted) return
      if (provider !== 'wechat') {
        window.location.assign(url)
        return
      }
      const embedded = new URL(url)
      if (
        embedded.origin !== wechatOrigin ||
        embedded.pathname !== '/connect/qrconnect'
      )
        throw new Error('Unexpected WeChat authorization URL')
      embedded.searchParams.set('login_type', 'jssdk')
      embedded.searchParams.set('self_redirect', 'false')
      embedded.searchParams.set('color_scheme', 'light')
      restoreFocus.current = 'wechat'
      setQrStatus('loading')
      setQr({ url, embedded: embedded.href })
    } catch {
      if (!controller.signal.aborted)
        setLocalError('无法打开登录页面，请重试。')
    } finally {
      request.current = null
    }
  }

  const socialButton = (provider: SocialProvider) => (
    <button
      key={provider}
      type="button"
      data-method={provider}
      className="outline-button login-provider"
      disabled={!!busy}
      aria-busy={busy === provider}
      onClick={() => void start(provider)}
    >
      {provider !== 'google' && (
        <img
          src={
            provider === 'wechat' ? '/brands/wechat.svg' : '/brands/github.png'
          }
          alt=""
          width="22"
          height="22"
        />
      )}
      {busy === provider ? '正在连接…' : socialLabels[provider]}
    </button>
  )
  const wechat = social.includes('wechat')
  const other = social.filter((provider) => provider !== 'wechat')

  return (
    <div className="login-methods" ref={methods}>
      {subview && (
        <button
          ref={back}
          type="button"
          className="login-back"
          onClick={() => {
            request.current?.abort()
            setEmailOpen(false)
            setQr(null)
            setPolicy(null)
          }}
        >
          <ArrowLeft size={16} aria-hidden="true" /> 返回登录方式
        </button>
      )}
      {!subview && (
        <>
          {china && (
            <p className="login-subtitle">选个顺手的方式登录 Folio</p>
          )}
          {wechat && socialButton('wechat')}
          {wechat && (other.length > 0 || email) && (
            <div className="login-divider">其他登录方式</div>
          )}
          {other.map(socialButton)}
          {email && (
            <button
              type="button"
              data-method="email"
              className="outline-button login-provider"
              disabled={!!busy}
              onClick={() => {
                restoreFocus.current = 'email'
                setEmailOpen(true)
              }}
            >
              <Mail size={22} aria-hidden="true" /> 邮箱验证码登录
            </button>
          )}
          {!email && !social.length && <p>登录暂不可用，请稍后重试。</p>}
          {china && (
            <footer className="login-policies">
              <button
                type="button"
                data-method="terms"
                disabled={!!busy}
                onClick={() => {
                  restoreFocus.current = 'terms'
                  setPolicy('terms')
                }}
              >
                用户协议
              </button>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                data-method="privacy"
                disabled={!!busy}
                onClick={() => {
                  restoreFocus.current = 'privacy'
                  setPolicy('privacy')
                }}
              >
                隐私政策
              </button>
            </footer>
          )}
        </>
      )}
      {emailOpen && <EmailOtpLogin />}
      {qr && (
        <section className="login-qr" aria-label="微信扫码登录">
          <p role="status">
            {
              {
                loading: '正在加载微信二维码…',
                ready: '请使用微信扫码并在手机上确认。',
                expired: '二维码等待时间已结束，请重新获取。',
                failed: '未能加载微信二维码，请重试或打开微信授权页。',
              }[qrStatus]
            }
          </p>
          {(qrStatus === 'ready' || qrStatus === 'loading') && (
            <iframe
              ref={frame}
              title="微信登录二维码"
              src={qr.embedded}
              onError={() => setQrStatus('failed')}
            />
          )}
          <div className="login-qr-actions">
            <button
              type="button"
              className="outline-button"
              disabled={!!busy}
              onClick={() => void start('wechat')}
            >
              重新获取二维码
            </button>
            {qrStatus !== 'expired' && <a href={qr.url}>打开微信授权页</a>}
          </div>
        </section>
      )}
      {policy === 'terms' && (
        <section className="login-policy">
          <h3>用户协议</h3>
          <p>
            请仅导入你有权使用的个人经历与资料。Folio
            帮你整理和改写简历表达，正式导出或投递前请务必自行核对。简历库与聊天记录默认存在当前浏览器，请记得定期导出备份。
          </p>
        </section>
      )}
      {policy === 'privacy' && (
        <section className="login-policy">
          <h3>隐私政策</h3>
          <p>
            Folio
            仅使用登录服务返回的基础身份信息建立会话。你的完整简历库和对话记录按账号隔离保存在当前浏览器。调用
            AI
            时，改写所需的原文与上下文会发往服务端及模型接口，服务端可能留存请求处理记录或结果。
          </p>
        </section>
      )}
      {busy && (
        <p className="login-status" role="status">
          正在连接
          {busy === 'wechat'
            ? '微信'
            : busy === 'github'
              ? ' GitHub'
              : ' Google'}
          …
        </p>
      )}
      {(localError || error) && (
        <p className="landing-error" role="alert">
          {localError || error}
        </p>
      )}
    </div>
  )
}
