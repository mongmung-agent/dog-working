import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { INFO } from '../game/engine/core'
import { THEMES } from '../game/const/themes'
import {
  emotionGuideOpenAtom,
  meadowControllerAtom,
  meadowUiAtom,
  settingsOpenAtom,
  toolsOpenAtom,
} from '../state/meadow'
import { Icon } from './Icon'

export function FloatingControls() {
  const { preferences } = useAtomValue(meadowUiAtom)
  const controller = useAtomValue(meadowControllerAtom)
  const setToolsOpen = useSetAtom(toolsOpenAtom)
  const setSettingsOpen = useSetAtom(settingsOpenAtom)
  const soundLabel = preferences.sound ? '소리 끄기' : '소리 켜기'
  return (
    <div className="floating-controls" aria-label="소리와 설정">
      <button
        id="sound"
        className="icon-button"
        aria-label={soundLabel}
        aria-pressed={preferences.sound}
        onClick={() => controller?.toggleSound()}
      >
        <Icon name="sound" />
        <span className="mute-mark" />
      </button>
      <button
        id="settings"
        className="icon-button"
        aria-label="설정"
        onClick={() => {
          setToolsOpen(false)
          controller?.closeCalls()
          controller?.setOverlayOpen(true)
          setSettingsOpen(true)
        }}
      >
        <Icon name="settings" />
      </button>
    </div>
  )
}

export function MeadowDock() {
  const setGuideOpen = useSetAtom(emotionGuideOpenAtom)
  const [toolsOpen, setToolsOpen] = useAtom(toolsOpenAtom)
  const ui = useAtomValue(meadowUiAtom)
  const controller = useAtomValue(meadowControllerAtom)
  return (
    <>
      <footer className="dock">
        <div
          id="call-controls"
          className="call-controls"
          role="group"
          aria-label="친구 부르기"
          hidden={!ui.callsOpen}
        >
          <button
            id="call-all"
            className="call-choice call-everyone"
            onClick={() => controller?.callFriends('all')}
          >
            <span className="call-all-icon" aria-hidden="true">
              🐾
            </span>
            <span>모두 부르기</span>
          </button>
          <div id="call-choices" className="call-choices">
            {INFO.map((pet, index) => (
              <button
                className="call-choice"
                data-call={pet.name}
                aria-label={`${pet.name} 부르기`}
                key={pet.name}
                onClick={() => controller?.callFriends(index)}
              >
                <canvas />
                <span>{pet.name}</span>
              </button>
            ))}
          </div>
        </div>
        <div
          id="tool-controls"
          className="call-controls tool-controls"
          role="group"
          aria-label="놀이 도구"
          hidden={!toolsOpen}
        >
          <button
            className="call-choice ball-choice"
            aria-label="축구공"
            aria-pressed={ui.ballPresent}
            onClick={() => controller?.toggleBall()}
          >
            <img src="/toys/ball.svg?v=2" width="40" height="40" alt="" />
            <span>축구공</span>
          </button>
          <button
            className="call-choice guide-choice"
            aria-haspopup="dialog"
            onClick={() => {
              controller?.setOverlayOpen(true, false)
              setGuideOpen(true)
            }}
          >
            <span className="guide-book" aria-hidden="true">
              📖
            </span>
            <span>마음 사전</span>
          </button>
        </div>
        <nav className="tools" aria-label="교감 도구">
          <button
            id="call"
            className={`tool${ui.callsOpen ? ' selected' : ''}`}
            aria-controls="call-controls"
            aria-expanded={ui.callsOpen}
            onClick={() => {
              setToolsOpen(false)
              controller?.toggleCalls()
            }}
            disabled={!ui.started}
          >
            <Icon name="call" />
            <span>부르기</span>
          </button>
          <span className="tool-divider" />
          <button
            id="pet-tool"
            className={`tool${!ui.callsOpen && !toolsOpen && ui.tool === 'pet' ? ' selected' : ''}`}
            aria-pressed={ui.tool === 'pet'}
            onClick={() => {
              setToolsOpen(false)
              controller?.setTool('pet')
            }}
          >
            <Icon name="pet" />
            <span>쓰다듬기</span>
            <i />
          </button>
          <button
            id="treat-tool"
            className={`tool${!ui.callsOpen && !toolsOpen && ui.tool === 'treat' ? ' selected' : ''}`}
            aria-pressed={ui.tool === 'treat'}
            onClick={() => {
              setToolsOpen(false)
              controller?.setTool('treat')
            }}
          >
            <Icon name="treat" />
            <span>간식</span>
            <i />
          </button>
          <button
            className={`tool tools-tab${toolsOpen ? ' selected' : ''}`}
            aria-controls="tool-controls"
            aria-expanded={toolsOpen}
            onClick={() => {
              controller?.closeCalls()
              setToolsOpen(open => !open)
            }}
            disabled={!ui.started}
          >
            <Icon name="tools" />
            <span>도구</span>
          </button>
        </nav>
        <p className="dock-help theme-name">
          {THEMES.find(theme => theme.id === ui.preferences.theme)?.name}
        </p>
      </footer>
    </>
  )
}
