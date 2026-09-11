import { useEffect, useId, useRef } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { EMOTIONS } from '../game/const/emotions'
import { emotionGuideOpenAtom, meadowControllerAtom } from '../state/meadow'
import { Icon } from './Icon'

export function EmotionGuideDialog() {
  const [open, setOpen] = useAtom(emotionGuideOpenAtom)
  const controller = useAtomValue(meadowControllerAtom)
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const close = () => {
    setOpen(false)
    controller?.setOverlayOpen(false)
  }
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal()
    if (!open && dialog.current?.open) dialog.current.close()
  }, [open])

  return (
    <dialog
      ref={dialog}
      className="sheet emotion-guide"
      aria-labelledby={titleId}
      onClose={close}
      onCancel={event => {
        event.preventDefault()
        close()
      }}
      onClick={event => {
        if (event.target === dialog.current) {
          const bounds = dialog.current.getBoundingClientRect()
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            close()
        }
      }}
    >
      <div className="dialog-title">
        <h2 id={titleId}>마음 사전</h2>
        <button className="icon-button close" aria-label="마음 사전 닫기" onClick={close}>
          <Icon name="close" />
        </button>
      </div>
      <p className="subtle">친구들 머리 위에 떠오르는 마음을 살펴보세요.</p>
      <dl className="emotion-guide-list dialog-content">
        {Object.entries(EMOTIONS).map(([kind, { emoji, label }]) => (
          <div className="emotion-guide-row" key={kind}>
            <dt>{emoji}</dt>
            <dd>{label}</dd>
          </div>
        ))}
      </dl>
    </dialog>
  )
}
