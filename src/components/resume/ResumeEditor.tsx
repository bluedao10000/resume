import { useState } from 'react'
import { ConfirmDelete } from '../ConfirmDelete'
import type { Resume } from '../../domain/resume'
import { RichTextEditor } from './RichTextEditor'
import { listMarkdown, markdownItems } from '../../domain/rich-text'
export function ResumeEditor({
  resume,
  onChange,
}: {
  resume: Resume
  onChange: (r: Resume) => void
}) {
  const [pendingDelete, setPendingDelete] = useState<number | null>(null)
  function field(key: keyof Resume, value: string) {
    onChange({ ...resume, [key]: value })
  }
  return (
    <div className="resume-editor">
      {(['name', 'title', 'email', 'location'] as const).map((key) => (
        <label key={key}>
          {
            {
              name: '姓名',
              title: '目标职位',
              email: '邮箱',
              location: '所在城市',
            }[key]
          }
          <input
            value={resume[key]}
            onChange={(e) => field(key, e.target.value)}
          />
        </label>
      ))}
      <RichTextEditor
        label="个人简介"
        value={resume.summary}
        onChange={(value) => field('summary', value)}
      />
      <RichTextEditor
        label="专业技能"
        value={listMarkdown(resume.skills)}
        maxListItems={30}
        onChange={(value) =>
          onChange({ ...resume, skills: markdownItems(value) })
        }
      />
      {resume.experience.map((job, i) => (
        <fieldset key={i}>
          <legend>工作经历 {i + 1}</legend>
          {(['company', 'role', 'period'] as const).map((key) => (
            <label key={key}>
              {{ company: '公司', role: '职位', period: '时间' }[key]}
              <input
                value={job[key]}
                onChange={(e) =>
                  onChange({
                    ...resume,
                    experience: resume.experience.map((j, n) =>
                      n === i ? { ...j, [key]: e.target.value } : j,
                    ),
                  })
                }
              />
            </label>
          ))}
          <RichTextEditor
            label={`工作要点 ${i + 1}`}
            maxListItems={12}
            value={listMarkdown(job.bullets)}
            onChange={(value) =>
              onChange({
                ...resume,
                experience: resume.experience.map((j, n) =>
                  n === i ? { ...j, bullets: markdownItems(value) } : j,
                ),
              })
            }
          />
          <button
            className="text-button danger"
            onClick={() => setPendingDelete(i)}
          >
            删除这段经历
          </button>
        </fieldset>
      ))}
      <button
        className="outline-button"
        onClick={() =>
          onChange({
            ...resume,
            experience: [
              ...resume.experience,
              {
                company: '新公司',
                role: '职位',
                period: '任职时间',
                bullets: ['补充你的工作与成果'],
              },
            ],
          })
        }
      >
        ＋ 添加工作经历
      </button>
      <label>
        教育背景
        <textarea
          value={resume.education}
          onChange={(e) => field('education', e.target.value)}
        />
      </label>
      {pendingDelete !== null && resume.experience[pendingDelete] ? (
        <ConfirmDelete
          title="删除这段经历？"
          name={`${resume.experience[pendingDelete].company} · ${resume.experience[pendingDelete].role}`}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            onChange({
              ...resume,
              experience: resume.experience.filter(
                (_, n) => n !== pendingDelete,
              ),
            })
            setPendingDelete(null)
          }}
        />
      ) : null}
    </div>
  )
}
