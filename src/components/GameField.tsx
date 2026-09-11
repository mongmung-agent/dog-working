import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { useAtomValue } from 'jotai'
import { INFO } from '../game/engine/core'
import { THEMES } from '../game/const/themes'
import { meadowControllerAtom, meadowUiAtom } from '../state/meadow'
import { Toast } from './Toast'

export function GameField() {
  const ui = useAtomValue(meadowUiAtom)
  const controller = useAtomValue(meadowControllerAtom)
  const forwardField =
    (callback: (event: PointerEvent, field: HTMLElement) => void) =>
    (event: ReactPointerEvent<HTMLElement>) =>
      callback(event.nativeEvent, event.currentTarget)
  return (
    <main
      id="field"
      className="meadow-field"
      aria-label={`네 친구가 뛰노는 ${THEMES.find(theme => theme.id === ui.preferences.theme)?.name}`}
      onPointerDown={forwardField((event, field) => controller?.fieldPointerDown(event, field))}
      onPointerMove={event => controller?.fieldPointerMove(event.nativeEvent)}
      onPointerUp={event => controller?.fieldPointerUp(event.nativeEvent)}
      onPointerCancel={() => controller?.cancelFieldPointer()}
      onLostPointerCapture={() => controller?.cancelFieldPointer()}
    >
      <canvas id="landscape" className="landscape" aria-hidden="true" />
      <canvas id="ambient" className="ambient" aria-hidden="true" />
      <div id="pets" className="pets-layer">
        {INFO.map((pet, index) => (
          <button
            className="pet"
            data-pet={pet.name}
            data-index={index}
            style={{ '--pet-color': pet.color } as CSSProperties}
            aria-describedby={`pet-mood-${index}`}
            key={pet.name}
            onClick={event => {
              if (event.detail === 0) controller?.interactFromKeyboard(index)
            }}
          >
            <canvas />
            <span className="state" id={`pet-mood-${index}`} role="img" />
          </button>
        ))}
      </div>
      <div id="effects" className="effects-layer" aria-hidden="true" />
      <button
        id="play-ball"
        className="play-ball"
        aria-label="공 굴리기, 드래그로 옮기기"
        hidden={!ui.ballPresent}
        onPointerDown={event => controller?.ballPointerDown(event.nativeEvent, event.currentTarget)}
        onPointerMove={event => controller?.ballPointerMove(event.nativeEvent)}
        onPointerUp={event => controller?.ballPointerUp(event.nativeEvent)}
        onPointerCancel={() => controller?.cancelBallPointer()}
        onLostPointerCapture={() => controller?.cancelBallPointer()}
        onClick={event => controller?.ballKeyboardClick(event.detail)}
      >
        <img src="/toys/ball.svg?v=2" width="36" height="36" alt="" draggable="false" />
      </button>
      <div id="hint" className="hint" hidden>
        <span id="hint-text">친구를 불러보세요</span>
        <button id="dismiss-hint" aria-label="안내 닫기" onClick={() => controller?.dismissHint()}>
          ×
        </button>
      </div>
      <Toast />
    </main>
  )
}
