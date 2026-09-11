import { beginMotion, beginSequence, cancelMotion } from './motion';
import { remember, memoryWeight } from './mind';
import type { Meadow, Pet } from './core';
export const TRAITS = [
  { initiative: 0.22, acceptance: 0.7, edgeRest: 0.78 },
  { initiative: 0.95, acceptance: 0.95, edgeRest: 0 },
] as const;
export function updateNeeds(p: Pet, dt: number) {
  if (p.held) return;
  const resting = ['sleep', 'lie', 'sit', 'rest', 'wait', 'pet', 'eat'].includes(p.state);
  p.fatigue = Math.max(
    0,
    Math.min(
      1,
      p.fatigue +
        dt *
          (resting ? (p.state === 'sleep' ? -0.025 : -0.012) : p.state === 'run' ? 0.013 : 0.007),
    ),
  );
  p.socialNeed = Math.max(
    0,
    Math.min(1, p.socialNeed + dt * (0.002 + TRAITS[p.id].initiative * 0.003)),
  );
}
export function soloAction(
  p: Pet,
  random: () => number,
): 'rest' | 'edge' | 'walk' | 'run' | 'sniff' | 'jump' {
  if (p.fatigue > 0.85) return p.id === 0 ? 'edge' : 'rest';
  const actions = [
    { kind: 'edge' as const, score: TRAITS[p.id].edgeRest * (0.5 + p.fatigue) },
    { kind: 'rest' as const, score: 0.12 + p.fatigue * 2 },
    {
      kind: 'walk' as const,
      score: (1 - p.fatigue) * (0.3 + p.energy * 0.5 + p.mind.curiosity * 0.3),
    },
    { kind: 'run' as const, score: (1 - p.fatigue) ** 2 * p.energy * (0.6 + p.mind.joy * 0.3) },
  ];
  if (['rest', 'walk', 'run'].includes(p.state) && p.fatigue < 0.6) {
    const chance = random();
    if (chance > 0.88 && chance <= 0.96) return 'sniff';
    if (chance > 0.96 && p.mind.joy > 0.4) return 'jump';
  }
  let n = random() * actions.reduce((s, a) => s + a.score, 0);
  return actions.find((a) => (n -= a.score) < 0)?.kind ?? 'rest';
}
type Pair = {
  actor: Pet;
  partner: Pet;
  kind: 'greet' | 'company' | 'stroll' | 'sniff' | 'play' | 'comfort';
  phase: 'approach' | 'together' | 'inviting' | 'strolling' | 'chasing';
  swaps?: number;
  swapAt?: number;
  until: number;
  started: number;
  respondAt?: number;
  following?: boolean;
  replied?: boolean;
  partnerResting?: boolean;
  x: number;
  y: number;
};
function standBeforeMoving(p: Pet) {
  if (p.state === 'sit') {
    beginMotion(p, 'sit');
    p.motion!.reverse = true;
  } else if (p.state === 'lie') beginMotion(p, 'rise');
}
const available = (p: Pet) =>
  !p.held && !p.motion && !p.near && ['rest', 'sit', 'lie', 'walk', 'run'].includes(p.state);
export class Social {
  private pair?: Pair;
  readonly history: {
    actor: number;
    partner: number;
    kind: string;
    result: string;
    duration: number;
  }[] = [];
  private record(result: string) {
    const q = this.pair;
    if (!q) return;
    this.history.push({
      actor: q.actor.id,
      partner: q.partner.id,
      kind: q.kind,
      result,
      duration: this.world.time - q.started,
    });
    if (this.history.length > 128) this.history.shift();
  }
  private nextThink = 5;
  private nextSocial = 8;
  private cooldown = [0, 0, 0, 0];
  private lastPartner = [-1, -1, -1, -1];
  constructor(
    private world: Meadow,
    private random: () => number,
  ) {}
  owns(id: number) {
    return Boolean(this.pair && [this.pair.actor.id, this.pair.partner.id].includes(id));
  }
  cancel(id: number) {
    if (!this.pair || ![this.pair.actor.id, this.pair.partner.id].includes(id)) return;
    this.finish('interrupted');
  }
  private finish(result = 'completed') {
    if (!this.pair) return;
    this.record(result);
    for (const p of [this.pair.actor, this.pair.partner]) {
      cancelMotion(p, true);
      p.target = null;
      p.speed = 0;
      if (!['sit', 'lie', 'sleep'].includes(p.state)) p.state = 'rest';
      p.timer = 2 + this.random() * 3;
      this.cooldown[p.id] = this.world.time + 20;
    }
    this.pair = undefined;
    this.nextSocial = this.world.time + 12 + this.random() * 10;
  }
  private stroll(q: Pair) {
    if (this.world.width < this.world.size * 3) return;
    const bounds = this.world.bounds(),
      distance = this.world.size * (0.7 + this.random() * 0.5);
    // Translate both destinations by one shared vector, preserving spacing.
    const options = [
      { x: 0, y: distance },
      { x: 0, y: -distance },
      { x: distance, y: 0 },
      { x: -distance, y: 0 },
    ];
    const valid = options.filter((d) =>
      [q.actor, q.partner].every(
        (p) =>
          p.x + d.x >= bounds.left &&
          p.x + d.x <= bounds.right &&
          p.y + d.y >= bounds.top &&
          p.y + d.y <= bounds.bottom &&
          this.world.pets.every(
            (other) =>
              other === q.actor ||
              other === q.partner ||
              Math.hypot(other.x - p.x - d.x, other.y - p.y - d.y) > this.world.size * 0.75,
          ),
      ),
    );
    const d = valid[Math.floor(this.random() * valid.length)];
    if (!d) return;
    cancelMotion(q.actor, true);
    cancelMotion(q.partner, true);
    q.phase = 'strolling';
    q.until = this.world.time + 14;
    q.following = false;
    q.actor.state = 'walk';
    q.actor.target = { x: q.actor.x + d.x, y: q.actor.y + d.y };
    q.actor.speed = 0;
    q.actor.timer = 2;
    q.partner.state = 'rest';
    q.partner.target = null;
    q.partner.timer = 2;
  }
  private chase(q: Pair) {
    const w = this.world,
      b = w.bounds(),
      distance = Math.min(w.size * 1.8, (b.right - b.left) * 0.6);
    const options = [
      { x: distance, y: 0 },
      { x: -distance, y: 0 },
      { x: 0, y: distance * 0.5 },
      { x: 0, y: -distance * 0.5 },
    ];
    const valid = options.filter(
      (d) =>
        q.actor.x + d.x >= b.left &&
        q.actor.x + d.x <= b.right &&
        q.actor.y + d.y >= b.top &&
        q.actor.y + d.y <= b.bottom &&
        w.pets.every(
          (p) =>
            p === q.actor ||
            p === q.partner ||
            Math.hypot(p.x - q.actor.x - d.x, p.y - q.actor.y - d.y) > w.size * 0.7,
        ),
    );
    const vector = valid[Math.floor(this.random() * valid.length)];
    if (!vector) {
      this.finish('no-space');
      return;
    }
    for (const p of [q.actor, q.partner]) {
      cancelMotion(p, true);
      p.target = null;
      p.speed = 0;
      p.timer = 2;
    }
    q.phase = 'chasing';
    q.until = w.time + 5;
    q.swapAt = w.time + 2.5;
    q.actor.state = 'run';
    q.actor.target = { x: q.actor.x + vector.x, y: q.actor.y + vector.y };
    q.partner.state = 'rest';
    remember(q.actor, 'play', w.time, q.partner.id);
    remember(q.partner, 'play', w.time, q.actor.id);
  }
  update(dt = 0.05) {
    const w = this.world,
      now = w.time;
    if (this.pair) {
      const q = this.pair;
      if (q.actor.held || q.partner.held || q.actor.near || q.partner.near || now >= q.until) {
        this.finish(
          q.actor.held || q.partner.held || q.actor.near || q.partner.near
            ? 'interrupted'
            : q.phase === 'approach'
              ? 'timeout'
              : 'completed',
        );
        return;
      }
      if (q.phase !== 'approach') {
        q.actor.socialNeed = Math.max(0, q.actor.socialNeed - dt * 0.04);
        q.partner.socialNeed = Math.max(0, q.partner.socialNeed - dt * 0.04);
      }
      if (q.phase === 'inviting') {
        q.actor.timer = q.partner.timer = 2;
        if (now >= (q.respondAt ?? now) && !q.actor.motion && !q.partner.motion) {
          if (q.partner.fatigue > 0.8) {
            remember(q.actor, 'declined', now, q.partner.id);
            this.finish('declined');
            return;
          }
          if (q.kind === 'play' && !q.replied) {
            q.replied = true;
            beginMotion(q.partner, 'bow', 0.8);
            beginMotion(q.actor, 'attend', 0.8);
            q.respondAt = now + 0.8;
            q.until = now + 4;
            return;
          }
          q.phase = 'together';
          q.until = now + 3;
          if (q.kind === 'play') this.chase(q);
          else this.stroll(q);
        }
        return;
      }
      if (q.phase === 'chasing') {
        q.actor.timer = q.partner.timer = 2;
        if (q.actor.fatigue > 0.72 || q.partner.fatigue > 0.72) {
          this.finish();
          return;
        }
        const dx = q.actor.x - q.partner.x,
          dy = q.actor.y - q.partner.y,
          d = Math.hypot(dx, dy);
        const gap = w.size * 0.8;
        if (d > gap) {
          q.partner.state = 'run';
          q.partner.target = { x: q.actor.x - (dx / d) * gap, y: q.actor.y - (dy / d) * gap };
        } else {
          q.partner.target = null;
          q.partner.state = 'rest';
          q.partner.speed = 0;
        }
        if (now >= (q.swapAt ?? Infinity) || !q.actor.target) {
          if ((q.swaps ?? 0) >= 2) {
            this.finish();
            return;
          }
          const previous = q.actor;
          q.actor = q.partner;
          q.partner = previous;
          q.swaps = (q.swaps ?? 0) + 1;
          this.chase(q);
        }
        return;
      }
      if (q.phase === 'strolling') {
        q.actor.timer = q.partner.timer = 2;
        const dx = q.actor.x - q.partner.x,
          dy = q.actor.y - q.partner.y,
          d = Math.hypot(dx, dy),
          gap = w.size * 0.78;
        // Separate start/stop distances prevent rapid walk/rest oscillation.
        if (!q.following && d > gap + 8) q.following = true;
        if (q.following && d <= gap - 8) q.following = false;
        if (q.following && d > 0) {
          q.partner.state = 'walk';
          q.partner.target = {
            x: q.actor.x - (dx / d) * (gap - 10),
            y: q.actor.y - (dy / d) * (gap - 10),
          };
        } else {
          q.partner.target = null;
          q.partner.speed = 0;
          q.partner.state = 'rest';
        }
        if (!q.actor.target && d <= gap + 10) this.finish();
        return;
      }
      if (q.phase === 'approach') {
        q.actor.timer = q.partner.timer = 2;
        if (
          Math.hypot(q.actor.x - q.x, q.actor.y - q.y) < 8 &&
          !q.actor.motion &&
          !q.partner.motion
        ) {
          q.phase = 'together';
          q.until = now + (['company', 'comfort'].includes(q.kind) ? 7 : 3.5);
          q.actor.target = null;
          q.actor.speed = 0;
          q.actor.state = q.kind === 'company' ? 'lie' : 'rest';
          q.actor.facing = q.actor.x < q.partner.x ? 'right' : 'left';
          q.partner.facing = q.actor.x < q.partner.x ? 'left' : 'right';
          w.events.push({ type: 'social', id: q.actor.id, name: q.actor.name });
          this.lastPartner[q.actor.id] = q.partner.id;
          this.lastPartner[q.partner.id] = q.actor.id;
          if (q.kind === 'company') {
            q.actor.facing = q.partner.facing;
            q.partner.state = q.partner.state === 'lie' ? 'lie' : 'sit';
          }
          if (q.kind === 'sniff') {
            beginMotion(q.actor, 'sniff', 1.6);
            beginMotion(q.partner, 'sniff', 1.6);
          }
          if (q.kind === 'company') {
            beginSequence(q.actor, ['sit', 'lie']);
            if (q.partner.state === 'sit' && !q.partnerResting) beginMotion(q.partner, 'sit');
          }
          if (q.kind === 'comfort') {
            beginMotion(q.actor, 'nose');
            if (!['sit', 'lie'].includes(q.partner.state)) {
              q.partner.state = 'sit';
              beginMotion(q.partner, 'sit');
            }
          }
          if (q.kind === 'greet') {
            beginMotion(q.actor, 'nose');
            beginMotion(q.partner, 'attend');
          }
          if (q.kind === 'stroll' || q.kind === 'play') {
            beginMotion(q.actor, 'bow', 0.8);
            beginMotion(q.partner, 'attend', 0.8);
            q.phase = 'inviting';
            q.respondAt = now + 0.8;
            q.until = now + 3;
            q.actor.mind.joy = Math.min(1, q.actor.mind.joy + 0.15);
          }

          const experience =
            q.kind === 'play'
              ? 'play'
              : q.kind === 'stroll'
                ? 'stroll'
                : q.kind === 'company' || q.kind === 'comfort'
                  ? 'company'
                  : 'greet';
          remember(q.actor, experience, now, q.partner.id);
          remember(q.partner, experience, now, q.actor.id);
        }
      } else {
        q.actor.timer = q.partner.timer = 2;
        if (q.kind === 'comfort' && !q.replied && !q.actor.motion && !q.partner.motion) {
          q.replied = true;
          q.actor.state = 'lie';
          beginSequence(q.actor, ['sit', 'lie']);
          q.actor.facing = q.partner.facing;
          if (q.partner.state === 'sit') {
            q.partner.state = 'lie';
            beginMotion(q.partner, 'lie');
          }
          q.until = now + 7;
        }
        if (q.kind === 'sniff' && !q.replied && !q.actor.motion && !q.partner.motion) {
          q.replied = true;
          if (q.actor.fatigue < 0.65 && q.partner.fatigue < 0.65) this.stroll(q);
        }
        if (q.kind === 'greet' && !q.replied && !q.actor.motion && !q.partner.motion) {
          q.replied = true;
          beginMotion(q.partner, 'nose');
          beginMotion(q.actor, 'attend');
          q.until = now + 1.6;
          w.events.push({ type: 'social', id: q.partner.id, name: q.partner.name });
        }
      }
      return;
    }
    if (now < this.nextThink) return;
    this.nextThink = now + 1 + this.random();
    if (now < this.nextSocial) return;
    const walkers = w.pets.filter(
      (p) =>
        available(p) &&
        p.state === 'walk' &&
        !w.toys.owns(p.id) &&
        now >= this.cooldown[p.id] &&
        now >= p.decisionUntil,
    );
    for (const a of walkers)
      for (const b of walkers) {
        if (
          a.id >= b.id ||
          Math.hypot(a.x - b.x, a.y - b.y) > w.size * 0.95 ||
          this.random() > (a.id === 1 || b.id === 1 ? 0.65 : 0.25)
        )
          continue;
        this.pair = {
          actor: a,
          partner: b,
          kind: 'greet',
          phase: 'together',
          until: now + 1.5,
          started: now,
          x: a.x,
          y: a.y,
        };
        for (const p of [a, b]) {
          p.target = null;
          p.speed = 0;
          p.state = 'rest';
          p.timer = 2;
        }
        a.facing = a.x < b.x ? 'right' : 'left';
        b.facing = a.x < b.x ? 'left' : 'right';
        beginMotion(a, 'nose');
        beginMotion(b, 'attend');
        remember(a, 'greet', now, b.id);
        remember(b, 'greet', now, a.id);
        this.lastPartner[a.id] = b.id;
        this.lastPartner[b.id] = a.id;
        w.events.push({ type: 'social', id: a.id, name: a.name });
        return;
      }
    const candidates: { a: Pet; b: Pet; score: number }[] = [];
    for (const a of w.pets)
      for (const b of w.pets) {
        if (
          w.toys.owns(a.id) ||
          w.toys.owns(b.id) ||
          now < a.decisionUntil ||
          now < b.decisionUntil ||
          a === b ||
          !available(a) ||
          !available(b) ||
          now < this.cooldown[a.id] ||
          now < this.cooldown[b.id]
        )
          continue;
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (distance > w.size * 3.5) continue;
        const rememberedKind = ['lie', 'sit'].includes(b.state) ? 'company' : 'greet';
        const score =
          ((0.5 + a.mind.affinity[b.id]) *
            memoryWeight(a, b.id, rememberedKind, now) *
            (0.15 + a.socialNeed) *
            (0.2 + 1 - a.fatigue) *
            TRAITS[a.id].initiative *
            TRAITS[b.id].acceptance *
            (this.lastPartner[a.id] === b.id ? 0.35 : 1)) /
          (1 + distance / w.size);
        candidates.push({ a, b, score });
      }
    let pick = this.random() * candidates.reduce((sum, c) => sum + c.score, 0);
    const chosen = candidates.find((c) => (pick -= c.score) < 0);
    if (!chosen) return;
    const { a, b } = chosen,
      bounds = w.bounds();
    if (b.fatigue > 0.8 || this.random() > TRAITS[b.id].acceptance * (0.65 + 0.35 * b.socialNeed)) {
      remember(a, 'declined', now, b.id);
      this.cooldown[a.id] = now + 7;
      this.nextSocial = now + 3;
      return;
    }
    const gap = w.size * (a.id === 0 ? 1.05 : 0.9);
    const x = b.x + gap <= bounds.right ? b.x + gap : b.x - gap;
    if (x < bounds.left || Math.hypot(a.x - x, a.y - b.y) > w.size * 3.5) return;
    if (w.pets.some((p) => p !== a && p !== b && Math.hypot(p.x - x, p.y - b.y) < gap * 0.8))
      return;
    const choice = this.random();
    const kind: Pair['kind'] =
      b.mind.surprise > 0.45
        ? 'comfort'
        : ['lie', 'sit'].includes(b.state) || a.fatigue > 0.6 || b.fatigue > 0.6
          ? 'company'
          : choice < 0.25 && Math.min(a.energy, b.energy) > 0.45
            ? 'play'
            : choice < 0.45
              ? 'sniff'
              : choice < 0.75
                ? 'stroll'
                : 'greet';
    const partnerResting = ['sit', 'lie'].includes(b.state);
    if (!['company', 'comfort'].includes(kind)) {
      standBeforeMoving(b);
      b.state = 'rest';
    }
    b.target = null;
    b.speed = 0;
    b.timer = 2;
    standBeforeMoving(a);
    a.edgeRest = false;
    b.edgeRest = false;
    a.state = 'walk';
    a.nextState = undefined;
    a.riseFrom = null;
    a.target = { x, y: b.y };
    a.timer = 2;
    this.pair = {
      actor: a,
      partner: b,
      kind,
      phase: 'approach',
      until: now + 18,
      started: now,
      partnerResting,
      x,
      y: b.y,
    };
  }
}
