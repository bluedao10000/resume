import { ArrowRight, FileText, MessageSquare } from 'lucide-react'
import { ResumeDocument } from './resume/ResumeDocument'
import { sampleResume } from '../domain/resume'

export function LandingPage({
  canLogin,
  isLoading,
  error,
  onLogin,
  onDemo,
}: {
  canLogin: boolean
  isLoading: boolean
  error: string
  onLogin: () => void
  onDemo?: () => void
}) {
  return (
    <div className="landing-page">
      <header className="landing-header">
        <a className="wordmark" href="/" aria-label="Folio 首页">
          folio
        </a>
        <a href="#product">
          查看示例 <ArrowRight size={14} />
        </a>
      </header>
      <main>
        <section className="landing-intro">
          <h1>简历工作台</h1>
          <p>在对话中整理经历，按岗位调整简历。</p>
          <div className="landing-actions">
            {canLogin ? (
              <button
                className="primary-button"
                disabled={isLoading}
                onClick={onLogin}
              >
                {isLoading ? '正在连接…' : '使用 Google 继续'}
                <ArrowRight size={16} />
              </button>
            ) : null}
            {onDemo ? (
              <button
                className={canLogin ? 'outline-button' : 'primary-button'}
                onClick={onDemo}
              >
                试用示例 <ArrowRight size={16} />
              </button>
            ) : null}
          </div>
          {error ? (
            <p className="landing-error" role="alert">
              {error}
            </p>
          ) : null}
          {!canLogin && !onDemo ? (
            <p role="status">登录暂不可用，请稍后重试。</p>
          ) : null}
        </section>
        <section id="product" className="landing-product" aria-label="产品示例">
          <div className="landing-product-bar">
            <span>folio</span>
            <span>示例简历</span>
          </div>
          <div className="landing-product-body">
            <div className="landing-conversation">
              <div className="landing-section-title">
                <MessageSquare size={15} />
                对话
              </div>
              <div className="landing-request">
                调整这份简历，突出设计系统经验。
              </div>
              <div className="landing-reply">
                <strong>Folio</strong>
                <p>已将设计系统项目放在前面，保留原有经历。</p>
                <div className="landing-version">
                  <FileText size={16} />
                  <span>设计系统 · 投递版本</span>
                </div>
              </div>
              <div className="landing-composer">
                输入修改要求…
                <ArrowRight size={16} />
              </div>
            </div>
            <div className="landing-document">
              <ResumeDocument resume={sampleResume} />
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
