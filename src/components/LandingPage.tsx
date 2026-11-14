import { useEffect } from 'react'
import { ArrowRight, FileText, MessageSquare } from 'lucide-react'
import { ResumeDocument } from './resume/ResumeDocument'
import { sampleResume } from '../domain/resume'
import { trackLandingEvent } from '../lib/track'

export const landingFaq = [
  {
    question: 'Folio 适合谁？',
    answer:
      'Folio 是支持对话修改和岗位定制的中文 AI 简历工具，适合已有简历、需要针对不同岗位调整经历重点的求职者。也可以粘贴真实经历，从第一份草稿开始整理。',
  },
  {
    question: '如何根据岗位描述（JD）修改简历？',
    answer:
      '先导入或粘贴已有简历，再提供目标岗位描述。Folio 从你的简历库中选取相关经历，调整表达和顺序，生成独立投递版本；缺少依据的要求会提示补充。核对内容后，可继续对话修改或直接编辑。',
  },
  {
    question: '定制会覆盖原简历吗？',
    answer:
      '按岗位定制会新增独立版本，保留原简历。普通对话修改和润色更新当前版本，不会每轮新增副本。已有投递版本可在简历库中切换。',
  },
  {
    question: 'AI 改写的内容需要核对吗？',
    answer:
      '需要。Folio 以你提供的经历为依据整理，要求 AI 不添加未经证实的公司、学历、技能或数字，并展示实际修改和待补充信息。AI 仍可能出错，请在投递前核对全部内容；这里不提供 ATS 分数或录用概率。',
  },
  {
    question: '可以导入 PDF 或 Word 简历吗？',
    answer:
      '支持 PDF、DOCX、TXT、Markdown 和 Folio JSON。文件文字在浏览器本地提取，核对后再交给 AI 整理。扫描件需要先 OCR，旧版 .DOC 请另存为 DOCX；不复刻原文件版式。',
  },
  {
    question: '可以免费使用吗？',
    answer:
      '可以，Free 套餐提供每月重置的免费 AI 额度，按实际用量消耗，不对应固定的简历份数。额度和付费套餐可用情况以登录后的“套餐与用量”为准；不会自动收取超额费用。',
  },
  {
    question: '简历和对话保存在哪里？',
    answer:
      '简历库和完整对话保存在当前浏览器，按账户分区，暂不支持跨设备同步。使用真实 AI 时，必要的原文、对话上下文和相关简历会发送到服务端及模型服务；服务端也会保存请求处理记录或结果。删除浏览器内的简历不会同时删除这些服务端记录。建议导出 JSON 备份，并在共享设备上清理站点数据。',
  },
  {
    question: '怎样导出简历？手机上能用吗？',
    answer:
      '使用浏览器打印保存为 A4 PDF，也可导出 Folio JSON 备份并再次导入。四套模板共用同一份简历内容。手机上可切换对话与预览；PDF 导出效果以所用浏览器的打印预览为准。',
  },
] as const

const steps = [
  {
    title: '导入已有简历',
    body: '上传 PDF、DOCX，或粘贴经历。先核对提取的文字，再整理成可编辑的简历。',
  },
  {
    title: '粘贴目标岗位',
    body: '提供岗位描述，说明想突出的重点。根据已有经历生成独立版本，保留原稿。',
  },
  {
    title: '核对后导出',
    body: '检查修改和待补充信息，用对话继续调整，或直接编辑。选择模板，打印保存为 PDF。',
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
  isLoading,
  error,
  onLogin,
  onDemo,
}: {
  ready: boolean
  canLogin: boolean
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
          <h1>
            把已有简历，
            <br />
            改成适合目标岗位的投递版本
          </h1>
          <p>
            导入简历，粘贴岗位描述，用对话调整经历重点。 Folio
            帮你保留原稿，整理独立版本，核对后导出 PDF。
          </p>
          <div className="landing-actions">
            {canLogin || !ready ? (
              <button
                className="primary-button"
                disabled={!ready || isLoading}
                onClick={handleLogin}
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
              使用 Google 登录。提供免费 AI 额度，按实际用量消耗。
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
              一份基础简历，怎样投设计系统岗位？
            </h2>
            <span>虚构案例 · 非实时生成</span>
          </div>
          <div className="landing-product-body">
            <div className="landing-conversation">
              <div className="landing-section-title">
                <MessageSquare size={15} aria-hidden="true" />
                从岗位要求，到经历选材
              </div>
              <dl className="landing-example-context">
                <div>
                  <dt>原简历</dt>
                  <dd>林知夏的设计经历包括产品体验、设计系统和用户研究。</dd>
                </div>
                <div>
                  <dt>目标岗位要求</dt>
                  <dd>
                    设计系统建设、多端组件规范、跨团队协作，以及无障碍设计经验。
                  </dd>
                </div>
              </dl>
              <div className="landing-request">
                针对这个岗位，把我已有的设计系统经历放在前面。
              </div>
              <div className="landing-reply">
                <h3>定制后的重点</h3>
                <p>将原简历中这条经历提到首位，保留原有事实：</p>
                <blockquote>
                  {tailoredExample.experience[0].bullets[0]}
                </blockquote>
                <p className="landing-missing">
                  <strong>待补充</strong>
                  原简历未提供无障碍设计经验，定制稿不加入这项技能。
                </p>
                <div className="landing-version">
                  <FileText size={16} aria-hidden="true" />
                  <span>设计系统 · 独立投递版本，原稿保留</span>
                </div>
              </div>
              <p className="landing-example-note">
                换投用户研究岗位时，可优先呈现已有的访谈与可用性测试经历。
                同一份基础简历，为不同岗位选择不同重点。
              </p>
            </div>
            <div className="landing-document" aria-label="虚构示例的定制结果">
              <ResumeDocument resume={tailoredExample} />
            </div>
          </div>
        </section>
        <section id="features" className="landing-features">
          <h2>从已有简历，到下一次投递</h2>
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
            修改、版本和排版，在同一个地方完成
          </h2>
          <div className="landing-feature-grid">
            <div>
              <h3>边对话，边核对文档</h3>
              <p>
                说明修改要求，在文档区查看结果。需要改一个词或一句话时，也可以直接编辑。
              </p>
            </div>
            <div>
              <h3>为不同岗位保留版本</h3>
              <p>
                岗位定制新增独立简历，原稿保留。继续修改定制稿时更新该稿，方便对应不同投递。
              </p>
            </div>
            <div>
              <h3>内容确定后，再选模板</h3>
              <p>
                四套模板和局部排版读取同一份内容。切换呈现方式，无需重新复制经历。
              </p>
            </div>
          </div>
        </section>
        <section
          id="privacy"
          className="landing-principles"
          aria-labelledby="landing-privacy-title"
        >
          <h2 id="landing-privacy-title">开始前，了解额度与数据保存</h2>
          <div className="landing-feature-grid">
            <div>
              <h3>可以从免费额度开始</h3>
              <p>
                Free 提供每月重置的 AI
                额度，按实际用量消耗，不自动收取超额费用。当前额度和可用套餐在登录后查看。
              </p>
            </div>
            <div>
              <h3>简历库保存在当前浏览器</h3>
              <p>
                按账户分区，暂不支持跨设备同步。清理浏览器数据可能丢失本地简历和对话，建议导出
                JSON 备份。
              </p>
            </div>
            <div>
              <h3>使用 AI 需要处理你的内容</h3>
              <p>
                必要的原文和上下文会发送到服务端及模型服务，服务端会保留请求处理记录或结果。本地删除不会同时清除这些记录。
              </p>
            </div>
          </div>
          <p className="landing-note">
            首页只记录匿名的访问与按钮点击次数，不包含简历、账户或设备标识。
          </p>
        </section>
        <section id="faq" className="landing-faq">
          <h2>关于 AI 简历修改与岗位定制</h2>
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
            <h2>带上已有简历，试一个你想投的岗位</h2>
            <div className="landing-actions">
              {canLogin ? (
                <button
                  className="primary-button"
                  disabled={isLoading}
                  onClick={handleLogin}
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
