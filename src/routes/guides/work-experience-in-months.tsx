import { createFileRoute } from '@tanstack/react-router'

const title = 'JD 写“约两年工作经验”，简历只有起止年月，怎么写？'
const description =
  '用 2024.11 到 2026.10 的虚构任职记录演算：如何数覆盖月份、扣除重叠，以及什么时候需要单独核对全职或专项经验。'
const url = 'https://www.codeiy.com/guides/work-experience-in-months'

export const Route = createFileRoute('/guides/work-experience-in-months')({
  component: Guide,
  head: () => ({
    meta: [
      { title: `${title}｜Folio 简历指南` },
      { name: 'description', content: description },
      { property: 'og:type', content: 'article' },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:url', content: url },
    ],
    links: [{ rel: 'canonical', href: url }],
  }),
})

function Guide() {
  return (
    <div className="landing-page guide-page">
      <header className="landing-header">
        <a className="wordmark" href="/" aria-label="Folio 首页">
          folio
        </a>
        <a href="/#product">简历定制示例</a>
      </header>
      <main>
        <article>
          <h1>{title}</h1>
          <p>
            如果 JD 问的是大致工作年限，先看任职日期覆盖了多少个自然月。比如从
            2024 年 11 月任职到 2026 年 10 月，起止月都计入，共覆盖 24
            个月。可以在简介里写“约两年工作经验”，在工作经历里保留起止年月。
          </p>

          <h2>把这 24 个月算一遍</h2>
          <p>下面是一份虚构底稿，只有一段任职记录。</p>
          <blockquote>
            虚构软件公司 · 前端开发 · 2024.11—2026.10
            <br />
            维护采购表单，对接审批接口并处理校验提示。
          </blockquote>
          <p>
            2024 年 11、12 月占 2 个月，2025 年占 12 个月，2026 年 1 至 10 月占
            10 个月。合计 2 + 12 + 10 =
            24。起止月可能只工作了几天，因此适合用“约”来概括。
          </p>
          <p>
            有多段经历时，可以在一条时间线上标出实际任职的月份。同年 3 至 6
            月兼做另一个项目，这四个月已经算过一次；两份工作之间空出的整月则留白。
          </p>

          <h2>同一份底稿，遇到三种 JD 怎么处理？</h2>
          <ul>
            <li>
              <strong>“约两年工作经验”</strong>
              ：保留日期和采购表单这条经历，招聘方能同时看到时长依据和你做过的事。
            </li>
            <li>
              <strong>“满两年全职工作经验”</strong>
              ：先核对每段工作的用工性质和实际入离职日。若表格只允许填整年，按实际情况和表格口径填写。
            </li>
            <li>
              <strong>“至少两年无障碍测试经验”</strong>
              ：回到项目记录，确认自己测过哪些交互、从什么时候开始、是否持续参与。单凭这段前端任职日期，专项年限仍待核对。
            </li>
          </ul>

          <h2>这份投递稿可以怎样落笔？</h2>
          <blockquote>
            约两年工作经验。在采购表单项目中对接审批接口，处理校验提示。
          </blockquote>
          <p>
            这段简介里的时间和动作都能在底稿中找到。若你只记得入职年份，先保留能确认的日期精度；若某段工作持续至今，可以写“至今”，需要核算时再明确截至哪个月。
          </p>
          <p className="guide-action">
            <a href="/">用自己的简历按 JD 定制</a>
          </p>
        </article>
      </main>
    </div>
  )
}
