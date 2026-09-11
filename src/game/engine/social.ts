import { participationReason } from './eligibility'
import { greetingGap } from '../layout/art-layout'
import { beginMotion, beginSequence, cancelMotion, standBeforeMoving } from './motion'
import { remember, socialUtility, socialResponse } from './mind'
import type { Meadow, Pet } from './core'
import { PERSONALITIES as TRAITS } from '../const/personality'
export { PERSONALITIES as TRAITS } from '../const/personality'
export function updateNeeds(p: Pet, dt: number, playingBall = false) {
  if (p.held) return
  const resting = ['sleep', 'lie', 'sit', 'rest', 'wait', 'pet', 'eat'].includes(p.state)
  const activeMotion = p.motion?.id === 'jump' ? 0.016 : p.motion?.id === 'paw' ? 0.012 : 0
  const cost =
    activeMotion ||
    (playingBall
      ? p.state === 'walk'
        ? 0.007
        : 0.002
      : resting
        ? p.state === 'sleep'
          ? -0.025
          : -0.012
        : p.state === 'run'
          ? 0.013
          : 0.007)
  p.fatigue = Math.max(0, Math.min(1, p.fatigue + dt * cost))
  p.socialNeed = Math.max(
    0,
    Math.min(1, p.socialNeed + dt * (0.002 + TRAITS[p.key].initiative * 0.003))
  )
}
/** Outcome gestures only occupy a free standing body; never replace contact or recovery. */
export function expressOutcome(p: Pet, result: 'completed' | 'declined', partner: Pet) {
  if (
    p.held ||
    p.near ||
    p.pendingCall ||
    p.motion ||
    p.target ||
    !['rest', 'walk', 'run'].includes(p.state)
  )
    return
  p.state = result === 'declined' ? 'sit' : 'rest'
  p.speed = 0
  p.timer = 3
  p.facing = partner.x < p.x ? 'left' : 'right'
  beginMotion(p, result === 'declined' ? 'sit' : 'stretch')
}
export function soloAction(
  p: Pet,
  random: () => number
): 'rest' | 'edge' | 'walk' | 'run' | 'sniff' | 'jump' {
  if (p.fatigue > 0.85) return TRAITS[p.key].edgeRest > 0 ? 'edge' : 'rest'
  const actions = [
    { kind: 'edge' as const, score: TRAITS[p.key].edgeRest * (0.5 + p.fatigue) },
    { kind: 'rest' as const, score: 0.12 + p.fatigue * 2 },
    {
      kind: 'walk' as const,
      score: (1 - p.fatigue) * (0.3 + p.energy * 0.5 + p.mind.curiosity * 0.3),
    },
    { kind: 'run' as const, score: (1 - p.fatigue) ** 2 * p.energy * (0.6 + p.mind.joy * 0.3) },
  ]
  if (['rest', 'walk', 'run'].includes(p.state) && p.fatigue < 0.6) {
    const chance = random()
    if (chance > 0.88 && chance <= 0.96) return 'sniff'
    if (chance > 0.96 && p.mind.joy > 0.4) return 'jump'
  }
  let n = random() * actions.reduce((s, a) => s + a.score, 0)
  return actions.find(a => (n -= a.score) < 0)?.kind ?? 'rest'
}
type Pair = {
  actor: Pet
  partner: Pet
  kind: 'greet' | 'company' | 'stroll' | 'sniff' | 'play' | 'comfort'
  phase: 'proposed' | 'approach' | 'together' | 'inviting' | 'strolling' | 'chasing'
  engaged?: boolean
  swaps?: number
  swapAt?: number
  until: number
  started: number
  respondAt?: number
  following?: boolean
  progressAt?: number
  progressDistance?: number
  replans?: number
  replied?: boolean
  partnerResting?: boolean
  x: number
  y: number
}
export class Social {
  private pair?: Pair
  private session?: string
  readonly history: {
    actor: number
    partner: number
    kind: string
    result: string
    duration: number
  }[] = []
  private record(result: string) {
    const q = this.pair
    if (!q) return
    this.history.push({
      actor: q.actor.id,
      partner: q.partner.id,
      kind: q.kind,
      result,
      duration: this.world.time - q.started,
    })
    if (this.history.length > 128) this.history.shift()
  }
  private nextThink = 5
  private nextSocial = 8
  private cooldown = [0, 0, 0, 0]
  private lastPartner = [-1, -1, -1, -1]
  private declinedUntil = Array.from({ length: 4 }, () => [0, 0, 0, 0])
  constructor(
    private world: Meadow,
    private random: () => number
  ) {}
  owns(id: number) {
    return Boolean(this.pair && [this.pair.actor.id, this.pair.partner.id].includes(id))
  }
  cancel(id: number) {
    if (!this.pair || ![this.pair.actor.id, this.pair.partner.id].includes(id)) return
    this.finish('interrupted')
  }
  private finish(result = 'completed', reason = result) {
    if (!this.pair) return
    const freeBody = new Set([this.pair.actor, this.pair.partner].filter(p => !p.motion))
    this.record(result)
    if (result === 'declined') {
      const q = this.pair
      remember(q.actor, 'declined', this.world.time, q.partner.id)
      this.declinedUntil[q.actor.id][q.partner.id] = this.world.time + 20
    }
    if (result === 'declined' || result === 'completed') {
      const q = this.pair
      this.world.events.push({
        type: 'social',
        id: result === 'declined' ? q.actor.id : q.partner.id,
        name: result === 'declined' ? q.actor.name : q.partner.name,
        kind: q.kind,
        partner: result === 'declined' ? q.partner.id : q.actor.id,
        result: result as 'completed' | 'declined',
        phase: 'ended',
      })
    }
    if (result === 'completed') {
      const q = this.pair
      remember(q.actor, q.kind, this.world.time, q.partner.id)
      remember(q.partner, q.kind, this.world.time, q.actor.id)
    }
    this.world.observation.end(
      this.session,
      this.world.time,
      result === 'completed'
        ? 'completed'
        : result === 'interrupted'
          ? 'interrupted'
          : result === 'declined'
            ? 'declined'
            : 'failed',
      reason
    )
    this.session = undefined
    for (const p of this.pair.engaged === false ? [] : [this.pair.actor, this.pair.partner]) {
      // Release the social owner without skipping a physical posture transition.
      if (!['sit', 'lie', 'sleep', 'rise'].includes(p.motion?.id ?? '')) cancelMotion(p)
      p.target = null
      p.speed = 0
      if (!['sit', 'lie', 'sleep'].includes(p.state)) p.state = 'rest'
      p.timer = 2 + this.random() * 3
      if (!['completed', 'interrupted', 'declined'].includes(result)) {
        p.timer = 4
        p.decisionUntil = this.world.time + 4
      }
      this.cooldown[p.id] = this.world.time + 20
    }
    if (result === 'completed' || result === 'declined') {
      const q = this.pair
      if (freeBody.has(q.actor)) expressOutcome(q.actor, result, q.partner)
      if (result === 'completed' && freeBody.has(q.partner))
        expressOutcome(q.partner, result, q.actor)
    }
    if (this.pair.engaged === false) {
      const p = this.pair.actor
      this.cooldown[p.id] = this.world.time + 7
      if (result === 'declined' && !p.held && !p.near && !p.pendingCall) {
        p.target = null
        p.speed = 0
        p.timer = 3
        p.decisionUntil = this.world.time + 3
        if (['walk', 'run'].includes(p.state)) p.state = 'rest'
        expressOutcome(p, 'declined', this.pair.partner)
      }
    }
    const proposalOnly = this.pair.engaged === false
    this.pair = undefined
    this.nextSocial = this.world.time + (proposalOnly ? 3 : 12 + this.random() * 10)
  }
  /** Every encounter owns one pair and one observation session, including refusals. */
  private propose(
    a: Pet,
    b: Pet,
    kind: Pair['kind'],
    target: { x: number; y: number },
    passing = false
  ) {
    if (this.pair || this.world.time < this.declinedUntil[a.id][b.id]) return false
    const w = this.world,
      now = w.time
    const proposedKind = kind,
      response = socialResponse(a, b, kind, now)
    kind = response.kind
    const q: Pair = {
      actor: a,
      partner: b,
      kind,
      phase: 'proposed',
      engaged: false,
      until: now + 18,
      started: now,
      partnerResting: ['sit', 'lie'].includes(b.state),
      x: target.x,
      y: target.y,
    }
    this.pair = q
    this.session = w.observation.begin(
      kind,
      a.id,
      b.id,
      now,
      passing ? 'passing-encounter' : 'weighted-choice',
      'discovered'
    )
    w.observation.phase(
      this.session,
      'proposed',
      now,
      kind !== proposedKind ? `${proposedKind}-yielded-to-${kind}` : 'social-proposal'
    )
    w.observation.phase(this.session, 'responding', now, 'partner-response')
    if (response.probability === 0 || this.random() > response.probability) {
      this.finish('declined', response.probability === 0 ? response.reason : 'partner-declined')
      return false
    }
    w.observation.phase(this.session, 'accepted', now, 'partner-accepted')
    q.engaged = true
    if (!['company', 'comfort'].includes(kind)) {
      standBeforeMoving(b)
      b.state = 'rest'
    }
    b.target = null
    b.speed = 0
    b.timer = 2
    standBeforeMoving(a)
    a.edgeRest = false
    b.edgeRest = false
    a.state = 'walk'
    a.nextState = undefined
    a.riseFrom = null
    a.target = { ...target }
    a.timer = 2
    q.phase = 'approach'
    q.until =
      now +
      (kind === 'comfort'
        ? Math.min(60, Math.max(18, Math.hypot(a.x - target.x, a.y - target.y) / (24 * 0.62) + 6))
        : 18)
    w.observation.phase(this.session, 'approach', now, 'accepted-approach')
    if (passing) this.together(q)
    return true
  }
  private together(q: Pair) {
    const w = this.world,
      now = w.time
    q.phase = 'together'
    w.observation.phase(
      this.session,
      q.kind === 'play' || q.kind === 'stroll' ? 'inviting' : 'together',
      now,
      'joint-action'
    )
    q.until = now + (['company', 'comfort'].includes(q.kind) ? 7 : 3.5)
    q.actor.target = null
    q.actor.speed = 0
    q.actor.state = q.kind === 'company' ? 'lie' : 'rest'
    q.actor.facing = q.actor.x < q.partner.x ? 'right' : 'left'
    q.partner.facing = q.actor.x < q.partner.x ? 'left' : 'right'
    w.events.push({
      type: 'social',
      id: q.actor.id,
      name: q.actor.name,
      kind: q.kind,
      partner: q.partner.id,
      phase: q.kind === 'play' || q.kind === 'stroll' ? 'inviting' : 'together',
    })
    this.lastPartner[q.actor.id] = q.partner.id
    this.lastPartner[q.partner.id] = q.actor.id
    if (q.kind === 'company') {
      q.actor.facing = q.partner.facing
      q.partner.state = q.partner.state === 'lie' ? 'lie' : 'sit'
    }
    if (q.kind === 'sniff') {
      beginMotion(q.actor, 'sniff', 1.6)
      beginMotion(q.partner, 'sniff', 1.6)
    }
    if (q.kind === 'company') {
      beginSequence(q.actor, ['sit', 'lie'])
      if (q.partner.state === 'sit' && !q.partnerResting) beginMotion(q.partner, 'sit')
    }
    if (q.kind === 'comfort') {
      beginMotion(q.actor, 'nose')
      if (!['sit', 'lie'].includes(q.partner.state)) {
        q.partner.state = 'sit'
        beginMotion(q.partner, 'sit')
      }
    }
    if (q.kind === 'greet') {
      beginMotion(q.actor, 'nose')
      beginMotion(q.partner, 'attend')
    }
    if (q.kind === 'stroll' || q.kind === 'play') {
      beginMotion(q.actor, 'bow', 0.8)
      beginMotion(q.partner, 'attend', 0.8)
      q.phase = 'inviting'
      q.respondAt = now + TRAITS[q.partner.key].replyDelay
      q.until = now + 3
    }
  }
  private entryReason(p: Pet) {
    return participationReason(p, {
      kind: 'social',
      now: this.world.time,
      owned: this.world.toys.owns(p.id),
      cooldown: this.cooldown[p.id],
    })
  }
  private candidate(a: Pet, b: Pet, opposite = false) {
    const w = this.world,
      bounds = w.bounds()
    let reason =
      this.entryReason(a) ||
      this.entryReason(b) ||
      (w.time < this.declinedUntil[a.id][b.id] ? 'recently-declined' : null)
    const gap = greetingGap(w.size, w.scale(b), w.scale(b), a.id === 0 || b.id === 0)
    const normal = b.x + gap <= bounds.right ? b.x + gap : b.x - gap
    const x = opposite ? 2 * b.x - normal : normal,
      target = { x, y: b.y }
    if (!reason && Math.hypot(a.x - b.x, a.y - b.y) > w.size * 3.5) reason = 'too-far'
    if (
      !reason &&
      (x < bounds.left || x > bounds.right || Math.hypot(a.x - x, a.y - b.y) > w.size * 3.5)
    )
      reason = 'unreachable'
    if (
      !reason &&
      w.pets.some(p => p !== a && p !== b && Math.hypot(p.x - x, p.y - b.y) < gap * 0.8)
    )
      reason = 'occupied'
    return { a, b, target, reason }
  }
  private stroll(q: Pair) {
    if (this.world.width < this.world.size * 3) return
    const bounds = this.world.bounds(),
      distance = this.world.size * (0.7 + this.random() * 0.5)
    // Translate both destinations by one shared vector, preserving spacing.
    const options = [
      { x: 0, y: distance },
      { x: 0, y: -distance },
      { x: distance, y: 0 },
      { x: -distance, y: 0 },
    ]
    const valid = options.filter(d =>
      [q.actor, q.partner].every(
        p =>
          p.x + d.x >= bounds.left &&
          p.x + d.x <= bounds.right &&
          p.y + d.y >= bounds.top &&
          p.y + d.y <= bounds.bottom &&
          this.world.pets.every(
            other =>
              other === q.actor ||
              other === q.partner ||
              Math.hypot(other.x - p.x - d.x, other.y - p.y - d.y) > this.world.size * 0.75
          )
      )
    )
    const d = valid[Math.floor(this.random() * valid.length)]
    if (!d) return
    cancelMotion(q.actor, true)
    cancelMotion(q.partner, true)
    q.phase = 'strolling'
    q.until = this.world.time + 14
    q.following = false
    q.actor.state = 'walk'
    q.actor.target = { x: q.actor.x + d.x, y: q.actor.y + d.y }
    q.actor.speed = 0
    q.actor.timer = 2
    q.partner.state = 'rest'
    q.partner.target = null
    q.partner.timer = 2
  }
  private chase(q: Pair) {
    const w = this.world,
      b = w.bounds(),
      distance = Math.min(w.size * 1.8, (b.right - b.left) * 0.6)
    const options = [
      { x: distance, y: 0 },
      { x: -distance, y: 0 },
      { x: 0, y: distance * 0.5 },
      { x: 0, y: -distance * 0.5 },
    ]
    const valid = options.filter(
      d =>
        q.actor.x + d.x >= b.left &&
        q.actor.x + d.x <= b.right &&
        q.actor.y + d.y >= b.top &&
        q.actor.y + d.y <= b.bottom &&
        w.pets.every(
          p =>
            p === q.actor ||
            p === q.partner ||
            Math.hypot(p.x - q.actor.x - d.x, p.y - q.actor.y - d.y) > w.size * 0.7
        )
    )
    const vector = valid[Math.floor(this.random() * valid.length)]
    if (!vector) {
      this.finish('no-space')
      return
    }
    for (const p of [q.actor, q.partner]) {
      cancelMotion(p, true)
      p.target = null
      p.speed = 0
      p.timer = 2
    }
    q.phase = 'chasing'
    q.until = w.time + 5
    q.swapAt = w.time + 2.5
    q.actor.state = 'run'
    q.actor.target = { x: q.actor.x + vector.x, y: q.actor.y + vector.y }
    q.partner.state = 'rest'
  }
  update(dt = 0.05) {
    const w = this.world,
      now = w.time
    if (this.pair) {
      const q = this.pair
      w.observation.phase(this.session, q.phase, now, 'social-progress', q.actor.id, q.partner.id)
      if (
        q.actor.held ||
        q.partner.held ||
        q.actor.near ||
        q.partner.near ||
        q.actor.pendingCall ||
        q.partner.pendingCall ||
        now >= q.until
      ) {
        this.finish(
          q.actor.held ||
            q.partner.held ||
            q.actor.near ||
            q.partner.near ||
            q.actor.pendingCall ||
            q.partner.pendingCall
            ? 'interrupted'
            : ['proposed', 'approach', 'inviting'].includes(q.phase)
              ? 'timeout'
              : 'completed'
        )
        return
      }
      if (q.phase !== 'approach') {
        q.actor.socialNeed = Math.max(0, q.actor.socialNeed - dt * 0.04)
        q.partner.socialNeed = Math.max(0, q.partner.socialNeed - dt * 0.04)
      }
      if (q.phase === 'inviting') {
        q.actor.timer = q.partner.timer = 2
        if (now >= (q.respondAt ?? now) && !q.actor.motion && !q.partner.motion) {
          if (q.partner.fatigue > 0.8) {
            this.finish('declined')
            return
          }
          if (q.kind === 'play' && !q.replied) {
            q.replied = true
            beginMotion(q.partner, 'bow', 0.8)
            beginMotion(q.actor, 'attend', 0.8)
            q.respondAt = now + 0.8
            q.until = now + 4
            return
          }
          q.phase = 'together'
          q.until = now + 3
          if (q.kind === 'play') this.chase(q)
          else this.stroll(q)
        }
        return
      }
      if (q.phase === 'chasing') {
        q.actor.timer = q.partner.timer = 2
        if (q.actor.fatigue > 0.72 || q.partner.fatigue > 0.72) {
          this.finish()
          return
        }
        const dx = q.actor.x - q.partner.x,
          dy = q.actor.y - q.partner.y,
          d = Math.hypot(dx, dy)
        const gap = w.size * 0.8
        if (d > gap) {
          q.partner.state = 'run'
          q.partner.target = { x: q.actor.x - (dx / d) * gap, y: q.actor.y - (dy / d) * gap }
        } else {
          q.partner.target = null
          q.partner.state = 'rest'
          q.partner.speed = 0
        }
        if (now >= (q.swapAt ?? Infinity) || !q.actor.target) {
          if ((q.swaps ?? 0) >= 2) {
            this.finish()
            return
          }
          const previous = q.actor
          q.actor = q.partner
          q.partner = previous
          q.swaps = (q.swaps ?? 0) + 1
          this.chase(q)
        }
        return
      }
      if (q.phase === 'strolling') {
        q.actor.timer = q.partner.timer = 2
        const dx = q.actor.x - q.partner.x,
          dy = q.actor.y - q.partner.y,
          d = Math.hypot(dx, dy),
          gap = w.size * 0.78
        // Separate start/stop distances prevent rapid walk/rest oscillation.
        if (!q.following && d > gap + 8) q.following = true
        if (q.following && d <= gap - 8) q.following = false
        if (q.following && d > 0) {
          q.partner.state = 'walk'
          q.partner.target = {
            x: q.actor.x - (dx / d) * (gap - 10),
            y: q.actor.y - (dy / d) * (gap - 10),
          }
        } else {
          q.partner.target = null
          q.partner.speed = 0
          q.partner.state = 'rest'
        }
        if (!q.actor.target && d <= gap + 10) this.finish()
        return
      }
      if (q.phase === 'approach') {
        q.actor.timer = q.partner.timer = 2
        const distance = Math.hypot(q.actor.x - q.x, q.actor.y - q.y)
        if (q.actor.motion || q.partner.motion) {
          q.progressAt = now
          q.progressDistance = distance
        } else if (q.progressAt === undefined || distance < (q.progressDistance ?? Infinity) - 2) {
          q.progressAt = now
          q.progressDistance = distance
        } else if (distance >= 8 && now - q.progressAt > 4) {
          if ((q.replans ?? 0) >= 1) {
            this.finish('stalled')
            return
          }
          const retry = this.candidate(q.actor, q.partner, true)
          q.replans = 1
          if (retry.reason) {
            this.finish('no-space')
            return
          }
          q.x = retry.target.x
          q.y = retry.target.y
          q.actor.target = { ...retry.target }
          q.progressAt = now
          q.progressDistance = Infinity
          w.observation.phase(this.session, 'proposed', now, 'bounded-replan')
          w.observation.phase(this.session, 'approach', now, 'retry-approach')
        }
        if (
          Math.hypot(q.actor.x - q.x, q.actor.y - q.y) < 8 &&
          !q.actor.motion &&
          !q.partner.motion
        ) {
          this.together(q)
        }
      } else {
        q.actor.timer = q.partner.timer = 2
        if (q.kind === 'comfort' && !q.replied && !q.actor.motion && !q.partner.motion) {
          q.replied = true
          q.actor.state = 'lie'
          beginSequence(q.actor, ['sit', 'lie'])
          q.actor.facing = q.partner.facing
          if (q.partner.state === 'sit') {
            q.partner.state = 'lie'
            beginMotion(q.partner, 'lie')
          }
          q.until = now + 7
        }
        if (q.kind === 'sniff' && !q.replied && !q.actor.motion && !q.partner.motion) {
          q.replied = true
          if (q.actor.fatigue < 0.65 && q.partner.fatigue < 0.65) this.stroll(q)
        }
        if (q.kind === 'greet' && !q.replied && !q.actor.motion && !q.partner.motion) {
          q.replied = true
          beginMotion(q.partner, 'nose')
          beginMotion(q.actor, 'attend')
          q.until = now + 1.6
          w.events.push({
            type: 'social',
            id: q.partner.id,
            name: q.partner.name,
            kind: q.kind,
            partner: q.actor.id,
          })
        }
      }
      return
    }
    if (now < this.nextThink) return
    this.nextThink = now + 1 + this.random()
    if (now < this.nextSocial) return
    const walkers = w.pets.filter(p => !this.entryReason(p) && p.state === 'walk')
    for (const a of walkers)
      for (const b of walkers) {
        if (
          a.id >= b.id ||
          Math.hypot(a.x - b.x, a.y - b.y) > w.size * 0.95 ||
          this.random() > Math.max(TRAITS[a.key].passingGreeting, TRAITS[b.key].passingGreeting)
        )
          continue
        this.propose(a, b, 'greet', { x: a.x, y: a.y }, true)
        return
      }
    const assessed = w.pets.flatMap(a => w.pets.filter(b => b !== a).map(b => this.candidate(a, b)))
    const candidates: {
      a: Pet
      b: Pet
      target: { x: number; y: number }
      score: number
      factors: Record<string, number>
    }[] = []
    for (const { a, b, target, reason } of assessed) {
      if (reason) continue
      const { score, factors } = socialUtility(a, b, now, w.size, this.lastPartner[a.id])
      candidates.push({ a, b, target, score, factors })
    }
    w.observation.choices(
      assessed.map(({ a, b, target, reason }) => {
        const candidate = candidates.find(c => c.a === a && c.b === b)
        return {
          actor: a.id,
          partner: b.id,
          kind: 'social',
          score: candidate?.score ?? 0,
          factors: candidate?.factors,
          reason: reason ?? 'eligible',
          target,
          posture: a.state,
          interruptOn: 'user-input, timeout, partner-unavailable',
        }
      }),
      'social'
    )
    let pick = this.random() * candidates.reduce((sum, c) => sum + c.score, 0)
    const chosen = candidates.find(c => (pick -= c.score) < 0)
    if (!chosen) return
    const { a, b, target } = chosen
    const choice = this.random()
    const kind: Pair['kind'] =
      b.mind.comfortNeed > 0.25
        ? 'comfort'
        : ['lie', 'sit'].includes(b.state) || a.fatigue > 0.6 || b.fatigue > 0.6
          ? 'company'
          : choice < 0.25 && Math.min(a.energy, b.energy) > 0.45
            ? 'play'
            : choice < 0.45
              ? 'sniff'
              : choice < 0.75
                ? 'stroll'
                : 'greet'
    this.propose(a, b, kind, target)
  }
}
