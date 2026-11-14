import { useRef } from 'react'
import { Modal } from './Modal'

export function ConfirmDelete({
  title,
  name,
  confirmLabel = '确认删除',
  onCancel,
  onConfirm,
}: {
  title: string
  name: string
  confirmLabel?: string
  onCancel: () => void
  onConfirm: () => void
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  return (
    <Modal title={title} onClose={onCancel} initialFocusRef={cancelRef}>
      <p className="confirm-target">{name}</p>
      <div className="confirm-actions">
        <button className="outline-button" ref={cancelRef} onClick={onCancel}>
          取消
        </button>
        <button className="danger-button" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
