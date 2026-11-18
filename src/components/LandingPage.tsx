import { useEffect } from 'react'
import { ArrowRight, FileText, MessageSquare } from 'lucide-react'
import { ResumeDocument } from './resume/ResumeDocument'
import { sampleResume } from '../domain/resume'
import { trackLandingEvent } from '../lib/track'

export const landingFaq = [
  {
    question: 'Folio 适合什么场景用？',
    answer:
      '适合已经有简历、需要投多个岗位的求职者：每个岗位看重的经历不同，简历的重点要跟着调整。你可以在对话里说明要改什么，也可以粘贴目标岗位的 JD，生成一份单独的投递版本。还没有成型的简历，把零散的经历粘贴进来，也能整理出第一版。',
  },
  {
    question: '怎么按岗位 JD 改简历？',
    answer:
      '先导入现有简历，再粘贴目标岗位的描述（JD）。Folio 会把与岗位要求相关的经历排到前面，调整措辞，生成一份单独的投递版本。JD 有要求、简历里却找不到依据的内容，会列在「待补充」里，由你补充或确认。',
  },
  {
    question: '按岗位定制会把原简历改乱吗？',
    answer:
      '不会。每次按岗位定制都会新建一份独立版本，原简历不变。在对话里修改措辞或润色，更新的是当前打开的这一份，不会另外生成副本。',
  },
  {
    question: 'AI 改完可以直接投吗？',
    answer:
      '建议核对后再投。Folio 的改写以你提供的经历为依据，不主动添加简历里没有的公司、学历、技能或数据，并会列出改动之处和缺少的信息。AI 仍可能理解有误，投递前请逐条核对。Folio 不提供 ATS 评分或录用率预测。',
  },
  {
    question: '支持导入 PDF 或 Word 简历吗？',
    answer:
      '支持 PDF、DOCX、TXT、Markdown 和 Folio JSON。文字在浏览器本地提取，你核对提取结果后，再交给 AI 整理。扫描版 PDF 需要先用 OCR 转成文字，.doc 文件请先另存为 .docx。导入只提取文字，不保留原文件的排版。',
  },
  {
    question: '可以免费用吗？怎么计费？',
    answer:
      '可以。登录后有 Free 免费额度，每月重置，按实际用量扣减，不按简历份数计算，也不会自动扣费。剩余额度和可选套餐，登录后在左侧「套餐与用量」里查看。',
  },
  {
    question: '我的简历和聊天记录保存在哪？',
    answer:
      '简历库和完整聊天记录保存在当前浏览器，按账号隔离，暂不支持跨设备同步。调用 AI 时，改写所需的原文、上下文和相关简历会发送到服务端和模型接口，服务端会留存请求记录或处理结果；删除浏览器里的简历，不会同时删除这些服务端记录。更换设备或清理浏览器数据前，请先导出 JSON 备份。',
  },
  {
    question: '怎么导出 PDF？手机上能改吗？',
    answer:
      '点击导出会打开浏览器的打印窗口，可另存为 A4 PDF；也可以导出 Folio JSON 作为备份。四套模板使用同一份内容，可以随时切换。手机上可以预览和对话修改，导出 PDF 建议在电脑浏览器上完成，排版更稳定。',
  },
] as const

const steps = [
  {
    title: '导入现有简历',
    body: '选择 PDF 或 Word（DOCX）文件，或直接粘贴经历。文字在浏览器本地提取，你核对后再整理成结构化简历。',
  },
  {
    title: '粘贴目标岗位 JD',
    body: '粘贴岗位描述，可以补充说明想突出的经历。每次定制都会另存为新版本，原简历不变。',
  },
  {
    title: '核对后导出',
    body: '查看改动明细和待补充的信息，继续对话或直接编辑文字。选好模板后导出 A4 PDF。',
  },
] as const

// The public example reorders existing fictional facts; it does not run an Agent.
const tailoredExample = {
  ...sampleResume,
  label: '设计系统 · 示例投递版本',
  experience: sampleResume.experience.map((job, index) =>
    index === 0
      ? {
          ...job,
          bullets: [job.bullets[1], job.bullets[0], ...job.bullets.slice(2)],
        }
      : job,
  ),
}

export function LandingPage({
  ready,
  canLogin,
  opensLoginDialog = false,
  isLoading,
  error,
  onLogin,
  onDemo,
}: {
  ready: boolean
  canLogin: boolean
  opensLoginDialog?: boolean
  isLoading: boolean
  error: string
  onLogin: () => void
  onDemo?: () => void
}) {
  // Count only visitors who actually resolved to the signed-out landing page.
  useEffect(() => {
    if (ready) trackLandingEvent('landing_view')
  }, [ready])
  function handleLogin() {
    trackLandingEvent('landing_login_click')
    onLogin()
  }
  function handleDemo() {
    trackLandingEvent('landing_demo_click')
    onDemo?.()
  }
  function handleExample() {
    trackLandingEvent('landing_example_click')
  }
  return (
    <div className="landing-page">
      <a className="landing-skip" href="#main">
        跳到正文
      </a>
      <header className="landing-header">
        <a className="wordmark" href="/" aria-label="Folio 首页">
          folio
        </a>
        <nav aria-label="落地页导航">
          <a href="#product" onClick={handleExample}>
            定制示例
          </a>
          <a href="#features">怎么用</a>
          <a href="#faq">常见问题</a>
        </nav>
      </header>
      <main id="main">
        <section className="landing-intro">
          <h1>按岗位 JD 定制简历</h1>
          <p>
            导入现有简历，粘贴目标岗位的 JD。Folio
            把与岗位要求相关的经历排到前面，把空泛的表述改具体，另存为一份投递版本。原简历保留，核对后可导出
            PDF。
          </p>
          <div className="landing-actions">
            {canLogin || !ready ? (
              <button
                className="primary-button"
                disabled={!ready || isLoading}
                onClick={handleLogin}
                aria-haspopup={opensLoginDialog ? 'dialog' : undefined}
                aria-describedby={
                  ready && canLogin ? 'landing-login-note' : undefined
                }
              >
                {isLoading ? '正在连接…' : '开始定制简历'}
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            ) : null}
            {ready && onDemo ? (
              <button
                className={canLogin ? 'outline-button' : 'primary-button'}
                onClick={handleDemo}
              >
                试用示例
              </button>
            ) : null}
            <a
              className="outline-button"
              href="#product"
              onClick={handleExample}
            >
              查看定制示例
            </a>
          </div>
          {ready && canLogin ? (
            <p className="landing-note" id="landing-login-note">
              {opensLoginDialog ? '' : '使用 Google 登录。'}登录后有免费 AI
              额度，按实际用量扣减，不会自动续费。
            </p>
          ) : null}
          {error ? (
            <p className="landing-error" role="alert">
              {error}
            </p>
          ) : null}
          {ready && !canLogin && !onDemo ? (
            <p role="status">登录暂不可用，请稍后重试。</p>
          ) : null}
        </section>
        <section
          id="product"
          className="landing-product"
          aria-labelledby="landing-example-title"
        >
          <div className="landing-product-bar">
            <h2 id="landing-example-title">
              简历定制示例：用已有经历投设计系统岗位
            </h2>
            <span>虚构案例 · 非实时生成</span>
          </div>
          <div className="landing-product-body">
            <div className="landing-conversation">
              <div className="landing-section-title">
                <MessageSquare size={15} aria-hidden="true" />
                对照 JD 调整经历顺序
              </div>
              <dl className="landing-example-context">
                <div>
                  <dt>原简历</dt>
                  <dd>
                    原简历的第一份工作经历先写平台体验设计，第二条写设计系统。
                  </dd>
                </div>
                <div>
                  <dt>目标岗位要求</dt>
                  <dd>
                    看重设计系统搭建、多端组件规范、跨团队推进，同时要求无障碍设计经验。
                  </dd>
                </div>
              </dl>
              <div className="landing-request">
                按这个岗位的要求，把设计系统那条经历放到最前面。
              </div>
              <div className="landing-reply">
                <h3>定制后的调整</h3>
                <p>把同一份工作经历里的设计系统要点从第二条移到第一条：</p>
                <blockquote>
                  {tailoredExample.experience[0].bullets[0]}
                </blockquote>
                <p className="landing-missing">
                  <strong>待补充</strong>
                  原简历里没有无障碍设计经验，这一项没有写入，列出来由你确认。
                </p>
                <div className="landing-version">
                  <FileText size={16} aria-hidden="true" />
                  <span>设计系统 · 独立投递版本，原稿保留</span>
                </div>
              </div>
              <div className="landing-example-note">
                <p>
                  <a href="/guides/excel-to-data-analyst">
                    只有 Excel 活动复盘经历，投运营和数据分析岗分别怎么写？
                  </a>
                </p>
                <p>
                  <a href="/guides/work-experience-in-months">
                    JD 写“约两年工作经验”，简历只有起止年月，怎么写？
                  </a>
                </p>
                <p>
                  <a href="/guides/summary-experience-duplication">
                    个人简介和工作经历重复，按 JD 定制时该删哪句？
                  </a>
                </p>
              </div>
            </div>
            <div className="landing-document" aria-label="虚构示例的定制结果">
              <ResumeDocument resume={tailoredExample} />
            </div>
          </div>
        </section>
        <section id="features" className="landing-features">
          <h2>三步生成一份投递版本</h2>
          <ol className="landing-feature-grid">
            {steps.map((step) => (
              <li key={step.title}>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </section>
        <section
          className="landing-benefits"
          aria-labelledby="landing-benefits-title"
        >
          <h2 id="landing-benefits-title">修改、版本和排版在同一个页面完成</h2>
          <div className="landing-feature-grid">
            <div>
              <h3>对话修改，也可以直接编辑</h3>
              <p>
                整体调整在对话里说明，右侧预览同步更新；只改个别字句时，直接在文档里编辑。
              </p>
            </div>
            <div>
              <h3>每个岗位一份独立版本</h3>
              <p>
                每次按 JD
                定制都会新建一份简历，原简历不变。之后针对这个岗位的修改，只更新这一份。
              </p>
            </div>
            <div>
              <h3>换模板不用重排内容</h3>
              <p>
                四套模板和排版密度使用同一份内容，切换时不需要重新粘贴或调整格式。
              </p>
            </div>
          </div>
        </section>
        <section
          id="privacy"
          className="landing-principles"
          aria-labelledby="landing-privacy-title"
        >
          <h2 id="landing-privacy-title">额度与数据保存</h2>
          <div className="landing-feature-grid">
            <div>
              <h3>免费额度按实际用量扣减</h3>
              <p>
                Free 套餐每月重置免费 AI
                额度，按实际用量扣减，不会自动续费，也不会产生超额账单。登录后可查看剩余额度。
              </p>
            </div>
            <div>
              <h3>简历库保存在当前浏览器</h3>
              <p>
                按账号隔离，保存在本机浏览器，暂不支持云端同步。清理浏览器数据前，请先导出
                JSON 备份。
              </p>
            </div>
            <div>
              <h3>调用 AI 时发送的数据</h3>
              <p>
                调用 AI
                时，改写所需的原文和上下文会发送到服务端和模型服务，服务端会留存请求记录或处理结果。删除浏览器里的简历，不会同时删除这些服务端记录。
              </p>
            </div>
          </div>
          <p className="landing-note">
            首页只记录匿名的访问与按钮点击次数，不包含简历、账户或设备标识。
          </p>
        </section>
        <section id="faq" className="landing-faq">
          <h2>常见问题</h2>
          <dl>
            {landingFaq.map((item) => (
              <div key={item.question}>
                <dt>{item.question}</dt>
                <dd>{item.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
        {ready && (canLogin || onDemo) ? (
          <section className="landing-cta">
            <h2>用现有简历和一份目标 JD 开始</h2>
            <div className="landing-actions">
              {canLogin ? (
                <button
                  className="primary-button"
                  disabled={isLoading}
                  onClick={handleLogin}
                  aria-haspopup={opensLoginDialog ? 'dialog' : undefined}
                  aria-describedby="landing-login-note"
                >
                  {isLoading ? '正在连接…' : '开始定制简历'}
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              ) : null}
              {onDemo ? (
                <button
                  className={canLogin ? 'outline-button' : 'primary-button'}
                  onClick={handleDemo}
                >
                  进入示例工作台
                </button>
              ) : null}
            </div>
          </section>
        ) : null}
      </main>
      <footer className="landing-footer">
        <span>Folio · AI 简历修改与岗位定制</span>
        <a href="#privacy">额度与数据保存</a>
      </footer>
    </div>
  )
}
