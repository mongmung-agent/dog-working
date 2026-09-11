/** Shared physical vocabulary. Character identity must never change these cells. */
export const MOTION_DIRECTIONS = ['right', 'left'] as const;
export type MotionDirection = (typeof MOTION_DIRECTIONS)[number];
export type Posture = 'stand' | 'sit' | 'lie' | 'asleep';
type Frames = readonly [string, string, string, string, string, string, string, string];
type Clip = {
  row: number;
  from: Posture;
  to: Posture;
  seconds: number;
  frames: Frames;
  /** Inclusive zero-based loop; entry frames are played once. */
  loop?: readonly [number, number];
  /** Zero-based frame held until the action releases it. */
  hold?: number;
  contact?: number;
  safeExit: number;
};

export const MOTION_SPEC = {
  idle: {
    row: 0,
    from: 'stand',
    to: 'stand',
    seconds: 2.4,
    loop: [0, 7],
    safeExit: 0,
    frames: [
      '중립 서기',
      '중립 서기',
      '들숨',
      '들숨',
      '눈 깜빡임',
      '중립 서기',
      '중립 서기',
      '중립 서기',
    ],
  },
  walk: {
    row: 1,
    from: 'stand',
    to: 'stand',
    seconds: 1.2,
    loop: [0, 7],
    safeExit: 0,
    frames: [
      '접지',
      '접지',
      '앞발 뒤로 접기',
      '앞발 뒤로 접기',
      '교대 접지',
      '교대 접지',
      '앞발 들기',
      '앞발 들기',
    ],
  },
  run: {
    row: 2,
    from: 'stand',
    to: 'stand',
    seconds: 0.65,
    loop: [0, 7],
    safeExit: 0,
    frames: [
      '지지',
      '지지',
      '공중 도약',
      '공중 도약',
      '교대 지지',
      '교대 지지',
      '공중 도약',
      '공중 도약',
    ],
  },
  attend: {
    row: 3,
    from: 'stand',
    to: 'stand',
    seconds: 1.2,
    hold: 4,
    safeExit: 7,
    frames: [
      '중립 서기',
      '머리 들기',
      '머리 들기',
      '주시 유지',
      '주시 유지',
      '머리 들기',
      '중립 서기',
      '중립 서기',
    ],
  },
  sit: {
    row: 4,
    from: 'stand',
    to: 'sit',
    seconds: 0.9,
    hold: 7,
    safeExit: 7,
    frames: [
      '서기',
      '서기',
      '뒷몸 내리기',
      '뒷몸 내리기',
      '앉아 안정',
      '앉아 안정',
      '앉기',
      '앉기',
    ],
  },
  lie: {
    row: 5,
    from: 'sit',
    to: 'lie',
    seconds: 1.1,
    hold: 7,
    safeExit: 7,
    frames: [
      '앉기',
      '앉기',
      '앞발 뻗으며 낮추기',
      '앞발 뻗으며 낮추기',
      '가슴 낮추기',
      '가슴 낮추기',
      '엎드리기',
      '엎드리기',
    ],
  },
  sleep: {
    row: 6,
    from: 'lie',
    to: 'asleep',
    seconds: 2.4,
    loop: [6, 7],
    safeExit: 7,
    frames: [
      '엎드리기',
      '엎드리기',
      '머리 낮추기',
      '머리 낮추기',
      '눈 반쯤 감기',
      '눈 반쯤 감기',
      '잠든 자세',
      '잠든 자세',
    ],
  },
  rise: {
    row: 7,
    from: 'lie',
    to: 'stand',
    seconds: 1.1,
    safeExit: 7,
    frames: [
      '엎드리기',
      '엎드리기',
      '앞발로 밀기',
      '앞발로 밀기',
      '뒷몸 일으키기',
      '뒷몸 일으키기',
      '서기',
      '서기',
    ],
  },
  sniff: {
    row: 8,
    from: 'stand',
    to: 'stand',
    seconds: 1.6,
    loop: [3, 5],
    safeExit: 7,
    frames: [
      '서기',
      '머리 낮추기',
      '코 바닥 가까이',
      '탐색 유지',
      '탐색 유지',
      '코 바닥 가까이',
      '머리 낮추기',
      '서기',
    ],
  },
  bow: {
    row: 9,
    from: 'stand',
    to: 'stand',
    seconds: 1.2,
    hold: 4,
    safeExit: 7,
    frames: [
      '서기',
      '앞몸 조금 낮추기',
      '낮춘 자세 유지',
      '낮춘 자세 유지',
      '낮춘 자세 유지',
      '낮춘 자세 유지',
      '앞몸 조금 낮추기',
      '서기',
    ],
  },
  nose: {
    row: 10,
    from: 'stand',
    to: 'stand',
    seconds: 1.2,
    contact: 3,
    safeExit: 7,
    frames: [
      '서기',
      '목표 주시',
      '코 내밀기',
      '코 접촉',
      '코 접촉',
      '코 내밀기',
      '목표 주시',
      '서기',
    ],
  },
  paw: {
    row: 16,
    from: 'stand',
    to: 'stand',
    seconds: 0.7,
    contact: 3,
    safeExit: 7,
    frames: [
      '서기',
      '앞발 접기',
      '앞발 내밀기',
      '지면의 공 밀기',
      '접지 유지',
      '앞발 회수',
      '서기',
      '서기',
    ],
  },
  jump: {
    row: 11,
    from: 'stand',
    to: 'stand',
    seconds: 0.8,
    safeExit: 7,
    frames: [
      '서기',
      '웅크리기',
      '웅크리기',
      '다리 접어 도약',
      '다리 접어 도약',
      '착지 웅크리기',
      '착지 웅크리기',
      '서기',
    ],
  },
  stretch: {
    row: 12,
    from: 'stand',
    to: 'stand',
    seconds: 2.4,
    hold: 4,
    safeExit: 7,
    frames: [
      '서기',
      '앞발 뻗기',
      '앞발 뻗기',
      '몸 길게 펴기',
      '몸 길게 펴기',
      '몸 길게 펴기',
      '앞발 뻗기',
      '서기',
    ],
  },
  belly: {
    row: 13,
    from: 'lie',
    to: 'lie',
    seconds: 2.4,
    hold: 4,
    safeExit: 7,
    frames: [
      '엎드리기',
      '옆눕기',
      '옆눕기',
      '배 보이기',
      '배 보이기',
      '옆눕기',
      '옆눕기',
      '엎드리기',
    ],
  },
  mouth: {
    row: 14,
    from: 'stand',
    to: 'stand',
    seconds: 1.4,
    loop: [2, 5],
    safeExit: 7,
    frames: [
      '서기',
      '입 열기',
      '입 닫고 씹기',
      '입 열기',
      '입 닫고 씹기',
      '입 열기',
      '입 닫고 씹기',
      '서기',
    ],
  },
  retreat: {
    row: 15,
    from: 'stand',
    to: 'stand',
    seconds: 1.2,
    safeExit: 7,
    frames: ['서기', '서기', '한 발 후퇴', '한 발 후퇴', '교대 후퇴', '교대 후퇴', '서기', '서기'],
  },
} as const satisfies Record<string, Clip>;

export type MotionId = keyof typeof MOTION_SPEC;
export const MOTION_GRID = {
  columns: 8,
  rows: 17,
  cellSize: 256,
  groundY: 242,
  shadowY: 238,
} as const;

/** Returns an atlas slot without knowing which character will be rendered. */
export function motionCell(id: MotionId, column: number) {
  if (!Number.isInteger(column) || column < 0 || column >= MOTION_GRID.columns) {
    throw new RangeError('Motion column must be an integer between 0 and 7');
  }
  return { row: MOTION_SPEC[id].row, column };
}

/** Pose contracts are checked before atlas approval and runtime integration. */
export function validateMotionSequence(ids: readonly MotionId[], start: Posture = 'stand') {
  let posture = start;
  for (const id of ids) {
    const clip: Clip = MOTION_SPEC[id];
    if (clip.from !== posture) throw new Error(`${id} requires ${clip.from}, received ${posture}`);
    posture = clip.to;
  }
  return posture;
}

/** Design vocabulary for interaction poses, not executable behavior scripts.
 * Social/core/toys own branching, participation and completion. */
export const INTERACTION_MOTIONS = {
  call: ['attend', 'walk', 'idle'],
  treat: ['attend', 'walk', 'sniff', 'mouth'],
  greet: ['attend', 'walk', 'nose', 'idle'],
  invite: ['bow', 'idle'],
  chase: ['run', 'attend', 'run'],
  stroll: ['attend', 'walk', 'idle'],
  explore: ['walk', 'sniff', 'attend'],
  company: ['walk', 'sit', 'lie'],
  comfort: ['walk', 'nose', 'sit', 'lie'],
  ball: ['attend', 'walk', 'paw'],
  welcome: ['attend', 'jump', 'idle'],
  trust: ['sit', 'lie', 'belly'],
  rest: ['sit', 'lie', 'sleep'],
  space: ['attend', 'retreat', 'walk'],
} as const satisfies Record<string, readonly MotionId[]>;
