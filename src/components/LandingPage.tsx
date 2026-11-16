import { useEffect } from 'react'
import { ArrowRight, FileText, MessageSquare } from 'lucide-react'
import { ResumeDocument } from './resume/ResumeDocument'
import { sampleResume } from '../domain/resume'
import { trackLandingEvent } from '../lib/track'

export const landingFaq = [
  {
    question: 'Folio 适合什么场景用？',
    answer:
      '适合手里已经有简历、但投不同岗位每次都要重调重点的打工人和求职者。你可以直接跟它聊怎么改，或者贴入目标 JD 单独拉一份投递稿；哪怕只有零散经历，也能直接贴进来先搭出第一版草稿。',
  },
  {
    question: '怎么按岗位 JD 改简历？',
    answer:
      '先把现有简历导进来，再贴上你想投的岗位描述（JD）。Folio 会从你的经历里挑出最匹配的部分，往前排、顺措辞，单独生成一份投递版本；JD 里要求但你简历里没写过的经历，会直接标在「待补充」里提醒你，不会替你瞎编。',
  },
  {
    question: '按岗位定制会把原简历改乱吗？',
    answer:
      '不会。每次按岗位定制都会新建一份独立版本，原来的底稿原封不动。日常用对话改词、润色则只更新当前打开的这一份，不会每聊一句就多出一堆乱七八糟的副本。',
  },
  {
    question: 'AI 改完可以直接投吗？',
    answer:
      '建议先过一遍再投。Folio 的原则是只基于你给的真实经历改写，不凭空塞没做过的公司、学历、技能或水分数据，并且会把改了哪几处、缺什么信息列清楚。但 AI 偶尔也会理解偏差，投递前请一定自己把把关；我们也不搞虚头的 ATS 跑分或录用率预测。',
  },
  {
    question: '支持导入 PDF 或 Word 简历吗？',
    answer:
      '支持 PDF、DOCX、TXT、Markdown 和 Folio JSON。文档文字直接在浏览器本地提取，你先看一眼提取出的文字对不对，再交给 AI 整理。图片扫描版 PDF 需要先转成文字（OCR），老版 .doc 先另存为 .docx 就能传；导入只提取文字内容，不照搬原文件排版。',
  },
  {
    question: '可以免费用吗？怎么计费？',
    answer:
      '可以。注册登录后自带 Free 免费额度，按月重置，用多少扣多少，不按固定简历份数卡人，也不会偷偷自动扣费。想看剩余额度或升级套餐，登录后点左侧「套餐与用量」就能看到。',
  },
  {
    question: '我的简历和聊天记录保存在哪？',
    answer:
      '你的简历库和完整聊天记录默认保存在当前浏览器本地，按账号隔离，目前不做云端跨设备同步。调用真实 AI 时，当前改写所需的原文、上下文和相关简历会发往服务端及模型接口，服务端会留存请求记录或处理结果；删除浏览器内的简历不会同时删除这些服务端记录。换电脑或清缓存前，记得顺手导出 JSON 备份。',
  },
  {
    question: '怎么导出 PDF？手机上能改吗？',
    answer:
      '点导出就能直接调起浏览器打印，存成标准 A4 PDF，也能导出 Folio JSON 留作备份。四套模板共用同一份底稿，随时切换。手机上也能随时看预览、聊修改；不过最终导出 PDF 建议用电脑浏览器，排版更稳。',
  },
] as const

const steps = [
  {
    title: '导入现有简历',
    body: '拖入 PDF、Word（DOCX），或者直接粘贴经历。文字在本地提取，你先过目确认，再整理成结构化底稿。',
  },
  {
    title: '贴入目标 JD',
    body: '把想投的岗位描述贴进来，聊聊想突出的亮点。每次定制都会单独存成新版本，不怕改乱底稿。',
  },
  {
    title: '核对细节，导出投递',
    body: '一眼看清改了哪、还缺什么经历，接着聊或直接动手改字都行。挑套顺眼的模板，直接导出 A4 PDF。',
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
            不用每投一家就重改一遍底稿。导进现有简历、贴上目标
            JD，Folio 帮你把匹配岗位要求的真实经历往前排、把空话改实在，单独存成一份可核对、能直接导出
            PDF 的投递稿。
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
              {opensLoginDialog ? '' : '使用 Google 登录。'}自带免费 AI
              额度，按实际用量扣除，无自动续费。
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
                对照 JD，把对口的经历拎到前面
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
                针对这个岗位，把设计系统那条经历提到最前面，重点更抓眼一点。
              </div>
              <div className="landing-reply">
                <h3>定制后的调整</h3>
                <p>把同一份工作经历里的设计系统要点从第二条移到第一条：</p>
                <blockquote>
                  {tailoredExample.experience[0].bullets[0]}
                </blockquote>
                <p className="landing-missing">
                  <strong>待补充</strong>
                  原简历没提过无障碍设计经验，不会硬塞进简历，先标出来供你确认。
                </p>
                <div className="landing-version">
                  <FileText size={16} aria-hidden="true" />
                  <span>设计系统 · 独立投递版本，原稿保留</span>
                </div>
              </div>
              <p className="landing-example-note">
                如果下一家投的是用研岗，可以把用户访谈和可用性测试往前放。一份底稿，按不同岗位切换侧重点，不用来回折腾。
              </p>
            </div>
            <div className="landing-document" aria-label="虚构示例的定制结果">
              <ResumeDocument resume={tailoredExample} />
            </div>
          </div>
        </section>
        <section id="features" className="landing-features">
          <h2>三步搞定下一份投递稿</h2>
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
          <h2 id="landing-benefits-title">
            改措辞、存版本、换排版，不用在几个工具间来回切
          </h2>
          <div className="landing-feature-grid">
            <div>
              <h3>能直接聊，也能上手改字</h3>
              <p>
                大方向跟 AI 聊，右侧实时看效果；顺手改几个词或调句话，直接点进文档就能编辑，不用反复发消息。
              </p>
            </div>
            <div>
              <h3>投一家存一版，底稿不乱</h3>
              <p>
                每次按 JD 定制都会单拉一份新简历，原稿稳稳保留。后续针对这个岗位怎么微调，都只更新当前这一版。
              </p>
            </div>
            <div>
              <h3>内容定好，一键换模板</h3>
              <p>
                四套模板和排版疏密共用同一份底稿。什么时候想换风格点一下就行，不用重新复制粘贴调格式。
              </p>
            </div>
          </div>
        </section>
        <section
          id="privacy"
          className="landing-principles"
          aria-labelledby="landing-privacy-title"
        >
          <h2 id="landing-privacy-title">额度怎么算、数据存哪，先说在前面</h2>
          <div className="landing-feature-grid">
            <div>
              <h3>自带免费额度，按量扣不踩坑</h3>
              <p>
                Free 档每月重置免费 AI
                额度，按实际消耗扣除，不会自动续费或产生超额账单。登录后随时可查剩余额度。
              </p>
            </div>
            <div>
              <h3>简历库默认存在当前浏览器</h3>
              <p>
                按账号隔离保存在本机浏览器，暂不走云端同步。清理浏览器缓存前，建议顺手导出
                JSON 备份。
              </p>
            </div>
            <div>
              <h3>AI 处理与数据边界</h3>
              <p>
                调用 AI 时，必要的原文和上下文会发往服务端及模型服务，服务端会留存请求处理记录或结果。删除浏览器内的简历不会同时删除这些服务端记录。
              </p>
            </div>
          </div>
          <p className="landing-note">
            首页只记录匿名的访问与按钮点击次数，不包含简历、账户或设备标识。
          </p>
        </section>
        <section id="faq" className="landing-faq">
          <h2>你可能想问的</h2>
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
            <h2>拿手头的简历，挑个想投的岗位试试</h2>
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
