import { useEffect, useId, useRef, type RefObject } from 'react'
import { X } from 'lucide-react'
export function Modal({
  title,
  onClose,
  children,
  initialFocusRef,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
  initialFocusRef?: RefObject<HTMLElement | null>
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = ref.current
    const previous = document.activeElement as HTMLElement | null
    dialog?.showModal()
    initialFocusRef?.current?.focus()
    return () => {
      dialog?.close()
      previous?.focus()
    }
  }, [initialFocusRef])
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      aria-labelledby={titleId}
    >
      <div className="modal-heading">
        <h2 id={titleId}>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="关闭">
          <X size={19} />
        </button>
      </div>
      {children}
    </dialog>
  )
}
