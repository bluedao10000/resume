import type { Resume } from '../../domain/resume'
import {
  presentationFor,
  type Presentation,
} from '../../domain/resume-presentation'

const controls = [
  {
    key: 'summary',
    label: '个人简介',
    options: [
      ['plain', '正文段落'],
      ['inset', '重点区块'],
    ],
  },
  {
    key: 'skills',
    label: '专业技能',
    options: [
      ['tags', '标签排列'],
      ['list', '逐项清单'],
      ['columns', '双列分组'],
    ],
  },
  {
    key: 'experience',
    label: '工作要点',
    options: [
      ['bullets', '项目符号'],
      ['ruled', '分隔段落'],
    ],
  },
  {
    key: 'density',
    label: '排版密度',
    options: [
      ['comfortable', '舒展'],
      ['compact', '紧凑'],
    ],
  },
] as const

export function ResumeLayoutControls({
  resume,
  disabled,
  onChange,
  onPreview,
}: {
  resume: Resume
  disabled: boolean
  onChange: (resume: Resume) => void
  onPreview: () => void
}) {
  const presentation = presentationFor(resume)
  return (
    <fieldset className="layout-controls" disabled={disabled}>
      <legend>内容排版</legend>
      <div className="layout-control-fields">
        {controls.map(({ key, label, options }) => (
          <label key={key}>
            {label}
            <select
              aria-label={label}
              value={presentation[key]}
              onChange={(event) =>
                onChange({
                  ...resume,
                  presentation: {
                    ...presentation,
                    [key]: event.target.value,
                  } as Presentation,
                })
              }
            >
              {options.map(([value, name]) => (
                <option key={value} value={value}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div className="layout-control-actions">
        <button
          className="text-button"
          disabled={!resume.presentation}
          onClick={() => onChange({ ...resume, presentation: undefined })}
        >
          恢复模板排版
        </button>
        <button className="outline-button" onClick={onPreview}>
          查看简历
        </button>
      </div>
    </fieldset>
  )
}
