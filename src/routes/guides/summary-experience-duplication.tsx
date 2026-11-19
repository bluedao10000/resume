import { createFileRoute } from '@tanstack/react-router'

const title = '个人简介和工作经历重复，按 JD 定制时该删哪句？'
const description =
  '用同一份虚构业务前端简历对照改前改后：把采购表单、审批接口和校验提示留在项目里，简介只概括工作方向，并识别关键词重复但信息互补的两句话。'
const url = 'https://r.codeiy.com/guides/summary-experience-duplication'

export const Route = createFileRoute('/guides/summary-experience-duplication')({
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
            把“维护采购表单，对接审批接口并处理校验提示”完整留在项目里，它最能证明你做过什么。简介只需交代工作方向，比如“业务前端开发”。底稿只够概括一句时就写一句，不要再把项目动作复制过来。
          </p>

          <h2>先看这份底稿和目标 JD</h2>
          <p>以下人物、公司和经历均为虚构示例，可以照着检查自己的简历。</p>
          <p>
            <strong>JD 摘录：</strong>
            业务前端开发。负责企业采购后台表单维护，对接审批接口并处理校验提示；使用
            React。
          </p>
          <p>改前，个人简介和工作经历的第一条完全重复：</p>
          <blockquote>
            <p>
              <strong>个人简介</strong>
              <br />
              维护采购表单，对接审批接口并处理校验提示。
            </p>
            <p>
              <strong>虚构采购科技 · 前端开发 · 2024.03—2026.10</strong>
              <br />
              维护采购表单，对接审批接口并处理校验提示。
              <br />
              参与采购后台列表页维护。
            </p>
          </blockquote>

          <h2>改后：项目保留证据，简介只留方向</h2>
          <blockquote>
            <p>
              <strong>个人简介</strong>
              <br />
              业务前端开发
            </p>
            <p>
              <strong>虚构采购科技 · 前端开发 · 2024.03—2026.10</strong>
              <br />
              维护采购表单，对接审批接口并处理校验提示。
              <br />
              参与采购后台列表页维护。
            </p>
          </blockquote>
          <p>
            项目句同时交代了维护对象、对接动作和校验处理，招聘方可以据此追问你具体做过哪一步，因此完整保留。简介不再重复这些细节，只用底稿已有的职位信息回答“我做哪类工作”。这里没有补写年限、成果或“主导”，因为底稿没有这些依据。
          </p>

          <h2>出现同一个项目名，不等于内容重复</h2>
          <p>另一种情况不要误删：</p>
          <ul>
            <li>个人简介：主要做企业采购后台前端开发。</li>
            <li>工作经历：维护采购表单，对接审批接口并处理校验提示。</li>
          </ul>
          <p>
            两句都提到“采购后台”，但第一句说明工作方向，第二句说明实际行动，信息互补，可以同时保留。判断标准不是技术名、岗位名或项目名出现了几次，而是每句话分别提供了什么信息。
          </p>

          <h2>自己动手时，按这四步核对</h2>
          <ol>
            <li>先找最能对应 JD 交付物的经历，把具体动作和范围完整留下。</li>
            <li>
              再读简介：如果删掉项目细节后只剩工作方向，就用底稿已有事实写一句；没有新信息就不要硬凑长段。
            </li>
            <li>
              对照原稿检查公司、职位、日期、职责范围和数字。“参与”不能改成“主导”，没有成果数据就不新增。
            </li>
            <li>
              分别朗读两句。若一句回答“做哪类工作”，另一句回答“实际做过什么”，即使关键词相同也不用删。
            </li>
          </ol>
          <p className="guide-action">
            <a href="/">用自己的简历按 JD 定制</a>
          </p>
        </article>
      </main>
    </div>
  )
}
