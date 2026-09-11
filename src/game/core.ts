import { beginMotion, beginSequence, cancelMotion, updateMotion, type Motion } from './motion';
import { Toys } from './toys';
import { createMind, updateMind, remember, type Mind } from './mind';
import { Social, soloAction, updateNeeds } from './social';
export type AnimalKey = 'minky' | 'mongsil';
export type Facing = 'front' | 'right' | 'back' | 'left';
export type PetState =
  | 'rest'
  | 'sit'
  | 'lie'
  | 'sleep'
  | 'rising'
  | 'run'
  | 'walk'
  | 'notice'
  | 'coming'
  | 'wait'
  | 'pet'
  | 'eat';
export type Tool = 'pet' | 'treat';

export interface PetInfo {
  id: number;
  key: AnimalKey;
  name: string;
  color: string;
  shy: boolean;
  energy: number;
}
export interface Point {
  x: number;
  y: number;
}
export interface Pet extends PetInfo {
  mind: Mind;
  motion?: Motion;
  fatigue: number;
  socialNeed: number;
  decisionUntil: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  state: PetState;
  timer: number;
  target: Point | null;
  held: boolean;
  pendingCall: boolean;
  near: boolean;
  variant: number;
  facing: Facing;
  stride: number;
  speed: number;
  riseFrom: PetState | null;
  nextState?: PetState;
  petPose?: PetState;
  afterPetTimer?: number;
  edgeRest?: boolean;
}
export interface MeadowEvent {
  type: 'call' | 'arrive' | 'pet' | 'eat' | 'social';
  id: number;
  name: string;
}

export const INFO: PetInfo[] = [
  { id: 0, key: 'minky', name: '밍키', color: '#c5a377', shy: true, energy: 0.48 },
  { id: 1, key: 'mongsil', name: '다롱이', color: '#a3b181', shy: false, energy: 0.78 },
];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const resting: PetState[] = ['sit', 'lie', 'sleep'];
function startRising(pet: Pet, from: PetState, stretch = false) {
  if (from === 'sit') {
    beginMotion(pet, 'sit');
    pet.motion!.reverse = true;
    if (stretch) pet.motion!.queue = ['stretch'];
  } else beginSequence(pet, stretch ? ['rise', 'stretch'] : ['rise']);
}

function settle(pet: Pet, from: PetState, to: PetState) {
  if (from === to) return;
  if (from === 'sleep' && to === 'lie') {
    beginMotion(pet, 'sleep');
    pet.motion!.reverse = true;
    return;
  }
  if (from === 'sit' && to !== 'sit') {
    beginSequence(pet, to === 'sleep' ? ['lie', 'sleep'] : ['lie']);
    return;
  }
  if (from === 'lie' && to === 'sleep') {
    beginMotion(pet, 'sleep');
    return;
  }
  beginSequence(pet, [
    ...(['lie', 'sleep'].includes(from) ? ['rise' as const] : []),
    'sit',
    ...(to !== 'sit' ? ['lie' as const] : []),
    ...(to === 'sleep' ? ['sleep' as const] : []),
  ]);
}

export class Meadow {
  width = 800;
  height = 500;
  size = 120;
  time = 0;
  events: MeadowEvent[] = [];
  pets: Pet[];
  social: Social;
  toys: Toys;

  constructor(private readonly random: () => number = Math.random) {
    this.pets = INFO.map((info) => ({
      ...info,
      mind: createMind(info.id),
      fatigue: 0.15,
      socialNeed: 0.4,
      decisionUntil: 0,
      x: 0,
      y: 0,
      dx: 0,
      dy: 1,
      state: 'rest' as PetState,
      timer: 1 + info.id * 0.7,
      target: null,
      held: false,
      pendingCall: false,
      near: false,
      variant: 0,
      facing: 'front' as Facing,
      stride: 0,
      speed: 0,
      riseFrom: null,
    }));
    this.social = new Social(this, this.random);
    this.toys = new Toys(this, this.random);
    this.resize(800, 500, 120, true);
  }
  bounds() {
    const s = this.size / 2;
    return {
      left: s + 8,
      right: Math.max(s + 8, this.width - s - 8),
      top: Math.min(this.height * 0.42, Math.max(s + 22, this.height * 0.25)),
      bottom: Math.max(s + 22, this.height - s - 8),
    };
  }
  resize(width: number, height: number, size: number, initial = false) {
    this.pets.forEach((p) => this.social.cancel(p.id));
    const oldWidth = this.width,
      oldHeight = this.height;
    this.width = width;
    this.height = height;
    this.size = size;
    this.toys.resize(oldWidth, oldHeight);
    const b = this.bounds();
    this.pets.forEach((pet, index) => {
      pet.held = false;
      if (initial) {
        pet.x = width * [0.24, 0.62][index];
        pet.y = height * [0.49, 0.73][index];
      } else {
        pet.x = (pet.x / oldWidth) * width;
        pet.y = (pet.y / oldHeight) * height;
      }
      pet.x = clamp(pet.x, b.left, b.right);
      pet.y = clamp(pet.y, b.top, b.bottom);
      if (pet.state === 'coming' || pet.state === 'notice') pet.target = this.slot(index);
      else if (pet.target)
        pet.target = {
          x: clamp((pet.target.x / oldWidth) * width, b.left, b.right),
          y: clamp((pet.target.y / oldHeight) * height, b.top, b.bottom),
        };
    });
  }
  scale(pet: Pick<Pet, 'y'>) {
    const b = this.bounds();
    return 0.62 + 0.38 * clamp((pet.y - b.top) / Math.max(1, b.bottom - b.top), 0, 1);
  }
  slot(id: number): Point {
    const b = this.bounds(),
      spread = Math.min(this.width * 0.34, this.size * 1.7),
      depth = Math.min(this.size * 1.1, (b.bottom - b.top) * 0.45);
    let best: Point | null = null,
      bestDistance = -1;
    for (let n = 0; n < 48; n += 1) {
      const candidate = {
        x: clamp(this.width / 2 + (this.random() * 2 - 1) * spread, b.left, b.right),
        y: clamp(b.bottom - this.random() * depth, b.top, b.bottom),
      };
      const others = this.pets
        .filter((pet) => pet.id !== id && pet.near)
        .map((pet) => pet.target || pet);
      const distance = others.length
        ? Math.min(...others.map((pet) => Math.hypot(pet.x - candidate.x, pet.y - candidate.y)))
        : Infinity;
      if (distance > bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
      if (distance > this.size * 0.78) break;
    }
    return best!;
  }
  private emit(type: MeadowEvent['type'], pet: Pet) {
    this.events.push({ type, id: pet.id, name: pet.name });
  }
  choose(pet: Pet) {
    if (pet.motion) {
      pet.timer = 0.2;
      return;
    }
    if (this.social.owns(pet.id) || this.toys.owns(pet.id)) {
      pet.state = 'rest';
      pet.target = null;
      pet.speed = 0;
      pet.timer = 2;
      return;
    }
    pet.decisionUntil = this.time + 3;
    const action = soloAction(pet, this.random);
    if (pet.edgeRest) {
      pet.edgeRest = false;
      pet.state = 'lie';
      beginSequence(pet, ['sit', 'lie']);
      pet.target = null;
      pet.speed = 0;
      pet.timer = 12 + this.random() * 10;
      return;
    }
    if (action === 'edge') {
      const b = this.bounds();
      const x = pet.x < (b.left + b.right) / 2 ? b.left + 8 : b.right - 8;
      pet.near = false;
      pet.target = { x: clamp(x, b.left, b.right), y: clamp(pet.y, b.top, b.bottom) };
      pet.state = 'walk';
      pet.timer = 25;
      pet.edgeRest = true;
      return;
    }

    if (action === 'sniff' || action === 'jump') {
      pet.state = 'rest';
      pet.target = null;
      pet.near = false;
      pet.speed = 0;
      pet.timer = 2.5;
      beginMotion(pet, action);
      return;
    }
    const wasResting = resting.includes(pet.state),
      oldPose = pet.state;
    pet.near = false;
    pet.target = null;
    if (action === 'walk' || action === 'run') {
      pet.state = action;
      pet.timer = 2 + this.random() * 3;
      const b = this.bounds();
      let target: Point = { x: pet.x, y: pet.y };
      for (let n = 0; n < 8; n += 1) {
        target = {
          x: b.left + this.random() * (b.right - b.left),
          y: b.top + this.random() * (b.bottom - b.top),
        };
        if (
          this.pets.every(
            (other) =>
              other === pet ||
              Math.hypot(other.x - target.x, other.y - target.y) > this.size * 0.75,
          )
        )
          break;
      }
      pet.target = target;
      if (wasResting) {
        pet.nextState = pet.state;
        pet.riseFrom = oldPose;
        pet.state = 'rising';
        pet.timer = 0;
        startRising(pet, oldPose, true);
      }
    } else {
      pet.state =
        pet.fatigue > 0.65
          ? 'sleep'
          : pet.id === 0
            ? 'lie'
            : resting[Math.floor(this.random() * 2)];
      pet.timer = 4 + this.random() * 5;
      pet.variant = 1 - pet.variant;
      pet.dx = 0;
      pet.dy = 1;
      pet.speed = 0;
      settle(pet, oldPose, pet.state);
    }
  }
  call(id: number | 'all') {
    (id === 'all' ? this.pets : [this.pets[id]]).filter(Boolean).forEach((pet) => {
      if (pet.motion && ['jump', 'belly'].includes(pet.motion.id)) {
        cancelMotion(pet);
        pet.pendingCall = true;
        return;
      }
      if (pet.state === 'eat' || pet.state === 'pet') {
        pet.pendingCall = true;
        return;
      }
      if (pet.state === 'coming' || pet.state === 'notice' || (pet.state === 'rising' && pet.near))
        return;
      this.beginCall(pet);
    });
  }
  private beginCall(pet: Pet) {
    const previousFacing = pet.facing;
    cancelMotion(pet, true);
    this.toys.cancel(pet.id);
    this.social.cancel(pet.id);
    pet.edgeRest = false;
    pet.nextState = undefined;
    pet.pendingCall = false;
    pet.near = true;
    pet.riseFrom = resting.includes(pet.state) ? pet.state : null;
    pet.state = pet.riseFrom ? 'rising' : 'notice';
    pet.timer = pet.riseFrom ? 0.45 : pet.shy ? 0.4 + this.random() * 0.4 : 0.12;
    pet.speed = 0;
    pet.facing = 'front';
    pet.target = this.slot(pet.id);
    pet.dx = 0;
    pet.dy = 1;
    if (pet.riseFrom) {
      pet.facing = previousFacing;
      startRising(pet, pet.riseFrom);
      pet.timer = 0;
    } else {
      beginMotion(pet, 'attend', pet.timer);
      pet.facing = 'front';
    }
    remember(pet, 'call', this.time);
    this.emit('call', pet);
  }
  interact(id: number, tool: Tool) {
    const pet = this.pets[id];
    const previousPose = pet?.state;
    if (pet?.motion && ['jump', 'belly'].includes(pet.motion.id)) return false;
    if (!pet || pet.state === 'eat' || pet.state === 'pet') return false;
    this.toys.cancel(pet.id);
    this.social.cancel(pet.id);
    pet.edgeRest = false;
    cancelMotion(pet, true);
    pet.held = false;
    pet.near = pet.near || ['notice', 'coming', 'wait'].includes(pet.state);
    pet.pendingCall = false;
    pet.petPose =
      tool === 'pet'
        ? ['sleep', 'sit', 'lie', 'rest', 'wait'].includes(pet.state)
          ? pet.state
          : pet.near
            ? 'wait'
            : 'rest'
        : undefined;
    pet.afterPetTimer = Math.max(3, pet.timer);
    pet.nextState = undefined;
    pet.riseFrom = null;
    pet.state = tool === 'treat' ? 'eat' : 'pet';
    pet.timer = tool === 'treat' ? 2 : 1.7;
    pet.variant = 1 - pet.variant;
    pet.dx = 0;
    pet.dy = 1;
    pet.speed = 0;
    pet.facing = 'front';
    pet.target = null;
    pet.socialNeed = clamp(pet.socialNeed - 0.2, 0, 1);
    if (tool === 'treat' && resting.includes(previousPose)) startRising(pet, previousPose);
    if (tool === 'pet' && pet.petPose === 'lie' && pet.mind.joy > 0.45) beginMotion(pet, 'belly');
    remember(pet, pet.state, this.time);
    this.emit(pet.state, pet);
    return true;
  }
  private avoid(pet: Pet, step: number) {
    // Gentle sideways steering for autonomous walks; user calls retain their path.
    if (pet.state === 'coming') return;
    const b = this.bounds();
    for (const other of this.pets) {
      if (other === pet) continue;
      const dx = pet.x - other.x,
        dy = pet.y - other.y,
        d = Math.hypot(dx, dy);
      const gap = this.size * Math.min(this.scale(pet), this.scale(other)) * 0.48;
      if (d >= gap) continue;
      const side = dx * -pet.dy + dy * pet.dx;
      const sign = Math.abs(side) > 0.1 ? Math.sign(side) : pet.id < other.id ? 1 : -1;
      const push = step * 0.7 * (1 - d / gap) * sign;
      pet.x = clamp(pet.x - pet.dy * push, b.left, b.right);
      pet.y = clamp(pet.y + pet.dx * push, b.top, b.bottom);
    }
  }
  update(delta: number) {
    const dt = clamp(delta, 0, 0.05);
    this.time += dt;
    this.pets.forEach((p) => {
      updateMotion(p, dt);
      if (!p.motion && p.pendingCall && p.state !== 'eat' && p.state !== 'pet') this.beginCall(p);
      updateNeeds(p, dt);
      updateMind(p, dt, this.time);
    });
    this.toys.update(dt);
    this.social.update(dt);
    for (const pet of this.pets) {
      if (pet.held) continue;
      if (pet.motion) {
        pet.speed = 0;
        if (pet.motion.id === 'retreat') {
          const b = this.bounds();
          pet.x = clamp(
            pet.x +
              ((pet.facing === 'left' ? 1 : -1) * this.size * 0.16 * dt) / pet.motion.duration,
            b.left,
            b.right,
          );
        }
        continue;
      }
      pet.timer -= dt;
      if (pet.state === 'rising' && pet.timer <= 0) {
        pet.state = pet.nextState || 'notice';
        pet.timer = pet.nextState ? 4 : 0.12;
        pet.nextState = undefined;
        pet.riseFrom = null;
      }
      if (pet.state === 'notice' && pet.timer <= 0) {
        pet.state = 'coming';
        pet.timer = 8;
        pet.target = pet.target || this.slot(pet.id);
      }
      if (['run', 'walk', 'coming'].includes(pet.state) && pet.target) {
        const dx = pet.target.x - pet.x,
          dy = pet.target.y - pet.y,
          distance = Math.hypot(dx, dy);
        if (distance < 2) {
          if (pet.state === 'coming') {
            pet.state = 'wait';
            pet.timer = 5;
            pet.speed = 0;
            pet.facing = 'front';
            pet.dx = 0;
            pet.dy = 1;
            pet.target = null;
            this.emit('arrive', pet);
          } else this.choose(pet);
        } else {
          const depth = this.scale(pet),
            speed =
              (pet.state === 'coming'
                ? Math.max(95, Math.max(this.width, this.height) * 0.32)
                : pet.state === 'walk'
                  ? 24
                  : 42 + pet.energy * 26) * depth,
            desired = Math.min(speed, Math.sqrt(800 * distance)),
            step = Math.min(distance, Math.min(desired, pet.speed + 500 * dt) * dt);
          pet.speed = Math.min(desired, pet.speed + 500 * dt);
          pet.dx = dx / distance;
          pet.dy = dy / distance;
          pet.facing = direction(pet.dx, pet.dy, pet.facing);
          pet.stride += step / (this.size * depth * (pet.state === 'walk' ? 0.62 : 0.85));
          pet.x += pet.dx * step;
          pet.y += pet.dy * step;
          this.avoid(pet, step);
        }
      }
      if (pet.timer <= 0) {
        if (pet.state === 'pet' || pet.state === 'eat') {
          if (pet.pendingCall) {
            if (pet.state === 'pet' && pet.petPose) pet.state = pet.petPose;
            pet.petPose = undefined;
            this.beginCall(pet);
          } else if (pet.state === 'pet' && pet.petPose) {
            pet.state = pet.petPose;
            pet.timer = pet.afterPetTimer!;
            pet.petPose = undefined;
          } else if (pet.near) {
            pet.state = 'wait';
            pet.timer = 5;
          } else this.choose(pet);
        } else if (pet.state === 'coming') {
          pet.target = this.slot(pet.id);
          pet.timer = 8;
        } else if (pet.state !== 'notice') this.choose(pet);
      }
    }
  }
  drain() {
    const events = this.events;
    this.events = [];
    return events;
  }
}

export function direction(dx: number, dy: number, previous: Facing = 'front'): Facing {
  const horizontal = Math.abs(dx),
    vertical = Math.abs(dy);
  if (horizontal < 0.001 && vertical < 0.001) return previous;
  const side: Facing = dx < 0 ? 'left' : 'right',
    upright: Facing = dy < 0 ? 'back' : 'front';
  if (previous === side && horizontal > vertical * 0.8) return side;
  if (previous === upright && vertical > horizontal * 0.8) return upright;
  return horizontal > vertical ? side : upright;
}
