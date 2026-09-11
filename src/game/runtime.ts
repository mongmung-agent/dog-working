import { beginMotion, motionFrame } from './motion';
import { MOTION_SPEC, type MotionId } from './motion-spec';
import { ThemeMusic } from './theme-music';
import { INFO, Meadow, type Tool } from './core';
import { artworkReady, paintPet } from './art';
import { ballVisualScale, ballRadius } from './toys';
import { prepareIntro } from './intro';
import { THEMES, isThemeId, type ThemeId } from './themes';
import { Emotions, emotion, emotionLabel } from './emotions';

type Preferences = {
  theme: ThemeId;
  sound: boolean;
  music: number;
  effects: number;
  reduced: boolean;
  intro: boolean;
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
    private readonly preferences: Preferences,
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

export function startMeadow() {
  const defaults: Preferences = {
    theme: 'meadow',
    sound: false,
    music: 35,
    effects: 55,
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
    intro: false,
  };
  const preferences = { ...defaults };
  try {
    const saved = JSON.parse(
      localStorage.getItem('little-meadow-settings') || '{}',
    ) as Partial<Preferences>;
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
  const world = new Meadow(),
    field = byId<HTMLElement>('field'),
    land = byId<HTMLCanvasElement>('landscape'),
    ambient = byId<HTMLCanvasElement>('ambient'),
    pets = byId<HTMLElement>('pets'),
    elements: PetElement[] = [];
  const emotions = new Emotions(world.pets);
  let manualClock = false;
  let motionPreview: { ids: MotionId[]; index: number; elapsed: number; compare: boolean } | null =
    null;
  let started = false,
    tool: Tool = 'pet',
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
  const dialogOpen = () => Boolean(document.querySelector('dialog[open]'));
  const audioPaused = () => document.hidden || dialogOpen();
  const paused = () => !started || audioPaused();
  const wakeSound = () => {
    if (!audio && preferences.sound) audio = new MeadowSound(preferences, audioPaused);
    audio?.wake();
  };
  const refreshSettings = () => {
    document.querySelectorAll<HTMLInputElement>('input[name="theme"]').forEach((input) => {
      input.checked = input.value === preferences.theme;
    });
    byId<HTMLElement>('theme-name').textContent = THEMES.find(
      (theme) => theme.id === preferences.theme,
    )!.name;
    field.setAttribute(
      'aria-label',
      `네 친구가 뛰노는 ${THEMES.find((theme) => theme.id === preferences.theme)!.name}`,
    );
    document.body.classList.toggle('sound-on', preferences.sound);
    document.body.classList.toggle('reduced', preferences.reduced);
    (['sound', 'intro-sound'] as const).forEach((id) => {
      const button = byId<HTMLButtonElement>(id);
      button.setAttribute('aria-label', preferences.sound ? '소리 끄기' : '소리 켜기');
      button.setAttribute('aria-pressed', String(preferences.sound));
      button.title = preferences.sound ? '소리 끄기' : '소리 켜기';
    });
    byId<HTMLInputElement>('sound-toggle').checked = preferences.sound;
    byId<HTMLInputElement>('reduce-toggle').checked = preferences.reduced;
    byId<HTMLInputElement>('music-volume').value = String(preferences.music);
    byId<HTMLInputElement>('effect-volume').value = String(preferences.effects);
    audio?.apply();
  };
  const toast = (text: string) => {
    window.clearTimeout(toastTimer);
    const node = byId<HTMLElement>('toast');
    node.textContent = text;
    node.classList.add('show');
    toastTimer = window.setTimeout(() => node.classList.remove('show'), 2300);
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
    const control = byId<HTMLElement>('call-controls');
    control.hidden = !open;
    const call = byId<HTMLButtonElement>('call');
    call.setAttribute('aria-expanded', String(open));
    call.classList.toggle('selected', open);
    (['pet-tool', 'treat-tool'] as const).forEach((id) =>
      byId<HTMLButtonElement>(id).classList.toggle(
        'selected',
        !open && tool === (id === 'pet-tool' ? 'pet' : 'treat'),
      ),
    );
  };
  const setTool = (next: Tool) => {
    setCallsOpen(false);
    tool = next;
    (['pet-tool', 'treat-tool'] as const).forEach((id) => {
      const value: Tool = id === 'pet-tool' ? 'pet' : 'treat';
      const button = byId<HTMLButtonElement>(id);
      button.classList.toggle('selected', tool === value);
      button.setAttribute('aria-pressed', String(tool === value));
    });
    elements.forEach((element, index) =>
      element.button.setAttribute(
        'aria-label',
        `${INFO[index].name}${tool === 'pet' ? ' 쓰다듬기' : ' 간식 주기'}`,
      ),
    );
    wakeSound();
  };
  INFO.forEach((info, index) => {
    const button = document.createElement('button'),
      canvas = document.createElement('canvas'),
      state = document.createElement('span');
    button.className = 'pet';
    button.dataset.pet = info.name;
    button.dataset.index = String(index);
    button.style.setProperty('--pet-color', info.color);
    state.className = 'state';
    state.id = `pet-mood-${index}`;
    state.setAttribute('role', 'img');
    button.setAttribute('aria-describedby', state.id);
    button.append(canvas, state);
    pets.append(button);
    elements.push({ button, canvas, state });
    button.addEventListener('click', (event) => {
      if (event.detail === 0 && started && !dialogOpen()) interact(index);
    });
    const choice = document.createElement('button'),
      portrait = document.createElement('canvas'),
      name = document.createElement('span');
    choice.className = 'call-choice';
    choice.dataset.call = info.name;
    choice.setAttribute('aria-label', `${info.name} 부르기`);
    name.textContent = info.name;
    choice.append(portrait, name);
    byId<HTMLElement>('call-choices').append(choice);
    paintPet(portrait, { ...world.pets[index], state: 'rest' }, 0, true);
    choice.addEventListener('click', () => callFriends(index));
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
  field.addEventListener('pointerdown', (event) => {
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
    const rect = field.getBoundingClientRect(),
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
    field.setPointerCapture(event.pointerId);
  });
  field.addEventListener('pointermove', (event) => {
    if (
      activePointer?.pointerId === event.pointerId &&
      Math.hypot(event.clientX - activePointer.x, event.clientY - activePointer.y) > 10
    ) {
      activePointer.cancelled = true;
      world.pets[activePointer.id].held = false;
      elements[activePointer.id].button.classList.remove('pressed');
    }
  });
  field.addEventListener('pointerup', (event) => {
    if (activePointer?.pointerId !== event.pointerId) return;
    const pointer = activePointer;
    cancelPointer();
    if (!pointer.cancelled) interact(pointer.id);
  });
  field.addEventListener('pointercancel', cancelPointer);
  field.addEventListener('lostpointercapture', cancelPointer);
  byId<HTMLButtonElement>('dismiss-hint').addEventListener('click', doneIntro);
  const settingsDialog = byId<HTMLDialogElement>('settings-dialog');
  byId<HTMLButtonElement>('settings').addEventListener('click', () => {
    setCallsOpen(false);
    cancelPointer();
    endBallDrag();
    settingsDialog.showModal();
    audio?.apply();
  });
  settingsDialog
    .querySelector<HTMLButtonElement>('.close')!
    .addEventListener('click', () => settingsDialog.close());
  settingsDialog.addEventListener('click', (event) => {
    if (event.target === settingsDialog) settingsDialog.close();
  });
  settingsDialog.addEventListener('close', () => audio?.apply());
  byId<HTMLButtonElement>('call').addEventListener('click', (event) => {
    if (started) {
      wakeSound();
      const open = byId<HTMLElement>('call-controls').hidden;
      setCallsOpen(open);
      if (open && event.detail === 0)
        byId<HTMLButtonElement>('call-all').focus({ preventScroll: true });
    }
  });
  document.addEventListener('pointerdown', (event) => {
    if (event.target instanceof Element && !event.target.closest('#call-controls,#call'))
      setCallsOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !byId<HTMLElement>('call-controls').hidden) {
      setCallsOpen(false);
      byId<HTMLButtonElement>('call').focus({ preventScroll: true });
    }
  });
  const callFriends = (id: number | 'all') => {
    setCallsOpen(false);
    byId<HTMLButtonElement>('call').focus({ preventScroll: true });
    wakeSound();
    world.call(id);
    world.drain().forEach(effect);
    audio?.effect('call');
    hint('다가온 친구를 쓰다듬어 주세요');
    toast(id === 'all' ? '얘들아, 이리 와!' : `${INFO[id].name}야, 이리 와!`);
  };
  byId<HTMLButtonElement>('call-all').addEventListener('click', () => callFriends('all'));
  byId<HTMLButtonElement>('pet-tool').addEventListener('click', () => setTool('pet'));
  byId<HTMLButtonElement>('treat-tool').addEventListener('click', () => setTool('treat'));
  const toggleSound = () => {
    preferences.sound = !preferences.sound;
    save();
    refreshSettings();
    wakeSound();
  };
  byId<HTMLButtonElement>('sound').addEventListener('click', toggleSound);
  byId<HTMLButtonElement>('intro-sound').addEventListener('click', toggleSound);
  (
    [
      ['sound-toggle', 'sound'],
      ['reduce-toggle', 'reduced'],
    ] as const
  ).forEach(([id, key]) =>
    byId<HTMLInputElement>(id).addEventListener('change', (event) => {
      preferences[key] = (event.currentTarget as HTMLInputElement).checked;
      save();
      refreshSettings();
      wakeSound();
    }),
  );
  (
    [
      ['music-volume', 'music'],
      ['effect-volume', 'effects'],
    ] as const
  ).forEach(([id, key]) =>
    byId<HTMLInputElement>(id).addEventListener('input', (event) => {
      preferences[key] = Number((event.currentTarget as HTMLInputElement).value);
      save();
      audio?.apply();
    }),
  );
  byId<HTMLButtonElement>('start').addEventListener('click', () => {
    document
      .querySelectorAll<HTMLElement>('.floating-controls,#field,.dock,#ball-toggle')
      .forEach((element) => {
        element.inert = false;
      });
    started = true;
    byId<HTMLElement>('welcome').hidden = true;
    wakeSound();
    hint('친구를 불러보세요');
    byId<HTMLButtonElement>('call').focus({ preventScroll: true });
    world.pets.forEach((pet) => world.choose(pet));
  });
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
  byId<HTMLElement>('theme-picker').addEventListener('change', async (event) => {
    const value = (event.target as HTMLInputElement).value;
    if (!isThemeId(value)) return;
    const request = ++themeRequest;
    const picker = byId<HTMLElement>('theme-picker'),
      status = byId<HTMLElement>('theme-status');
    refreshSettings();
    picker.setAttribute('aria-busy', 'true');
    status.textContent = '배경을 불러오고 있어요…';
    if (!themeImages.has(value)) toast('배경을 불러오고 있어요');
    const loaded = await loadTheme(value);
    if (request !== themeRequest) return;
    picker.removeAttribute('aria-busy');
    if (!loaded) {
      refreshSettings();
      status.textContent = '불러오지 못했어요. 다시 선택해 주세요.';
      toast('배경을 불러오지 못했어요. 다시 시도해 주세요.');
      return;
    }
    status.textContent = `${THEMES.find((theme) => theme.id === value)!.name} 적용됨`;
    preferences.theme = value;
    save();
    refreshSettings();
    landscape();
  });
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
  const ballButton = byId<HTMLButtonElement>('play-ball'),
    ballToggle = byId<HTMLButtonElement>('ball-toggle');
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
  ballToggle.addEventListener('click', () => {
    if (paused()) return;
    endBallDrag();
    if (world.toys.ball) world.toys.remove();
    else {
      world.toys.place(world.width * 0.5, world.bounds().bottom - 20);
      toast('공을 누르면 굴리고, 빠르게 밀어 놓으면 던져요');
    }
  });
  ballButton.addEventListener('pointerdown', (event) => {
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
    ballButton.setPointerCapture(event.pointerId);
  });
  ballButton.addEventListener('pointermove', (event) => {
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
  });
  ballButton.addEventListener('pointerup', (event) => {
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
  });
  ballButton.addEventListener('pointercancel', endBallDrag);
  ballButton.addEventListener('lostpointercapture', endBallDrag);
  ballButton.addEventListener('click', (event) => {
    if (event.detail === 0 && !paused()) world.toys.roll();
  });
  window.addEventListener('blur', endBallDrag);
  window.addEventListener('resize', endBallDrag);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) endBallDrag();
  });
  const render = (delta: number) => {
    const ball = world.toys.ball,
      ballElement = byId<HTMLElement>('play-ball');
    ballElement.hidden = !ball;
    ballToggle.setAttribute('aria-pressed', String(Boolean(ball)));
    ballToggle.setAttribute('aria-label', ball ? '공 치우기' : '공 꺼내기');
    ballToggle.title = ball ? '공 치우기' : '공 꺼내기';
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
      if (element.state.textContent !== emotion[mood]) {
        element.state.textContent = emotion[mood];
        element.state.setAttribute('aria-label', emotionLabel[mood]);
      }
      element.state.classList.toggle('visible', Boolean(expression));
      const bounds = paintPet(element.canvas, pet, now);
      if (bounds) {
        const depth = world.scale(pet);
        // The bottom of the emoji sits 4 screen pixels above the drawn sprite.
        element.state.style.top = `${(bounds.y / 256) * height - 4 / depth}px`;
        element.state.style.setProperty('--emotion-scale', String(1 / depth));
      }
    });
    byId<HTMLElement>('arrival').classList.toggle(
      'visible',
      world.pets.some((pet) => ['coming', 'notice', 'wait'].includes(pet.state)),
    );
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
    } else if (!started) world.time += Math.min(elapsed, 0.05);
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
  document
    .querySelectorAll<HTMLElement>('.floating-controls,#field,.dock,#ball-toggle')
    .forEach((element) => {
      element.inert = true;
    });
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
      byId<HTMLButtonElement>('start').disabled = false;
      if ((import.meta as ImportMeta & { env: { DEV: boolean } }).env.DEV) {
        const query = new URLSearchParams(location.search),
          id = query.get('motion');
        if (id && Object.hasOwn(MOTION_SPEC, id)) {
          const dev = window as Window & {
            __meadowDebug?: { gesture: (id: MotionId, facing: 'left' | 'right') => void };
            advanceTime?: (ms: number) => void;
          };
          started = true;
          byId<HTMLElement>('welcome').hidden = true;
          document
            .querySelectorAll<HTMLElement>('.floating-controls,#field,.dock,#ball-toggle')
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
          if (query.has('callWait')) {
            for (const pet of world.pets) {
              pet.motion = undefined;
              pet.state = 'wait';
              pet.facing = 'front';
              pet.near = true;
            }
            render(0);
          }
          // Reusable contact QA: all four calibrated noses against visible ball edges.
          if (query.has('ballContact')) {
            for (const pet of world.pets) {
              const facing = pet.facing === 'left' ? 'left' : 'right',
                nose = world.toys.nosePoint(pet);
              const clone = ballButton.cloneNode(true) as HTMLButtonElement;
              clone.removeAttribute('id');
              clone.hidden = false;
              clone.tabIndex = -1;
              clone.style.pointerEvents = 'none';
              clone.style.left = `${nose.x + (facing === 'right' ? 1 : -1) * ballRadius(nose.y, world.height)}px`;
              clone.style.top = `${nose.y}px`;
              clone.style.transform = 'translate(-50%,-50%)';
              clone.style.zIndex = '9';
              clone.querySelector('img')!.style.transform =
                `scale(${ballVisualScale(nose.y, world.height)})`;
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
      byId<HTMLButtonElement>('start').focus({ preventScroll: true });
    })
    .catch(() => {
      byId<HTMLButtonElement>('start').textContent =
        '이미지를 불러오지 못했어요 · 새로고침해 주세요';
    });
  refreshSettings();
  setTool('pet');
  resize();
  requestAnimationFrame(loop);
}
