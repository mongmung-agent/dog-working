import { PERSONALITIES, RELATIONSHIPS } from '../const/personality'
import type {AnimalKey, Pet} from './core'
export type Experience = {
  kind:
    | 'sniff'
    | 'comfort'
    | 'play'
    | 'greet'
    | 'company'
    | 'stroll'
    | 'pet'
    | 'eat'
    | 'call'
    | 'declined'
  other: number | null
  at: number
  strength: number
}
export type Mind = {
  joy: number
  curiosity: number
  surprise: number
  comfortNeed: number
  memories: Experience[]
  affinity: number[]
}
export function createMind(key: AnimalKey): Mind {
  return {
    joy: 0.25,
    curiosity: PERSONALITIES[key].curiosity,
    surprise: 0,
    comfortNeed: 0,
    memories: [],
    affinity: RELATIONSHIPS[Object.keys(PERSONALITIES).indexOf(key)].map(r => r.affinity),
  }
}
/** Game-time decay, bounded recent memory; no persistence or neglect penalties. */
export function updateMind(p: Pet, dt: number, now: number) {
  const m = p.mind
  m.joy = 0.25 + (m.joy - 0.25) * Math.exp(-dt / 25)
  const baseline = PERSONALITIES[p.key].curiosity
  m.curiosity = baseline + (m.curiosity - baseline) * Math.exp(-dt / 15)
  m.surprise *= Math.exp(-dt / 3)
  m.comfortNeed *= Math.exp(-dt / 35)
  m.memories = m.memories.filter(e => now - e.at < 120)
  for (let i = 0; i < m.affinity.length; i++) {
    const base = createAffinity(p.id, i)
    m.affinity[i] = base + (m.affinity[i] - base) * Math.exp(-dt / 300)
  }
}
function createAffinity(id: number, other: number) {
  return RELATIONSHIPS[id][other].affinity
}
export function remember(
  p: Pet,
  kind: Experience['kind'],
  now: number,
  other: number | null = null
) {
  const m = p.mind
  const strength = kind === 'call' ? 0.45 : kind === 'declined' ? 0.15 : 0.35
  m.memories.push({ kind, other, at: now, strength })
  if (m.memories.length > 8) m.memories.shift()
  appraise(p, kind, strength, other)
}
/** One appraisal per actual experience; callers never add the same joy separately. */
function appraise(p: Pet, kind: Experience['kind'], strength: number, other: number | null) {
  const m = p.mind
  if (kind === 'call') {
    m.surprise = Math.min(1, m.surprise + 0.5)
    m.curiosity = Math.min(1, m.curiosity + 0.15)
  } else if (kind !== 'declined') {
    if (kind === 'comfort') {
      m.comfortNeed = Math.max(0, m.comfortNeed - 0.7)
      m.surprise *= 0.2
    }
    m.joy = Math.min(1, m.joy + strength * (other !== null ? PERSONALITIES[p.key].socialJoy : 1))
    if (other !== null)
      m.affinity[other] = Math.min(1, m.affinity[other] + PERSONALITIES[p.key].affinityGain)
  }
}
export function memoryWeight(p: Pet, other: number, kind: Experience['kind'], now: number) {
  return p.mind.memories.reduce(
    (score, e) =>
      e.other === other && now - e.at < 60
        ? score * (e.kind === 'declined' ? 0.2 : e.kind === kind ? 0.55 : 0.85)
        : score,
    1
  )
}

/** A short startle can leave a longer, bounded need for reassurance. */
export function startle(p: Pet) {
  p.mind.surprise = 0.8
  p.mind.comfortNeed = Math.max(p.mind.comfortNeed, 0.8)
}

/** Shared social utility; hard eligibility is evaluated before this score. */
export function socialUtility(a: Pet, b: Pet, now: number, size: number, lastPartner: number) {
  const rememberedKind = ['lie', 'sit'].includes(b.state) ? 'company' : 'greet'
  const factors = {
    reassurance: b.mind.comfortNeed > 0.25 ? 3 : 1,
    affinity: 0.5 + a.mind.affinity[b.id],
    memory: memoryWeight(a, b.id, rememberedKind, now),
    need: 0.15 + a.socialNeed,
    energy: 0.2 + 1 - a.fatigue,
    initiative: PERSONALITIES[a.key].initiative,
    acceptance: PERSONALITIES[b.key].acceptance,
    preference: RELATIONSHIPS[a.id][b.id].preference,
    repeat: lastPartner === b.id ? 0.35 : 1,
    distance: 1 + Math.hypot(a.x - b.x, a.y - b.y) / size,
  }
  const f = factors
  return {
    score:
      (f.reassurance *
        f.affinity *
        f.memory *
        f.need *
        f.energy *
        f.initiative *
        f.acceptance *
        f.preference *
        f.repeat) /
      f.distance,
    factors,
  }
}
export function ballUtility(p: Pet) {
  return PERSONALITIES[p.key].ballInterest * (1 - p.fatigue) * (0.4 + p.mind.curiosity)
}

export type SocialKind = 'greet' | 'company' | 'stroll' | 'sniff' | 'play' | 'comfort'
/** Recipient-side intention, independent of the proposer's selection utility. */
export function socialResponse(actor: Pet, recipient: Pet, kind: SocialKind, now: number) {
  if (recipient.held || recipient.near || recipient.pendingCall || recipient.state === 'sleep')
    return { kind, probability: 0, reason: 'unavailable' }
  if (recipient.fatigue > 0.85) return { kind, probability: 0, reason: 'needs-rest' }
  const wantsQuiet =
    recipient.fatigue > 0.6 || (['sit', 'lie'].includes(recipient.state) && recipient.timer > 0)
  const offered: SocialKind =
    wantsQuiet && !['company', 'comfort'].includes(kind) ? 'company' : kind
  const relation = 0.7 + 0.6 * recipient.mind.affinity[actor.id]
  const recent = memoryWeight(recipient, actor.id, offered, now)
  const energy = offered === 'company' || offered === 'comfort' ? 1 : 1 - recipient.fatigue * 0.4
  const reassurance = offered === 'comfort' && recipient.mind.comfortNeed > 0.15 ? 1.2 : 1
  const probability = Math.min(
    0.97,
    PERSONALITIES[recipient.key].acceptance *
      (0.65 + 0.35 * recipient.socialNeed) *
      relation *
      recent *
      energy *
      reassurance
  )
  return {
    kind: offered,
    probability,
    reason: offered !== kind ? 'prefer-quiet-company' : 'considered',
  }
}
/** Willingness is an intention; only a real paw contact establishes play. */
export function ballWillingness(p: Pet) {
  if (p.held || p.near || p.pendingCall || p.state === 'sleep' || p.fatigue >= 0.72) return 0
  if (['sit', 'lie'].includes(p.state) && p.fatigue > 0.5) return 0
  return Math.min(0.95, ballUtility(p) * (1 - p.mind.comfortNeed * 0.7) * 1.6)
}
export function continueBall(p: Pet) {
  if (ballWillingness(p) === 0) return 0
  return Math.min(
    0.98,
    0.88 + PERSONALITIES[p.key].ballInterest * 0.1 - p.fatigue * 0.2 - p.mind.comfortNeed * 0.25
  )
}
