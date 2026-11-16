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
        <h2>今天先改哪一块？</h2>
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
            <span>拖入 PDF / Word 或直接贴经历，整理成好改的底稿</span>
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
                ? '去套话、突出重点，改完右侧实时看效果'
                : '导入简历后，可以直接聊怎么顺措辞、调顺序'}
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
                ? '贴入目标岗位 JD，单独拉一份投递稿，不改乱原简历'
                : '导入简历后，可按目标 JD 单独生成投递版本'}
            </span>
          </span>
          <ArrowUpRight size={15} aria-hidden="true" />
        </button>
      </div>
    </section>
  )
}
