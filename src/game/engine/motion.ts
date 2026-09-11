import { MOTION_SPEC, type MotionId } from './motion-spec'
import type { Pet } from './core'

// Four authored keyposes per physical action; all pets share this temporal sampling.
// These are keypose references, not different meanings assigned per character.
export const ACTION_KEYS = {
  idle: { panel: 'gait', row: 0, frames: [0, 0, 1, 1, 2, 0, 0, 0] },
  walk: { panel: 'gait', row: 1, frames: [0, 0, 1, 1, 2, 2, 3, 3] },
  run: { panel: 'gait', row: 2, frames: [0, 0, 1, 1, 2, 2, 3, 3] },
  attend: { panel: 'gait', row: 3, frames: [0, 1, 1, 2, 2, 1, 0, 0] },
  sit: { panel: 'rest', row: 0, frames: [0, 0, 1, 1, 2, 2, 3, 3] },
  lie: { panel: 'rest', row: 1, frames: [0, 0, 1, 1, 2, 2, 3, 3] },
  sleep: { panel: 'rest', row: 2, frames: [0, 0, 1, 1, 2, 2, 3, 3] },
  rise: { panel: 'rest', row: 3, frames: [0, 0, 1, 1, 2, 2, 3, 3] },
  paw: { panel: 'gait', row: 1, frames: [0, 1, 3, 0, 0, 1, 0, 0] },
  nose: { panel: 'actions', row: 0, frames: [0, 1, 2, 3, 3, 2, 1, 0] },
  sniff: { panel: 'actions', row: 1, frames: [0, 1, 2, 3, 3, 2, 1, 0] },
  bow: { panel: 'actions', row: 2, frames: [0, 1, 3, 3, 3, 3, 1, 0] },
  jump: { panel: 'actions', row: 3, frames: [0, 1, 1, 2, 2, 3, 3, 0] },
  stretch: { panel: 'detail', row: 0, frames: [0, 1, 1, 2, 2, 2, 1, 3] },
  belly: { panel: 'detail', row: 1, frames: [0, 1, 1, 2, 2, 1, 1, 3] },
  mouth: { panel: 'detail', row: 2, frames: [0, 1, 2, 1, 2, 1, 2, 3] },
  retreat: { panel: 'detail', row: 3, frames: [0, 0, 1, 1, 2, 2, 3, 3] },
} as const
export type MotionPanel = (typeof ACTION_KEYS)[MotionId]['panel']

/** A posture at a clip boundary uses one drawing, not another sheet's
 * interpretation of the same stance. This prevents resize/identity pops. */
export function motionKeypose(
  id: MotionId,
  phase: number
): { panel: MotionPanel; row: number; column: number } {
  if (id === 'paw' && [0, 6, 7].includes(phase)) return { panel: 'gait', row: 0, column: 0 }
  const clip = ACTION_KEYS[id]
  const stand = { panel: 'gait' as const, row: 0, column: 0 }
  const sit = { panel: 'rest' as const, row: 0, column: 3 }
  const lie = { panel: 'rest' as const, row: 1, column: 3 }
  const column = clip.frames[phase]
  if (id === 'sit' && column === 0) return stand
  if (id === 'lie' && column === 0) return sit
  if (id === 'sleep' && column === 0) return lie
  if (id === 'rise') {
    if (column === 0) return lie
    if (column === 3) return stand
  }
  if (id === 'belly' && (column === 0 || column === 3)) return lie
  if (
    ['nose', 'sniff', 'bow', 'jump', 'stretch', 'mouth', 'retreat', 'attend'].includes(id) &&
    column === 0
  )
    return stand
  if ((id === 'stretch' || id === 'mouth' || id === 'retreat') && column === 3) return stand
  return { panel: clip.panel, row: clip.row, column: clip.frames[phase] }
}

export type Motion = {
  id: MotionId
  elapsed: number
  duration: number
  contactPending: boolean
  contactEmitted: boolean
  exiting: boolean
  queue: MotionId[]
  reverse?: boolean
}

/** Physical clip playback shared by every character and every interaction. */
export function beginMotion(
  pet: Pet,
  id: MotionId,
  duration: number = MOTION_SPEC[id].seconds
): void {
  if (!Number.isFinite(duration) || duration <= 0)
    throw new RangeError('Positive motion duration required')
  if (pet.facing === 'front' || pet.facing === 'back') pet.facing = pet.dx < 0 ? 'left' : 'right'
  pet.observation?.motion(pet.id, id)
  pet.motion = {
    id,
    elapsed: 0,
    duration,
    contactPending: false,
    contactEmitted: false,
    exiting: false,
    queue: [],
  }
}

export function beginSequence(pet: Pet, ids: readonly MotionId[]): void {
  if (!ids.length) return
  beginMotion(pet, ids[0])
  pet.motion!.queue = ids.slice(1)
}

/** Finite clips play entry and exit once; extra requested time uses the declared hold/loop. */
export function motionFrame(motion: Motion): number {
  const spec = MOTION_SPEC[motion.id],
    elapsed = Math.max(0, motion.elapsed)
  const tick = Math.min(motion.duration, spec.seconds) / 8,
    extra = Math.max(0, motion.duration - spec.seconds)
  let frame = Math.min(7, Math.floor(elapsed / tick))
  if (!motion.reverse && extra > 0) {
    if ('hold' in spec) {
      const start = spec.hold * tick
      frame =
        elapsed < start
          ? Math.floor(elapsed / tick)
          : elapsed < start + extra + tick
            ? spec.hold
            : Math.min(7, Math.floor((elapsed - extra) / tick))
    } else if ('loop' in spec) {
      const [first, last] = spec.loop,
        start = first * tick,
        end = (last + 1) * tick + extra
      frame =
        elapsed < start
          ? Math.floor(elapsed / tick)
          : elapsed < end
            ? first + (Math.floor((elapsed - start) / tick) % (last - first + 1))
            : Math.min(7, Math.floor((elapsed - extra) / tick))
    } else frame = Math.min(7, Math.floor((elapsed / motion.duration) * 8))
  }
  if (elapsed >= motion.duration) frame = spec.safeExit
  return motion.reverse ? 7 - frame : frame
}

/** Entry/exit belong to explicit clips; resting and moving states only render their maintenance range. */
export function passiveFrame(id: MotionId, clock: number): number {
  const spec = MOTION_SPEC[id]
  if ('hold' in spec) return spec.hold
  if ('loop' in spec) {
    const [first, last] = spec.loop
    return first + (Math.floor(Math.max(0, clock)) % (last - first + 1))
  }
  return spec.safeExit
}

export function cancelMotion(pet: Pet, immediate = false): void {
  if (!pet.motion) return
  if (!immediate && ['jump', 'belly'].includes(pet.motion.id)) {
    const motion = pet.motion
    if (motion.exiting) return
    const frame = motionFrame(motion),
      seconds = MOTION_SPEC[motion.id].seconds
    // Release extra hold/slow-play time while preserving the current drawing.
    // Continue the authored recovery once; another call cannot rewind it.
    if (motion.duration > seconds) {
      motion.duration = seconds
      motion.elapsed = (((motion.reverse ? 7 - frame : frame) + 1e-6) / 8) * seconds
    }
    motion.exiting = true
    motion.queue = []
    return
  }
  pet.motion = undefined
}

/** An event remains pending across skipped render frames and is consumed only once. */
export function consumeMotionContact(pet: Pet): boolean {
  if (!pet.motion?.contactPending) return false
  pet.motion.contactPending = false
  return true
}

export function updateMotion(pet: Pet, dt: number): void {
  const motion = pet.motion
  if (!motion || pet.held) return
  const previous = motion.elapsed
  motion.elapsed += Math.max(0, dt)
  const spec = MOTION_SPEC[motion.id]
  if (
    'contact' in spec &&
    !motion.contactEmitted &&
    motion.elapsed >= (motion.duration * spec.contact) / 8
  ) {
    motion.contactEmitted = true
    motion.contactPending = true
  }
  // Keep the last frame for one update, allowing consumers to see a late contact.
  if (
    previous >= motion.duration &&
    motionFrame(motion) === (motion.reverse ? 7 - spec.safeExit : spec.safeExit)
  ) {
    const next = motion.queue.shift()
    if (next) {
      beginMotion(pet, next)
      pet.motion!.queue = motion.queue
    } else pet.motion = undefined
  }
}

/** Shared seated/lying/asleep recovery, used before user, social and toy movement. */
export function standBeforeMoving(pet: Pet, from: Pet['state'] = pet.state, stretch = false) {
  const current = pet.motion
  if (current && ['sit', 'lie', 'sleep', 'rise'].includes(current.id)) {
    const frame = motionFrame(current),
      reverse = current.id === 'sit' || current.id === 'sleep'
    current.duration = MOTION_SPEC[current.id].seconds
    current.elapsed = (((reverse ? 7 - frame : frame) + 1e-6) / 8) * current.duration
    current.reverse = reverse
    current.queue = current.id === 'lie' || current.id === 'sleep' ? ['rise'] : []
    if (stretch) current.queue.push('stretch')
    return
  }
  if (from === 'sit') {
    beginMotion(pet, 'sit')
    pet.motion!.reverse = true
    if (stretch) pet.motion!.queue = ['stretch']
  } else if (from === 'sleep') {
    beginMotion(pet, 'sleep')
    pet.motion!.reverse = true
    pet.motion!.queue = stretch ? ['rise', 'stretch'] : ['rise']
  } else if (from === 'lie') beginSequence(pet, stretch ? ['rise', 'stretch'] : ['rise'])
}
export function sitBeforeWaiting(pet: Pet) {
  if (pet.state === 'lie') {
    beginMotion(pet, 'lie')
    pet.motion!.reverse = true
  } else if (pet.state !== 'sit') beginMotion(pet, 'sit')
}
