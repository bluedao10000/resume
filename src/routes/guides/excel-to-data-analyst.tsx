import { createFileRoute } from '@tanstack/react-router'

const title = '只有 Excel 活动复盘经历，怎么投数据分析岗？'
const description =
  '用同一份虚构的运营简历，对照社群运营与数据分析两份 JD，逐条看哪些经历该提前、哪些可以照写，以及 SQL 经验如何核对。'
const url = 'https://www.codeiy.com/guides/excel-to-data-analyst'

export const Route = createFileRoute('/guides/excel-to-data-analyst')({
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
            把最接近岗位交付物的那条经历放在前面。数据分析岗要看你处理过什么数据、交出了什么结果；
            社群运营岗则更关心你怎样收集问题、把问题交给谁。两份投递稿可以用相同的原句。
          </p>
          <h2>先圈出底稿里能核对的两件事</h2>
          <p>
            以下简历和 JD 均为虚构示例。一位运营专员在同一段工作经历里写了两条：
          </p>
          <ol>
            <li>汇总社群问题，分类后反馈给产品与客服。</li>
            <li>使用 Excel 汇总阅读、报名和问卷数据并参与复盘。</li>
          </ol>
          <h2>投社群运营岗，先写问题的去向</h2>
          <p>JD 摘录：“收集用户反馈，整理高频问题，与产品和客服协作。”</p>
          <blockquote>汇总社群问题，分类后反馈给产品与客服。</blockquote>
          <p>
            这句话已经交代了自己的动作和交接对象，适合留在第一条。若想写“推动产品改版”，先核对有没有一条建议被采纳：具体改了什么，自己负责哪一步？
          </p>
          <h2>投数据分析岗，把 Excel 复盘提到第一条</h2>
          <p>
            JD 摘录：“使用 Excel 整理活动数据，参与活动复盘；要求能独立使用 SQL
            取数。”
          </p>
          <blockquote>
            使用 Excel 汇总阅读、报名和问卷数据并参与复盘。
          </blockquote>
          <p>
            把原稿第二条移到首位，社群反馈放到第二条。“阅读、报名和问卷”说明接触过哪些数据，“参与复盘”保留了职责范围。底稿缺少活动前后的可比数据，因此这版只写到复盘。
          </p>
          <h2>JD 要求 SQL，但原稿只写了 Excel，怎么补？</h2>
          <p>
            先回想报名明细是怎么到你手上的：是同事导出的表，还是你亲自写查询取的数？
          </p>
          <ul>
            <li>
              拿到的是现成表，就保留 Excel 那句，把“独立使用 SQL
              取数”留作投递前要判断的岗位缺口。
            </li>
            <li>
              确实写过查询，就补上一次具体任务：需要回答什么问题、用了哪些数据、查询结果交给谁。再决定这条是否比
              Excel 汇总更值得放在前面。
            </li>
          </ul>
          <p className="guide-action">
            <a href="/">用自己的简历按 JD 定制</a>
          </p>
        </article>
      </main>
    </div>
  )
}
