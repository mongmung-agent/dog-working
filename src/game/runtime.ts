import { greetingGap } from './layout/art-layout';
import { beginMotion, beginSequence, motionFrame } from './engine/motion';
import { MOTION_SPEC, type MotionId } from './engine/motion-spec';
import { ThemeMusic } from './theme-music';
import { INFO, Meadow, type Tool } from './engine/core';
import { artworkReady, paintPet } from './art';
import { ballVisualScale, ballRadius } from './engine/toys';
import { prepareIntro } from './intro';
import { THEMES, isThemeId, type ThemeId } from './const/themes';
import { Emotions } from './engine/emotions';
import { EMOTIONS } from './const/emotions';

export type MeadowPreferences = {
  theme: ThemeId;
  sound: boolean;
  music: number;
  effects: number;
  reduced: boolean;
  intro: boolean;
};
export type MeadowUiState = {
  preferences: MeadowPreferences;
  started: boolean;
  ready: boolean;
  tool: Tool;
  callsOpen: boolean;
  ballPresent: boolean;
  toast: string;
  themeStatus: string;
  themeLoading: boolean;
};
export type MeadowController = {
  start: () => void;
  dismissHint: () => void;
  toggleSound: () => void;
  setTool: (tool: Tool) => void;
  toggleCalls: () => void;
  closeCalls: () => void;
  callFriends: (id: number | 'all') => void;
  setPreference: <Key extends keyof MeadowPreferences>(
    key: Key,
    value: MeadowPreferences[Key],
  ) => void;
  selectTheme: (id: ThemeId) => Promise<void>;
  toggleBall: () => void;
  setOverlayOpen: (open: boolean, pauseAudio?: boolean) => void;
  interactFromKeyboard: (id: number) => void;
  fieldPointerDown: (event: PointerEvent, field: HTMLElement) => void;
  fieldPointerMove: (event: PointerEvent) => void;
  fieldPointerUp: (event: PointerEvent) => void;
  cancelFieldPointer: () => void;
  ballPointerDown: (event: PointerEvent, ball: HTMLButtonElement) => void;
  ballPointerMove: (event: PointerEvent) => void;
  ballPointerUp: (event: PointerEvent) => void;
  cancelBallPointer: () => void;
  ballKeyboardClick: (detail: number) => void;
};
type PetElement = { button: HTMLButtonElement; canvas: HTMLCanvasElement; state: HTMLSpanElement };
const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

class MeadowSound {
  private context: AudioContext | undefined;
  private master: GainNode | undefined;
  private music: GainNode | undefined;
  private effects: GainNode | undefined;
  private soundtrack: ThemeMusic | undefined;
  constructor(
    private readonly preferences: MeadowPreferences,
    private readonly isPaused: () => boolean,
  ) {
    const AudioContextConstructor =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return;
    this.context = new AudioContextConstructor();
    this.master = this.context.createGain();
    this.master.connect(this.context.destination);
    this.music = this.context.createGain();
    this.music.connect(this.master);
    this.effects = this.context.createGain();
    this.effects.connect(this.master);
    this.soundtrack = new ThemeMusic(this.context, this.music);
    this.apply();
  }
  apply() {
    if (!this.context || !this.master || !this.music || !this.effects) return;
    this.master.gain.value = this.preferences.sound && !this.isPaused() ? 0.6 : 0;
    this.music.gain.value = this.preferences.music / 100;
    this.effects.gain.value = (this.preferences.effects / 100) * 0.18;
    this.soundtrack?.apply(
      this.preferences.theme,
      this.preferences.sound && !this.isPaused() && this.preferences.music > 0,
    );
  }
  wake() {
    if (this.context?.state === 'suspended' && this.preferences.sound) void this.context.resume();
    this.apply();
  }
  private tone(
    frequency: number,
    duration: number,
    gain: number,
    output: GainNode | undefined,
    delay = 0,
    type: OscillatorType = 'sine',
  ) {
    if (!this.context || !output || !this.preferences.sound || this.isPaused()) return;
    const time = this.context.currentTime + delay,
      oscillator = this.context.createOscillator(),
      volume = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    volume.gain.setValueAtTime(0, time);
    volume.gain.linearRampToValueAtTime(gain, time + 0.025);
    volume.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(volume);
    volume.connect(output);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.05);
    oscillator.onended = () => {
      oscillator.disconnect();
      volume.disconnect();
    };
  }
  effect(kind: 'call' | 'pet' | 'eat') {
    const notes = kind === 'call' ? [523, 659, 784] : kind === 'eat' ? [440, 554] : [659, 784];
    notes.forEach((note, index) => this.tone(note, 0.3, 0.45, this.effects, index * 0.1));
  }
}

export function startMeadow(
  onUiChange: (state: MeadowUiState) => void = () => {},
): MeadowController {
  const defaults: MeadowPreferences = {
    theme: 'meadow',
    sound: false,
    music: 35,
    effects: 55,
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
    intro: false,
  };
  const preferences: MeadowPreferences = { ...defaults };
  try {
    const saved = JSON.parse(
      localStorage.getItem('little-meadow-settings') || '{}',
    ) as Partial<MeadowPreferences>;
    if (isThemeId(saved.theme)) preferences.theme = saved.theme;
    (['sound', 'reduced', 'intro'] as const).forEach((key) => {
      if (typeof saved[key] === 'boolean') preferences[key] = saved[key]!;
    });
    (['music', 'effects'] as const).forEach((key) => {
      if (Number.isFinite(saved[key])) preferences[key] = Math.max(0, Math.min(100, saved[key]!));
    });
  } catch {
    /* no saved settings */
  }
  const save = () => {
    try {
      localStorage.setItem('little-meadow-settings', JSON.stringify(preferences));
    } catch {
      /* storage unavailable */
    }
  };
  const requestedSeed = import.meta.env.DEV
    ? new URLSearchParams(location.search).get('seed')
    : null;
  let scenarioSeed = Number(requestedSeed) >>> 0;
  const scenarioRandom =
    requestedSeed === null
      ? Math.random
      : () => {
          scenarioSeed = (scenarioSeed * 1664525 + 1013904223) >>> 0;
          return scenarioSeed / 4294967296;
        };
  const world = new Meadow(scenarioRandom),
    field = byId<HTMLElement>('field'),
    land = byId<HTMLCanvasElement>('landscape'),
    ambient = byId<HTMLCanvasElement>('ambient'),
    pets = byId<HTMLElement>('pets'),
    elements: PetElement[] = INFO.map((_, index) => {
      const button = pets.querySelector<HTMLButtonElement>(`[data-index="${index}"]`);
      if (!button) throw new Error(`Missing pet button: ${index}`);
      const canvas = button.querySelector<HTMLCanvasElement>('canvas'),
        state = button.querySelector<HTMLSpanElement>('.state');
      if (!canvas || !state) throw new Error(`Missing pet artwork: ${index}`);
      return { button, canvas, state };
    });
  const emotions = new Emotions(world.pets);
  let observationPanel: HTMLPreElement | undefined,
    observationAt = -1;
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('observe')) {
    observationPanel = document.createElement('pre');
    observationPanel.setAttribute('aria-label', '행동 관찰');
    Object.assign(observationPanel.style, {
      position: 'fixed',
      left: '8px',
      top: '8px',
      maxWidth: 'min(550px,90vw)',
      maxHeight: '40vh',
      overflow: 'auto',
      fontSize: '11px',
      background: '#fffef2ed',
      padding: '12px',
      zIndex: '1400',
      whiteSpace: 'pre-wrap',
    });
    document.body.append(observationPanel);
  }
  let manualClock = false;
  let motionPreview: { ids: MotionId[]; index: number; elapsed: number; compare: boolean } | null =
    null;
  let started = false,
    tool: Tool = 'pet',
    callsOpen = false,
    overlayOpen = false,
    overlayPausesAudio = true,
    ready = false,
    themeLoading = false,
    themeStatus = '마음에 드는 풍경을 골라 주세요.',
    toastMessage = '',
    activePointer: {
      pointerId: number;
      id: number;
      x: number;
      y: number;
      cancelled: boolean;
    } | null = null,
    last = 0,
    frame = 0,
    toastTimer = 0,
    audio: MeadowSound | undefined,
    slowFrames = 0,
    adaptiveReduced = false,
    windClock = 0,
    motes: { x: number; y: number; phase: number }[] = [];
  const dialogOpen = () => overlayOpen;
  const audioPaused = () => document.hidden || (dialogOpen() && overlayPausesAudio);
  const paused = () => !started || document.hidden || dialogOpen();
  const wakeSound = () => {
    if (!audio && preferences.sound) audio = new MeadowSound(preferences, audioPaused);
    audio?.wake();
  };
  const publishUi = () => {
    onUiChange({
      preferences: { ...preferences },
      started,
      ready,
      tool,
      callsOpen,
      ballPresent: Boolean(world.toys.ball),
      toast: toastMessage,
      themeStatus,
      themeLoading,
    });
  };
  const refreshSettings = () => {
    audio?.apply();
    publishUi();
  };
  const toast = (text: string) => {
    window.clearTimeout(toastTimer);
    toastMessage = text;
    publishUi();
    toastTimer = window.setTimeout(() => {
      toastMessage = '';
      publishUi();
    }, 2300);
  };
  const hint = (text: string) => {
    if (!preferences.intro) {
      byId<HTMLElement>('hint-text').textContent = text;
      byId<HTMLElement>('hint').hidden = false;
    }
  };
  const doneIntro = () => {
    preferences.intro = true;
    save();
    byId<HTMLElement>('hint').hidden = true;
  };
  const setCallsOpen = (open: boolean) => {
    callsOpen = open;
    publishUi();
  };
  const setTool = (next: Tool) => {
    setCallsOpen(false);
    tool = next;
    elements.forEach((element, index) =>
      element.button.setAttribute(
        'aria-label',
        `${INFO[index].name}${tool === 'pet' ? ' 쓰다듬기' : ' 간식 주기'}`,
      ),
    );
    wakeSound();
    publishUi();
  };
  INFO.forEach((_, index) => {
    const portrait =
      byId<HTMLElement>('call-choices').querySelectorAll<HTMLCanvasElement>('canvas')[index];
    paintPet(portrait, { ...world.pets[index], state: 'rest' }, 0, true);
  });
  const cancelPointer = () => {
    if (activePointer) {
      world.pets[activePointer.id].held = false;
      elements[activePointer.id].button.classList.remove('pressed');
      activePointer = null;
    }
  };
  const interact = (id: number) => {
    if (paused() || dialogOpen()) return;
    wakeSound();
    if (world.interact(id, tool)) {
      world.drain().forEach(effect);
      doneIntro();
      toast(`${INFO[id].name} ${tool === 'pet' ? '💗' : '😋'}`);
    } else if (world.pets[id].state === (tool === 'pet' ? 'pet' : 'eat')) {
      emotions.feedback(
        { type: tool === 'pet' ? 'pet' : 'eat', id, name: INFO[id].name },
        world.time,
      );
    }
  };
  const hit = (x: number, y: number, target: EventTarget | null) => {
    const pet = target instanceof Element ? target.closest('.pet') : null;
    if (pet) return Number(pet.getAttribute('data-index'));
    const candidate = world.pets
      .map((item) => ({ item, distance: Math.hypot(x - item.x, y - item.y) }))
      .filter(({ item, distance }) => distance < world.size * 0.48 * world.scale(item))
      .sort((a, b) => a.distance - b.distance)[0];
    return candidate ? candidate.item.id : null;
  };
  const fieldPointerDown: MeadowController['fieldPointerDown'] = (event, target) => {
    if (
      !started ||
      paused() ||
      dialogOpen() ||
      event.button !== 0 ||
      !event.isPrimary ||
      activePointer ||
      world.toys.dragging ||
      (event.target instanceof Element && event.target.closest('#hint,#play-ball'))
    )
      return;
    const rect = target.getBoundingClientRect(),
      id = hit(event.clientX - rect.left, event.clientY - rect.top, event.target);
    if (id === null) return;
    event.preventDefault();
    activePointer = {
      pointerId: event.pointerId,
      id,
      x: event.clientX,
      y: event.clientY,
      cancelled: false,
    };
    world.pets[id].held = true;
    elements[id].button.classList.add('pressed');
    target.setPointerCapture(event.pointerId);
  };
  const fieldPointerMove: MeadowController['fieldPointerMove'] = (event) => {
    if (
      activePointer?.pointerId === event.pointerId &&
      Math.hypot(event.clientX - activePointer.x, event.clientY - activePointer.y) > 10
    ) {
      activePointer.cancelled = true;
      world.pets[activePointer.id].held = false;
      elements[activePointer.id].button.classList.remove('pressed');
    }
  };
  const fieldPointerUp: MeadowController['fieldPointerUp'] = (event) => {
    if (activePointer?.pointerId !== event.pointerId) return;
    const pointer = activePointer;
    cancelPointer();
    if (!pointer.cancelled) interact(pointer.id);
  };
  const callFriends = (id: number | 'all') => {
    setCallsOpen(false);
    wakeSound();
    world.call(id);
    world.drain().forEach(effect);
    audio?.effect('call');
    hint('다가온 친구를 쓰다듬어 주세요');
    toast(id === 'all' ? '얘들아, 이리 와!' : `${INFO[id].name}야, 이리 와!`);
  };
  const toggleSound = () => {
    preferences.sound = !preferences.sound;
    save();
    refreshSettings();
    wakeSound();
  };
  const setOverlayOpen = (open: boolean, pauseAudio = true) => {
    overlayOpen = open;
    overlayPausesAudio = pauseAudio;
    if (open) audio?.apply();
    else wakeSound();
  };
  const start = () => {
    if (!ready) return;
    started = true;
    wakeSound();
    hint('친구를 불러보세요');
    world.pets.forEach((pet) => world.choose(pet));
    publishUi();
  };
  const setPreference: MeadowController['setPreference'] = (key, value) => {
    preferences[key] = value;
    save();
    refreshSettings();
    wakeSound();
  };
  const rng = (seed: number) => () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const themeImages = new Map<ThemeId, HTMLImageElement>();
  // Only the selected background blocks startup. Load other themes on demand.
  const themeLoads = new Map<ThemeId, Promise<boolean>>();
  const loadTheme = (id: ThemeId): Promise<boolean> => {
    const pending = themeLoads.get(id);
    if (pending) return pending;
    const promise = new Promise<boolean>((resolve) => {
      const image = new Image();
      image.onload = () => {
        themeImages.set(id, image);
        resolve(true);
      };
      image.onerror = () => {
        themeLoads.delete(id);
        resolve(false);
      };
      image.src = THEMES.find((theme) => theme.id === id)!.image;
    });
    themeLoads.set(id, promise);
    return promise;
  };
  const themesReady = loadTheme(preferences.theme).then(async (loaded) => {
    if (!loaded) {
      preferences.theme = 'meadow';
      save();
      if (!(await loadTheme('meadow'))) throw new Error('Meadow background failed');
    }
  });
  let themeRequest = 0;
  const selectTheme = async (value: ThemeId) => {
    const request = ++themeRequest;
    themeLoading = true;
    themeStatus = '배경을 불러오고 있어요…';
    refreshSettings();
    if (!themeImages.has(value)) toast('배경을 불러오고 있어요');
    const loaded = await loadTheme(value);
    if (request !== themeRequest) return;
    themeLoading = false;
    if (!loaded) {
      refreshSettings();
      themeStatus = '불러오지 못했어요. 다시 선택해 주세요.';
      publishUi();
      toast('배경을 불러오지 못했어요. 다시 시도해 주세요.');
      return;
    }
    themeStatus = `${THEMES.find((theme) => theme.id === value)!.name} 적용됨`;
    preferences.theme = value;
    save();
    refreshSettings();
    landscape();
  };
  const landscape = () => {
    const background = themeImages.get(preferences.theme);
    const scale = 2,
      width = Math.max(1, Math.ceil(field.clientWidth / scale)),
      height = Math.max(1, Math.ceil(field.clientHeight / scale));
    land.width = width;
    land.height = height;
    ambient.width = width;
    ambient.height = height;
    const context = land.getContext('2d')!;
    context.imageSmoothingEnabled = false;
    context.fillStyle = '#abc451';
    context.fillRect(0, 0, width, height);
    if (background?.complete && background.naturalWidth) {
      const ratio = Math.max(width / background.naturalWidth, height / background.naturalHeight),
        w = background.naturalWidth * ratio,
        h = background.naturalHeight * ratio;
      context.drawImage(
        background,
        Math.round((width - w) / 2),
        Math.round((height - h) / 2),
        Math.ceil(w),
        Math.ceil(h),
      );
    }
    const random = rng(9413);
    motes = Array.from({ length: 16 }, () => ({
      x: random() * width,
      y: random() * height,
      phase: random() * 6.28,
    }));
  };
  const ballButton = byId<HTMLButtonElement>('play-ball');
  let lastBallPresent = false;
  let ballDrag: {
    id: number;
    x: number;
    y: number;
    ox: number;
    oy: number;
    moved: boolean;
    samples: { x: number; y: number; t: number }[];
  } | null = null;
  const endBallDrag = () => {
    const drag = ballDrag;
    ballDrag = null;
    world.toys.endDrag();
    if (drag && ballButton.hasPointerCapture(drag.id)) ballButton.releasePointerCapture(drag.id);
  };
  const toggleBall = () => {
    if (paused()) return;
    endBallDrag();
    if (world.toys.ball) world.toys.remove();
    else {
      const bounds = world.bounds();
      world.toys.place(world.width * 0.5, bounds.top + (bounds.bottom - bounds.top) * 0.5);
      toast('공을 누르면 굴리고, 빠르게 밀어 놓으면 던져요');
    }
    publishUi();
  };
  const ballPointerDown: MeadowController['ballPointerDown'] = (event, target) => {
    if (
      paused() ||
      activePointer ||
      ballDrag ||
      !event.isPrimary ||
      event.button !== 0 ||
      !world.toys.ball
    )
      return;
    event.preventDefault();
    const rect = field.getBoundingClientRect();
    ballDrag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      ox: world.toys.ball.x - (event.clientX - rect.left),
      oy: world.toys.ball.y - (event.clientY - rect.top),
      moved: false,
      samples: [{ x: event.clientX, y: event.clientY, t: event.timeStamp }],
    };
    world.toys.beginDrag();
    target.setPointerCapture(event.pointerId);
  };
  const ballPointerMove: MeadowController['ballPointerMove'] = (event) => {
    if (ballDrag?.id !== event.pointerId) return;
    if (paused()) {
      endBallDrag();
      return;
    }
    ballDrag.samples.push({ x: event.clientX, y: event.clientY, t: event.timeStamp });
    ballDrag.samples = ballDrag.samples.filter((s) => event.timeStamp - s.t <= 120).slice(-12);
    ballDrag.moved ||= Math.hypot(event.clientX - ballDrag.x, event.clientY - ballDrag.y) > 6;
    if (ballDrag.moved) {
      const rect = field.getBoundingClientRect();
      world.toys.moveDrag(
        event.clientX - rect.left + ballDrag.ox,
        event.clientY - rect.top + ballDrag.oy,
      );
    }
  };
  const ballPointerUp: MeadowController['ballPointerUp'] = (event) => {
    if (ballDrag?.id !== event.pointerId) return;
    const drag = ballDrag,
      tap = !drag.moved,
      first = drag.samples[0],
      elapsed = (event.timeStamp - first.t) / 1000;
    endBallDrag();
    if (!paused()) {
      if (tap) world.toys.roll();
      else if (elapsed > 0.008 && elapsed < 0.18)
        world.toys.throwBall(
          (event.clientX - first.x) / elapsed,
          (event.clientY - first.y) / elapsed,
        );
    }
  };
  const ballKeyboardClick: MeadowController['ballKeyboardClick'] = (detail) => {
    if (detail === 0 && !paused()) world.toys.roll();
  };
  window.addEventListener('blur', endBallDrag);
  window.addEventListener('resize', endBallDrag);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) endBallDrag();
  });
  const render = (delta: number) => {
    const ball = world.toys.ball,
      ballElement = byId<HTMLElement>('play-ball');
    if (Boolean(ball) !== lastBallPresent) {
      lastBallPresent = Boolean(ball);
      publishUi();
    }
    if (ball) {
      ballElement.style.left = `${ball.x}px`;
      ballElement.style.top = `${ball.y - ball.z}px`;
      ballElement.style.transform = `translate(-50%,-50%)`;
      ballElement.style.setProperty('--ball-height', `${ball.z}px`);
      ballElement.style.setProperty('--shadow-opacity', String(Math.max(0.15, 1 - ball.z / 250)));
      ballElement.querySelector<HTMLElement>('img')!.style.transform =
        `scale(${ballVisualScale(ball.y, world.height)}) rotate(${(ball.angle * 180) / Math.PI}deg)`;
      ballElement.style.zIndex = world.toys.dragging ? '1190' : '9';
    }
    const now = world.time;
    world.pets.forEach((pet, index) => {
      const element = elements[index],
        width = element.button.offsetWidth,
        height = element.button.offsetHeight;
      element.button.style.transform = `translate(${Math.round(pet.x - width / 2)}px,${Math.round(pet.y - height / 2)}px) scale(${world.scale(pet).toFixed(4)})`;
      element.button.style.zIndex = String(10 + Math.round(pet.y));
      element.button.classList.toggle(
        'active',
        ['eat', 'pet', 'coming', 'notice', 'wait'].includes(pet.state),
      );
      element.button.dataset.state = pet.state;
      element.button.dataset.facing = pet.facing;
      element.button.dataset.motion = pet.motion?.id || '';
      element.button.dataset.frame = pet.motion ? String(motionFrame(pet.motion)) : '';
      const expression = emotions.get(pet.id),
        mood = expression?.mood || pet.state;
      if (element.state.textContent !== EMOTIONS[mood].emoji) {
        element.state.textContent = EMOTIONS[mood].emoji;
      }
      element.state.setAttribute(
        'aria-label',
        `${expression?.partner != null ? INFO[expression.partner].name + '와 함께 · ' : ''}${EMOTIONS[mood].label}`,
      );
      element.state.classList.toggle('visible', Boolean(expression));
      const bounds = paintPet(
        element.canvas,
        pet,
        now,
        false,
        preferences.reduced || adaptiveReduced,
      );
      if (bounds) {
        const depth = world.scale(pet);
        // The bottom of the emoji sits 4 screen pixels above the drawn sprite.
        element.state.style.top = `${(bounds.y / 256) * height - 4 / depth}px`;
        element.state.style.setProperty('--emotion-scale', String(1 / depth));
      }
    });
    const context = ambient.getContext('2d')!;
    context.clearRect(0, 0, ambient.width, ambient.height);
    if (!preferences.reduced && !adaptiveReduced) {
      windClock += delta;
      motes.forEach((mote) => {
        context.fillStyle = '#ffffde88';
        context.fillRect(
          Math.round((mote.x + windClock * 1.7) % ambient.width),
          Math.round(mote.y + Math.sin(windClock * 0.6 + mote.phase) * 3),
          1,
          1,
        );
      });
    }
  };
  const resize = () => {
    cancelPointer();
    endBallDrag();
    const size = elements[0]?.canvas.offsetWidth || 120;
    world.resize(field.clientWidth, field.clientHeight, size);
    landscape();
    render(0);
  };
  new ResizeObserver(resize).observe(field);
  document.addEventListener('visibilitychange', () => {
    cancelPointer();
    last = 0;
    audio?.apply();
  });
  window.addEventListener('blur', cancelPointer);
  const effect = (event: ReturnType<Meadow['drain']>[number]) => {
    const pet = world.pets[event.id];
    emotions.feedback(event, world.time);
    if (event.type === 'pet' || event.type === 'eat') {
      audio?.effect(event.type);
      const count = preferences.reduced ? 1 : event.type === 'pet' ? 3 : 1;
      for (let index = 0; index < count; index += 1) {
        const element = document.createElement('span');
        element.className = event.type === 'pet' ? 'heart' : 'treat';
        element.textContent = event.type === 'pet' ? '♥' : '✦';
        element.style.left = `${pet.x + (index - 1) * 14}px`;
        element.style.top = `${pet.y - world.size * world.scale(pet) * 0.4}px`;
        element.style.animationDelay = `${index * 0.14}s`;
        byId<HTMLElement>('effects').append(element);
        window.setTimeout(() => element.remove(), 2200);
      }
    }
  };
  const loop = (time: number) => {
    if (observationPanel && world.time - observationAt > 0.5) {
      observationAt = world.time;
      const log = world.observation.snapshot();
      observationPanel.textContent = JSON.stringify(
        {
          time: Math.round(world.time * 10) / 10,
          pets: world.pets.map((p) => ({
            name: p.name,
            state: p.state,
            motion: p.motion?.id,
            joy: +p.mind.joy.toFixed(2),
            surprise: +p.mind.surprise.toFixed(2),
            comfortNeed: +p.mind.comfortNeed.toFixed(2),
          })),
          active: log.active,
          candidates: log.candidates.slice(0, 4),
          recent: log.events.slice(-4),
          motionStarts: log.motionStarts,
          displayedTiles: Object.keys(log.displaySeconds).length,
        },
        null,
        2,
      );
    }
    const elapsed = last ? (time - last) / 1000 : 0;
    last = time;
    if (motionPreview) {
      const preview = motionPreview;
      preview.elapsed += Math.min(elapsed, 0.05);
      const duration = preview.compare ? 1.2 : MOTION_SPEC[preview.ids[preview.index]].seconds;
      if (preview.elapsed >= duration) {
        preview.elapsed = 0;
        preview.index = (preview.index + 1) % preview.ids.length;
        for (const pet of world.pets) beginMotion(pet, preview.ids[preview.index]);
      }
      for (const pet of world.pets)
        if (pet.motion) pet.motion.elapsed = preview.compare ? 0 : preview.elapsed;
    }
    slowFrames = elapsed > 0.045 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
    adaptiveReduced = slowFrames > 100;
    if (!paused() && !manualClock) {
      world.update(elapsed);
      world.drain().forEach(effect);
      emotions.update(world.pets, world.time, world.size);
    }
    if (started && !document.hidden && (frame++ % 2 === 0 || !preferences.reduced))
      render(Math.min(elapsed, 0.05));
    requestAnimationFrame(loop);
  };
  if ((import.meta as ImportMeta & { env: { DEV: boolean } }).env.DEV) {
    const dev = window as Window & {
      render_game_to_text?: () => string;
      advanceTime?: (ms: number) => void;
      __meadowDebug?: {
        world: Meadow;
        gesture: (id: MotionId, facing?: 'left' | 'right') => void;
        resume: () => void;
      };
    };
    dev.render_game_to_text = () =>
      JSON.stringify({
        origin: 'top-left; x right; y down',
        started,
        time: world.time,
        theme: preferences.theme,
        pets: world.pets.map((p) => ({
          id: p.id,
          name: p.name,
          x: p.x,
          y: p.y,
          state: p.state,
          facing: p.facing,
          motion: p.motion?.id,
          frame: p.motion ? motionFrame(p.motion) : null,
          pendingCall: p.pendingCall,
        })),
        ball: world.toys.ball,
        observation: world.observation.snapshot(),
      });
    dev.advanceTime = (ms) => {
      manualClock = true;
      const steps = Math.max(1, Math.ceil(Math.max(0, ms) / 16));
      for (let i = 0; i < steps; i++) {
        world.update(Math.max(0, ms) / 1000 / steps);
        world.drain().forEach(effect);
      }
      emotions.update(world.pets, world.time, world.size);
      render(0);
    };
    dev.__meadowDebug = {
      world,
      gesture(id, facing = 'right') {
        manualClock = true;
        for (const p of world.pets) {
          world.social.cancel(p.id);
          world.toys.cancel(p.id);
          p.target = null;
          p.state = 'rest';
          p.near = false;
          p.pendingCall = false;
          p.held = false;
          p.timer = 100;
          p.facing = facing;
          p.x = world.width * (0.17 + p.id * 0.22);
          p.y = world.height * 0.65;
          beginMotion(p, id);
        }
        render(0);
      },
      resume() {
        manualClock = false;
      },
    };
  }
  Promise.all([artworkReady, prepareIntro(), themesReady])
    .then(() => {
      if (!themeImages.has(preferences.theme)) {
        preferences.theme = 'meadow';
        save();
        refreshSettings();
      }
      if (!themeImages.has(preferences.theme)) throw new Error('Selected background failed');
      document
        .querySelectorAll<HTMLCanvasElement>('#call-choices canvas')
        .forEach((canvas, index) =>
          paintPet(canvas, { ...world.pets[index], state: 'rest' }, 0, true),
        );
      ready = true;
      publishUi();
      if ((import.meta as ImportMeta & { env: { DEV: boolean } }).env.DEV) {
        const query = new URLSearchParams(location.search),
          id = query.get('motion');
        if (query.get('scenario') === 'sleep-cycle') {
          started = true;
          manualClock = true;
          publishUi();
          world.pets.forEach((p) => {
            p.state = 'sleep';
            p.target = null;
            p.timer = 1000;
            p.near = false;
            p.facing = query.get('direction') === 'left' ? 'left' : 'right';
            beginSequence(p, ['sit', 'lie', 'sleep']);
          });
          const controls = document.createElement('div'),
            status = document.createElement('pre');
          controls.setAttribute('aria-label', '수면 주기 검수');
          Object.assign(controls.style, {
            position: 'fixed',
            top: '8px',
            left: '8px',
            zIndex: '1400',
            background: '#fffef2',
            padding: '10px',
          });
          const refresh = () => {
            emotions.update(world.pets, world.time, world.size);
            render(0);
            status.textContent = JSON.stringify({
              time: +world.time.toFixed(2),
              reduced: preferences.reduced,
              pets: world.pets.map((p) => ({
                state: p.state,
                motion: p.motion?.id,
                frame: p.motion ? motionFrame(p.motion) : null,
                x: p.x,
                y: p.y,
              })),
            });
          };
          const actions: [string, () => void][] = [
            [
              '0.5초 진행',
              () => {
                for (let i = 0; i < 10; i++) {
                  world.update(0.05);
                  world.drain().forEach((e) => emotions.feedback(e, world.time));
                }
              },
            ],
            ['모두 깨우기', () => world.call('all')],
            [
              '동작 축소 전환',
              () => {
                preferences.reduced = !preferences.reduced;
              },
            ],
          ];
          actions.forEach(([label, run]) => {
            const button = document.createElement('button');
            button.textContent = label;
            button.onclick = () => {
              run();
              refresh();
            };
            controls.append(button);
          });
          controls.append(status);
          document.body.append(controls);
          refresh();
        }
        if (query.get('scenario') === 'comfort') {
          started = true;
          manualClock = true;
          byId<HTMLElement>('welcome').hidden = true;
          const controls = document.createElement('div'),
            status = document.createElement('pre');
          controls.setAttribute('aria-label', '자연 위로 검수');
          Object.assign(controls.style, {
            position: 'fixed',
            top: '8px',
            left: '8px',
            zIndex: '1400',
            background: '#fffef2',
            padding: '10px',
          });
          let launched = false;
          const stage = () =>
            world.social.history.some(
              (e) => e.kind === 'comfort' && e.partner === 0 && e.result === 'completed',
            )
              ? 'completed'
              : (world.observation
                  .snapshot()
                  .active.find((e) => e.kind === 'comfort' && e.partner === 0)?.phase ?? 'waiting');
          const refresh = () => {
            emotions.update(world.pets, world.time, world.size);
            render(0);
            status.textContent = JSON.stringify({
              time: +world.time.toFixed(2),
              stage: stage(),
              surprise: +world.pets[0].mind.surprise.toFixed(4),
              need: +world.pets[0].mind.comfortNeed.toFixed(4),
              width: world.width,
              height: world.height,
              size: world.size,
            });
          };
          const actions: [string, () => void][] = [
            [
              '공 굴리기',
              () => {
                if (launched) return;
                launched = true;
                const m = world.pets[0];
                world.toys.place(
                  m.x + 25,
                  world.toys.groundY(m) - ballRadius(world.toys.groundY(m), world.height),
                );
                world.toys.throwBall(-150, 0);
                world.update(0.05);
                world.drain().forEach((e) => emotions.feedback(e, world.time));
              },
            ],
            [
              '다음 위로 단계',
              () => {
                const previous = stage();
                for (let i = 0; i < 2400; i++) {
                  world.update(0.05);
                  world.drain().forEach((e) => emotions.feedback(e, world.time));
                  emotions.update(world.pets, world.time, world.size);
                  if (stage() !== previous) break;
                }
              },
            ],
          ];
          actions.forEach(([label, run]) => {
            const button = document.createElement('button');
            button.textContent = label;
            button.onclick = () => {
              run();
              refresh();
            };
            controls.append(button);
          });
          controls.append(status);
          document.body.append(controls);
          refresh();
        }
        if (query.get('scenario') === 'emotions') {
          started = true;
          manualClock = true;
          byId<HTMLElement>('welcome').hidden = true;
          world.pets.forEach((p) => {
            p.motion = undefined;
            p.state = 'rest';
            p.target = null;
            p.timer = 100;
            p.near = false;
          });
          const controls = document.createElement('div');
          controls.setAttribute('aria-label', '감정 표시 검수');
          Object.assign(controls.style, {
            position: 'fixed',
            top: '8px',
            left: '8px',
            zIndex: '1400',
            background: '#fffef2',
            padding: '10px',
          });
          const refresh = () => {
            emotions.update(world.pets, world.time, world.size);
            render(0);
          };
          const actions: [string, () => void][] = [
            [
              '인사·놀이·위로·거절',
              () => {
                world.time += 3;
                world.pets.forEach((p, i) => {
                  p.state = 'lie';
                  emotions.feedback(
                    {
                      type: 'social',
                      id: i,
                      name: p.name,
                      kind: i === 0 ? 'greet' : i === 1 ? 'play' : 'comfort',
                      partner: (i + 1) % 4,
                      result: i === 3 ? 'declined' : undefined,
                    },
                    world.time,
                  );
                });
              },
            ],
            [
              '초대·안도·산책·탐색',
              () => {
                world.time += 3;
                world.pets.forEach((p, i) =>
                  emotions.feedback(
                    {
                      type: 'social',
                      id: i,
                      name: p.name,
                      kind: i === 0 ? 'play' : i === 1 ? 'comfort' : i === 2 ? 'stroll' : 'sniff',
                      partner: (i + 1) % 4,
                      phase: i === 0 ? 'inviting' : undefined,
                      result: i === 1 ? 'completed' : undefined,
                    },
                    world.time,
                  ),
                );
              },
            ],
            [
              '밍키 쓰다듬기 우선',
              () => {
                emotions.feedback({ type: 'pet', id: 0, name: world.pets[0].name }, world.time);
                emotions.feedback(
                  { type: 'social', id: 0, name: world.pets[0].name, kind: 'greet', partner: 1 },
                  world.time,
                );
              },
            ],
          ];
          actions.forEach(([label, run]) => {
            const button = document.createElement('button');
            button.textContent = label;
            button.onclick = () => {
              run();
              refresh();
            };
            controls.append(button);
          });
          document.body.append(controls);
          refresh();
        }
        if (['exit', 'transition'].includes(query.get('scenario') ?? '')) {
          started = true;
          manualClock = true;
          byId<HTMLElement>('welcome').hidden = true;
          const posture = query.get('scenario') === 'transition';
          const requested = query.get('clip');
          const clip = posture
            ? requested === 'sleep'
              ? 'sleep'
              : requested === 'lie'
                ? 'lie'
                : 'sit'
            : requested === 'jump'
              ? 'jump'
              : 'belly';
          world.pets.forEach((p) => {
            p.state =
              clip === 'belly'
                ? 'lie'
                : clip === 'sleep'
                  ? 'sleep'
                  : clip === 'lie'
                    ? 'lie'
                    : clip === 'sit'
                      ? 'sit'
                      : 'rest';
            p.target = null;
            p.timer = 100;
            p.near = false;
            p.pendingCall = false;
            p.facing = query.get('direction') === 'left' ? 'left' : 'right';
            if (!posture) {
              beginMotion(p, clip, 20);
              p.motion!.elapsed = 5;
            }
          });
          const controls = document.createElement('div'),
            status = document.createElement('pre');
          controls.setAttribute('aria-label', '모션 복귀 검수');
          Object.assign(controls.style, {
            position: 'fixed',
            top: '8px',
            left: '8px',
            zIndex: '1400',
            background: '#fffef2',
            padding: '10px',
            maxWidth: '80vw',
          });
          const refresh = () => {
            render(0);
            status.textContent = world.pets
              .map(
                (p) =>
                  `${p.name}: ${p.motion?.id ?? p.state} / ${p.motion ? motionFrame(p.motion) : '-'} / 호출 대기 ${p.pendingCall}`,
              )
              .join('\n');
          };
          for (const [label, run] of [
            ['복귀 후 모두 부르기', () => world.call('all')],
            ['모두 간식 주기', () => world.pets.forEach((p) => world.interact(p.id, 'treat'))],
            [
              '공 놓기',
              () => {
                const selected = Math.max(0, Math.min(3, Number(query.get('actor')) || 0)),
                  p = world.pets[selected];
                world.pets.forEach((q) => {
                  q.held = q !== p;
                  q.decisionUntil = 0;
                });
                world.toys.place(
                  p.x + (p.facing === 'left' ? -1 : 1) * world.size * 0.55,
                  world.toys.groundY(p) - 16,
                );
              },
            ],
            [
              '0.2초 진행',
              () => {
                for (let i = 0; i < 4; i++) {
                  world.update(0.05);
                  world.drain().forEach((e) => emotions.feedback(e, world.time));
                }
              },
            ],
            [
              '1초 진행',
              () => {
                for (let i = 0; i < 20; i++) {
                  world.update(0.05);
                  world.drain().forEach((e) => emotions.feedback(e, world.time));
                }
              },
            ],
          ] as const) {
            const button = document.createElement('button');
            button.textContent = label;
            button.onclick = () => {
              run();
              refresh();
            };
            controls.append(button);
          }
          controls.append(status);
          document.body.append(controls);
          refresh();
        }
        if (query.get('scenario') === 'greet') {
          const [actor, partner] = (query.get('pair') ?? '0,1').split(',').map(Number);
          if (
            Number.isInteger(actor) &&
            Number.isInteger(partner) &&
            actor >= 0 &&
            actor < 4 &&
            partner >= 0 &&
            partner < 4 &&
            actor !== partner
          ) {
            started = true;
            manualClock = true;
            byId<HTMLElement>('welcome').hidden = true;
            const y = (world.bounds().top + world.bounds().bottom) / 2,
              a = world.pets[actor],
              b = world.pets[partner];
            const gap = greetingGap(
              world.size,
              world.scale({ y }),
              world.scale({ y }),
              actor === 0 || partner === 0,
            );
            const sign = query.get('direction') === 'left' ? -1 : 1;
            for (const p of world.pets) {
              p.motion = undefined;
              p.state = 'rest';
              p.target = null;
              elements[p.id].button.hidden = p !== a && p !== b;
            }
            a.x = world.width / 2 - (sign * gap) / 2;
            b.x = world.width / 2 + (sign * gap) / 2;
            a.y = b.y = y;
            a.facing = sign === 1 ? 'right' : 'left';
            b.facing = sign === 1 ? 'left' : 'right';
            beginMotion(a, 'nose');
            a.motion!.elapsed = (a.motion!.duration * 3.2) / 8;
            beginMotion(b, 'attend');
            b.motion!.elapsed = (b.motion!.duration * 4.2) / 8;
            render(0);
          }
        }
        if (query.get('scenario') === 'posture') {
          started = true;
          byId<HTMLElement>('welcome').hidden = true;
          document
            .querySelectorAll<HTMLElement>('.floating-controls,#field,.dock')
            .forEach((el) => (el.inert = false));
          const from =
            query.get('posture') === 'lie'
              ? 'lie'
              : query.get('posture') === 'sit'
                ? 'sit'
                : 'sleep';
          world.pets.forEach((p) => {
            p.state = from;
            p.motion = undefined;
            p.timer = 1000;
            p.near = true;
            p.target = null;
            p.speed = 0;
            p.facing = query.get('direction') === 'left' ? 'left' : 'right';
          });
          render(0);
        }
        if (id && Object.hasOwn(MOTION_SPEC, id)) {
          const dev = window as Window & {
            __meadowDebug?: { gesture: (id: MotionId, facing: 'left' | 'right') => void };
            advanceTime?: (ms: number) => void;
          };
          started = true;
          byId<HTMLElement>('welcome').hidden = true;
          document
            .querySelectorAll<HTMLElement>('.floating-controls,#field,.dock')
            .forEach((el) => (el.inert = false));
          dev.__meadowDebug?.gesture(
            id as MotionId,
            query.get('direction') === 'left' ? 'left' : 'right',
          );
          const column = Math.max(0, Math.min(7, Number(query.get('frame')) || 0));
          dev.advanceTime?.(((column + 0.15) / 8) * MOTION_SPEC[id as MotionId].seconds * 1000);
          const travelDirection = query.get('direction');
          if (
            (id === 'walk' || id === 'run') &&
            (travelDirection === 'front' || travelDirection === 'back')
          ) {
            for (const pet of world.pets) {
              pet.motion = undefined;
              pet.state = id;
              pet.facing = travelDirection;
              pet.stride = column / 8;
            }
            render(0);
          }
          if (query.has('treatContact')) {
            world.time = column / 7;
            for (const pet of world.pets) {
              pet.motion = undefined;
              pet.state = 'eat';
            }
            render(0);
          }
          if (query.has('callWait')) {
            for (const pet of world.pets) {
              pet.motion = undefined;
              pet.state = 'wait';
              pet.facing = 'front';
              pet.near = true;
            }
            render(0);
          }
          // Reusable contact QA: all four grounded paws against visible balls.
          if (query.has('ballContact')) {
            for (const pet of world.pets) {
              const facing = pet.facing === 'left' ? 'left' : 'right',
                paw = world.toys.pawPoint(pet),
                ground = world.toys.groundY(pet);
              const clone = ballButton.cloneNode(true) as HTMLButtonElement;
              clone.removeAttribute('id');
              clone.hidden = false;
              clone.tabIndex = -1;
              clone.style.pointerEvents = 'none';
              clone.style.left = `${paw.x + (facing === 'right' ? 1 : -1) * ballRadius(ground, world.height) * 0.75}px`;
              clone.style.top = `${ground - ballRadius(ground, world.height)}px`;
              clone.style.transform = 'translate(-50%,-50%)';
              clone.style.zIndex = '9';
              clone.querySelector('img')!.style.transform =
                `scale(${ballVisualScale(ground, world.height)})`;
              field.append(clone);
            }
          }
          if (query.has('play') || query.has('compare')) {
            const ids: MotionId[] = query.has('compare')
              ? ['idle', 'nose', 'sit', 'stretch']
              : [id as MotionId];
            motionPreview = { ids, index: 0, elapsed: 0, compare: query.has('compare') };
            for (const pet of world.pets) beginMotion(pet, ids[0]);
          }
        }
      }
      landscape();
    })
    .catch(() => {
      themeStatus = '이미지를 불러오지 못했어요. 새로고침해 주세요.';
      publishUi();
    });
  refreshSettings();
  setTool('pet');
  resize();
  requestAnimationFrame(loop);
  return {
    start,
    dismissHint: doneIntro,
    toggleSound,
    setTool,
    toggleCalls: () => {
      if (!started) return;
      wakeSound();
      setCallsOpen(!callsOpen);
    },
    closeCalls: () => setCallsOpen(false),
    callFriends,
    setPreference,
    selectTheme,
    toggleBall,
    setOverlayOpen,
    interactFromKeyboard: (id) => {
      if (started && !dialogOpen()) interact(id);
    },
    fieldPointerDown,
    fieldPointerMove,
    fieldPointerUp,
    cancelFieldPointer: cancelPointer,
    ballPointerDown,
    ballPointerMove,
    ballPointerUp,
    cancelBallPointer: endBallDrag,
    ballKeyboardClick,
  };
}
