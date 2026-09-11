import { Icon } from './Icon';
import { useAtomValue } from 'jotai';
import { meadowControllerAtom, meadowUiAtom } from '../state/meadow';

export function WelcomeDialog() {
  const ui = useAtomValue(meadowUiAtom);
  const controller = useAtomValue(meadowControllerAtom);
  const muted = !ui.preferences.sound;
  return (
    <div
      id="welcome"
      className="welcome"
      role="dialog"
      aria-modal="true"
      aria-label="네 발달린 친구들 시작"
      hidden={ui.started}
    >
      <div className="poster-intro">
        <div className="intro-stage" aria-label="꽃이 핀 들판을 달려오는 네 친구">
          <img id="intro-background" className="intro-background" alt="" aria-hidden="true" />
          <canvas
            id="intro-logo"
            className="intro-logo"
            aria-label="네 발달린 친구들 · 부르면 달려오는 작은 행복"
            role="img"
          />
          <canvas
            id="intro-minky"
            className="intro-animal intro-minky"
            aria-label="왼쪽 귀를 살짝 들고 달려오는 밍키"
            role="img"
          />
          <canvas
            id="intro-mongsil"
            className="intro-animal intro-mongsil"
            aria-label="신나게 달려오는 다롱이"
            role="img"
          />
        </div>
        <div className="intro-actions">
          <button
            id="start"
            className="primary"
            disabled={!ui.ready}
            onClick={() => controller?.start()}
          >
            함께하기
          </button>
          <button
            id="intro-sound"
            className="icon-button intro-sound"
            aria-label={muted ? '소리 켜기' : '소리 끄기'}
            aria-pressed={!muted}
            onClick={() => controller?.toggleSound()}
          >
            <Icon name="sound" />
            <span className="mute-mark" />
          </button>
        </div>
      </div>
    </div>
  );
}
