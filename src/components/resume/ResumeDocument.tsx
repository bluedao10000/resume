import { isExampleResume, type Resume } from '../../domain/resume'
import { sectionOrder } from '../../domain/resume-layout'
import { RichText } from './RichText'
export function ResumeDocument({ resume }: { resume: Resume }) {
  const sections = {
    summary: resume.summary ? (
      <ResumeSection key="summary" title="关于我" english="PROFILE">
        <RichText className="resume-summary" value={resume.summary} />
      </ResumeSection>
    ) : null,
    experience: resume.experience.length ? (
      <ResumeSection key="experience" title="工作经历" english="EXPERIENCE">
        {resume.experience.map((job, i) => (
          <div className="resume-job" key={i}>
            <div className="job-heading">
              <strong>{job.company}</strong>
              <time>{job.period}</time>
            </div>
            <h3>{job.role}</h3>
            <ul>
              {job.bullets.map((b, j) => (
                <li key={j}>
                  <RichText value={b} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </ResumeSection>
    ) : null,
    skills: resume.skills.length ? (
      <ResumeSection key="skills" title="专业技能" english="EXPERTISE">
        <div className="resume-skills">
          {resume.skills.map((s, i) => (
            <div
              key={i}
              className={`resume-skill ${s.includes('\n') ? 'resume-skill-block' : ''}`}
            >
              <RichText value={s} />
            </div>
          ))}
        </div>
      </ResumeSection>
    ) : null,
    education: resume.education ? (
      <ResumeSection key="education" title="教育背景" english="EDUCATION">
        <p>{resume.education}</p>
      </ResumeSection>
    ) : null,
  }
  return (
    <article
      className={`resume-paper ${resume.template}`}
      aria-label="简历预览"
    >
      {isExampleResume(resume) ? (
        <p className="resume-example-note">示例简历 · 虚构内容，仅供体验</p>
      ) : null}
      <header className="resume-heading">
        <div>
          <h1>{resume.name}</h1>
          <p>{resume.title}</p>
        </div>
        <span className="resume-monogram">{resume.name.slice(0, 1)}</span>
      </header>
      <div className="resume-contact">
        {[resume.location, resume.email].filter(Boolean).join('　 /　 ')}
      </div>
      {sectionOrder(resume).map((id) => sections[id])}
      <footer className="resume-footer">
        <span>
          {resume.name} / {resume.title}
        </span>
        <span>01</span>
      </footer>
    </article>
  )
}
function ResumeSection({
  title,
  english,
  children,
}: {
  title: string
  english: string
  children: React.ReactNode
}) {
  return (
    <section className="resume-section">
      <h2>
        {title}
        <span>{english}</span>
      </h2>
      {children}
    </section>
  )
}
