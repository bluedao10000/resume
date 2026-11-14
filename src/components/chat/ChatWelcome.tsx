import { ArrowUpRight } from 'lucide-react'

type Props = {
  needsImport: boolean
  hasResume: boolean
  onImport: () => void
  onEdit: () => void
  onJD: () => void
}

export function ChatWelcome(props: Props) {
  return (
    <section className="chat-welcome" aria-label="简历使用引导">
      <div className="chat-welcome-heading">
        <span className="welcome-mark" aria-hidden="true">
          f.
        </span>
        <h2>从这里开始</h2>
      </div>
      <div className="welcome-actions">
        <button
          type="button"
          className={`welcome-action${props.needsImport ? ' import-prompt' : ''}`}
          onClick={props.onImport}
        >
          <span className="welcome-art welcome-art-import" aria-hidden="true">
            <span className="welcome-sheet sheet-back" />
            <span className="welcome-sheet">
              <i />
              <i />
              <i />
              <i />
            </span>
            <span className="welcome-file">PDF / Word</span>
          </span>
          <span className="welcome-copy">
            <strong>
              {props.needsImport ? '导入已有简历' : '导入另一份简历'}
            </strong>
            <span>上传文档或粘贴经历，整理成可编辑的简历</span>
          </span>
          <ArrowUpRight size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="welcome-action"
          onClick={props.onEdit}
          disabled={!props.hasResume}
        >
          <span className="welcome-art welcome-art-edit" aria-hidden="true">
            <span className="welcome-bubble">精简个人简介</span>
            <span className="welcome-edit-lines">
              <i />
              <i />
              <i />
            </span>
          </span>
          <span className="welcome-copy">
            <strong>用对话修改简历</strong>
            <span>
              {props.hasResume
                ? '润色表达、调整顺序，修改直接呈现在预览中'
                : '导入后，可润色表达、调整内容顺序'}
            </span>
          </span>
          <ArrowUpRight size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="welcome-action"
          onClick={props.onJD}
          disabled={!props.hasResume}
        >
          <span className="welcome-art welcome-art-jd" aria-hidden="true">
            <span className="welcome-job">
              JD
              <i />
              <i />
            </span>
            <span className="welcome-match">→</span>
            <span className="welcome-sheet">
              <i />
              <i />
              <i />
              <i />
            </span>
          </span>
          <span className="welcome-copy">
            <strong>按 JD 定制投递版本</strong>
            <span>
              {props.hasResume
                ? '粘贴岗位要求，生成独立版本并保留原简历'
                : '导入后，按岗位要求生成独立投递版本'}
            </span>
          </span>
          <ArrowUpRight size={15} aria-hidden="true" />
        </button>
      </div>
    </section>
  )
}
