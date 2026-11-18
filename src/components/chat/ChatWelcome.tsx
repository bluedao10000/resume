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
        <h2>{props.needsImport ? '先导入第一份简历' : '从哪一步开始？'}</h2>
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
              {props.needsImport ? '导入第一份简历' : '导入另一份简历'}
            </strong>
            <span>选择 Word（DOCX）或 PDF，核对原文后整理为简历</span>
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
                ? '说明要改的地方，右侧预览同步更新'
                : '导入简历后，可以用对话调整措辞和顺序'}
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
                ? '粘贴目标岗位 JD，生成独立的投递版本，原简历不变'
                : '导入简历后，可按目标 JD 单独生成投递版本'}
            </span>
          </span>
          <ArrowUpRight size={15} aria-hidden="true" />
        </button>
      </div>
    </section>
  )
}
