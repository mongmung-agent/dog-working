import { useEffect, useRef } from 'react';
import { startMeadow } from './game/runtime';
import { THEMES } from './game/themes';

function Icon({ name }: { name: string }) {
  return (
    <svg aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  );
}

function Symbols() {
  return (
    <svg className="symbols" aria-hidden="true">
      <defs>
        <symbol id="i-call" viewBox="0 0 24 24">
          <path d="m3 10 11-5v14L3 14Zm3 5 2 6h3l-2-5M18 8q5 4 0 8M18 3q10 9 0 18" />
        </symbol>
        <symbol id="i-pet" viewBox="0 0 24 24">
          <path
            d="M7 12V6q0-3 2-3t2 3v4-6q0-3 2-3t2 3v6-4q0-2 2-2t2 2v5-2q0-2 2-2t2 2v7q-1 7-8 7H11l-8-8q-2-3 1-3Z"
            transform="translate(-1 0) scale(.95)"
          />
        </symbol>
        <symbol id="i-treat" viewBox="0 0 24 24">
          <path d="m8 6 10 10c6-1 5 8 0 5-3 4-7-1-4-4L5 8C0 10-1 3 4 3c1-5 7-1 4 3Z" />
        </symbol>
        <symbol id="i-sound" viewBox="0 0 24 24">
          <path d="M3 9h4l5-4v14l-5-4H3ZM16 8q5 4 0 8M19 4q9 8 0 16" />
        </symbol>
        <symbol id="i-settings" viewBox="0 0 24 24">
          <path d="M9.5 3h5l.5 2.5 1.5.9 2.4-.8 2.5 4.3-1.9 1.7v1.8l1.9 1.7-2.5 4.3-2.4-.8-1.5.9-.5 2.5h-5L9 19.5l-1.5-.9-2.4.8-2.5-4.3 1.9-1.7v-1.8L2.6 9.9l2.5-4.3 2.4.8L9 5.5Z" />
          <circle cx="12" cy="12.5" r="3.5" />
        </symbol>
        <symbol id="i-close" viewBox="0 0 24 24">
          <path d="m6 6 12 12M18 6 6 18" />
        </symbol>
      </defs>
    </svg>
  );
}

export default function App() {
  const initialized = useRef(false);
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      startMeadow();
    }
  }, []);
  return (
    <>
      <Symbols />
      <div id="app">
        <div className="floating-controls" aria-label="소리와 설정">
          <button id="sound" className="icon-button" aria-label="소리 켜기" aria-pressed="false">
            <Icon name="sound" />
            <span className="mute-mark" />
          </button>
          <button id="settings" className="icon-button" aria-label="설정">
            <Icon name="settings" />
          </button>
        </div>
        <main id="field" aria-label="네 친구가 뛰노는 들판">
          <canvas id="landscape" aria-hidden="true" />
          <canvas id="ambient" aria-hidden="true" />
          <div id="pets" />
          <div id="effects" aria-hidden="true" />
          <button
            id="play-ball"
            className="play-ball"
            aria-label="공 굴리기, 드래그로 옮기기"
            hidden
          >
            <img src="/toys/ball.svg?v=2" width="36" height="36" alt="" draggable="false" />
          </button>
          <div id="arrival" aria-hidden="true">
            <span></span>
          </div>
          <div id="hint" className="hint" hidden>
            <span id="hint-text">친구를 불러보세요</span>
            <button id="dismiss-hint" aria-label="안내 닫기">
              ×
            </button>
          </div>
          <div id="toast" role="status" aria-live="polite" />
        </main>
        <button
          id="ball-toggle"
          className="icon-button"
          aria-label="공 꺼내기"
          aria-pressed="false"
          title="공 꺼내기"
        >
          <img src="/toys/ball.svg?v=2" width="24" height="24" alt="" />
        </button>
        <footer className="dock">
          <div id="call-controls" role="group" aria-label="친구 부르기" hidden>
            <button id="call-all" className="call-choice call-everyone">
              <span className="call-all-icon" aria-hidden="true">
                🐾
              </span>
              <span>모두 부르기</span>
            </button>
            <div id="call-choices" />
          </div>
          <div className="dock-note">
            <span className="tiny-flower">✿</span>
            <p></p>
          </div>
          <nav className="tools" aria-label="교감 도구">
            <button id="call" className="tool" aria-controls="call-controls" aria-expanded="false">
              <Icon name="call" />
              <span>부르기</span>
            </button>
            <span className="tool-divider" />
            <button id="pet-tool" className="tool selected" aria-pressed="true">
              <Icon name="pet" />
              <span>쓰다듬기</span>
              <i />
            </button>
            <button id="treat-tool" className="tool" aria-pressed="false">
              <Icon name="treat" />
              <span>간식</span>
              <i />
            </button>
          </nav>
          <p className="dock-help" id="theme-name" aria-live="polite">
            햇살 들판
          </p>
        </footer>
        <div
          id="welcome"
          className="welcome"
          role="dialog"
          aria-modal="true"
          aria-label="네 발달린 친구들 시작"
        >
          <div className="poster-intro">
            <div className="intro-stage" aria-label="꽃이 핀 들판을 달려오는 네 친구">
              <img id="intro-background" alt="" aria-hidden="true" />
              <canvas
                id="intro-logo"
                aria-label="네 발달린 친구들 · 부르면 달려오는 작은 행복"
                role="img"
              />
              <canvas
                id="intro-minky"
                className="intro-animal"
                aria-label="왼쪽 귀를 살짝 들고 달려오는 밍키"
                role="img"
              />
              <canvas
                id="intro-mongsil"
                className="intro-animal"
                aria-label="신나게 달려오는 다롱이"
                role="img"
              />
            </div>
            <div className="intro-actions">
              <button id="start" className="primary" disabled>
                함께하기
              </button>
              <button
                id="intro-sound"
                className="icon-button intro-sound"
                aria-label="소리 켜기"
                aria-pressed="false"
              >
                <Icon name="sound" />
                <span className="mute-mark" />
              </button>
            </div>
          </div>
        </div>
      </div>
      <dialog id="settings-dialog" className="sheet" aria-label="설정">
        <div className="dialog-title">
          <div>
            <h2>설정</h2>
          </div>
          <button className="icon-button close" aria-label="닫기">
            <Icon name="close" />
          </button>
        </div>
        <fieldset className="theme-picker" id="theme-picker">
          <legend>배경 선택</legend>
          <div className="theme-grid">
            {THEMES.map((theme) => (
              <label className="theme-tile" key={theme.id}>
                <input
                  type="radio"
                  name="theme"
                  value={theme.id}
                  defaultChecked={theme.id === 'meadow'}
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
            마음에 드는 풍경을 골라 주세요.
          </p>
        </fieldset>
        <label className="setting">
          소리 켜기
          <input id="sound-toggle" type="checkbox" role="switch" />
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
          />
        </label>
        <label className="setting">
          움직이는 효과 줄이기
          <input id="reduce-toggle" type="checkbox" role="switch" />
        </label>
        <p className="settings-note">설정은 이 기기에 저장돼요.</p>
      </dialog>
    </>
  );
}
