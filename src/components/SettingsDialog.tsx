import { useEffect, useRef } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { THEMES } from '../game/const/themes'
import { meadowControllerAtom, meadowUiAtom, settingsOpenAtom } from '../state/meadow'
import { Icon } from './Icon'

export function SettingsDialog() {
  const dialog = useRef<HTMLDialogElement>(null)
  const ui = useAtomValue(meadowUiAtom)
  const controller = useAtomValue(meadowControllerAtom)
  const [open, setOpen] = useAtom(settingsOpenAtom)
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
      id="settings-dialog"
      className="sheet"
      aria-label="설정"
      onClose={close}
      onClick={event => {
        if (event.target === dialog.current) dialog.current.close()
      }}
    >
      <div className="dialog-title">
        <div>
          <h2>설정</h2>
        </div>
        <button
          className="icon-button close"
          aria-label="닫기"
          onClick={() => dialog.current?.close()}
        >
          <Icon name="close" />
        </button>
      </div>
      <div className="dialog-content">
        <fieldset className="theme-picker" id="theme-picker" aria-busy={ui.themeLoading}>
          <legend>배경 선택</legend>
          <div className="theme-grid">
            {THEMES.map(theme => (
              <label className="theme-tile" key={theme.id}>
                <input
                  type="radio"
                  name="theme"
                  value={theme.id}
                  checked={ui.preferences.theme === theme.id}
                  onChange={() => void controller?.selectTheme(theme.id)}
                />
                <span className="theme-card">
                  <img
                    src={theme.thumbnail}
                    alt=""
                    width="320"
                    height="200"
                    loading="lazy"
                    decoding="async"
                  />
                  <span className="theme-check" aria-hidden="true">
                    ✓
                  </span>
                  <span className="theme-title">{theme.name}</span>
                </span>
              </label>
            ))}
          </div>
          <p id="theme-status" className="theme-status" role="status" aria-live="polite">
            {ui.themeStatus}
          </p>
        </fieldset>
        <label className="setting">
          소리 켜기
          <input
            id="sound-toggle"
            type="checkbox"
            role="switch"
            checked={ui.preferences.sound}
            onChange={event => controller?.setPreference('sound', event.target.checked)}
          />
        </label>
        <label className="setting">
          배경음
          <input
            id="music-volume"
            type="range"
            min="0"
            max="100"
            step="5"
            aria-label="배경음 음량"
            value={ui.preferences.music}
            onChange={event => controller?.setPreference('music', Number(event.target.value))}
          />
        </label>
        <label className="setting">
          효과음
          <input
            id="effect-volume"
            type="range"
            min="0"
            max="100"
            step="5"
            aria-label="효과음 음량"
            value={ui.preferences.effects}
            onChange={event => controller?.setPreference('effects', Number(event.target.value))}
          />
        </label>
        <label className="setting">
          움직이는 효과 줄이기
          <input
            id="reduce-toggle"
            type="checkbox"
            role="switch"
            checked={ui.preferences.reduced}
            onChange={event => controller?.setPreference('reduced', event.target.checked)}
          />
        </label>
        <p className="settings-note">설정은 이 기기에 저장돼요.</p>
      </div>
    </dialog>
  )
}
