import { beginMotion, cancelMotion, consumeMotionContact } from './motion';
import type { Meadow, Pet } from './core';
import { remember } from './mind';
export type Ball = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  z: number;
  vz: number;
};
type Side = 'left' | 'right';
// Rendered 256px tile coordinates, registered after crop/scale/warp in art.ts.
const pawAnchors: Record<string, Partial<Record<Side, { x: number; y: number }>>> = {};
export function registerPawAnchor(key: string, facing: Side, x: number, y: number) {
  (pawAnchors[key] ??= {})[facing] = { x: (x - 128) / 256, y: (y - 128) / 256 };
}
export const ballVisualScale = (y: number, height: number) =>
  0.72 + 0.28 * Math.max(0, Math.min(1, y / height));
// 36px image, with the sphere occupying 58/64 of its SVG viewBox.
export const ballRadius = (y: number, height: number) =>
  ((18 * 58) / 64) * ballVisualScale(y, height);
export class Toys {
  ball: Ball | null = null;
  dragging = false;
  private actor?: Pet;
  private buddy?: Pet;
  private until = 0;
  private turns = 0;
  private nextThink = 0;
  private cooldown = [0, 0, 0, 0];
  private shyUntil = 0;
  private contactSince = 0;
  private lastExpression = -10;
  private progressAt = 0;
  private progressDistance = Infinity;
  readonly diagnostics = { started: 0, hits: 0, unreachable: 0, stalled: 0 };
  constructor(
    private world: Meadow,
    private random: () => number,
  ) {}
  owns(id: number) {
    return this.actor?.id === id || this.buddy?.id === id;
  }
  cancel(id: number) {
    if (this.owns(id)) this.release();
  }
  private release() {
    for (const p of [this.actor, this.buddy])
      if (p) {
        cancelMotion(p, true);
        p.state = 'rest';
        p.target = null;
        p.speed = 0;
        p.timer = 3;
        p.decisionUntil = this.world.time + 3;
        this.cooldown[p.id] = this.world.time + 6;
      }
    this.actor = this.buddy = undefined;
    this.turns = 0;
  }
  bounds() {
    const inset = 24;
    return {
      left: inset,
      right: Math.max(inset, this.world.width - inset),
      top: inset,
      bottom: Math.max(inset, this.world.height - inset),
    };
  }
  resize(oldWidth: number, oldHeight: number) {
    this.release();
    this.endDrag();
    if (this.ball) {
      this.ball.x *= this.world.width / Math.max(1, oldWidth);
      this.ball.y *= this.world.height / Math.max(1, oldHeight);
      const b = this.bounds();
      this.ball.x = Math.max(b.left, Math.min(b.right, this.ball.x));
      this.ball.y = Math.max(b.top, Math.min(b.bottom, this.ball.y));
      this.ball.vx = this.ball.vy = this.ball.z = this.ball.vz = 0;
    }
  }
  remove() {
    this.dragging = false;
    this.release();
    this.ball = null;
  }
  place(x: number, y: number) {
    this.release();
    const b = this.bounds();
    this.ball = {
      x: Math.max(b.left, Math.min(b.right, x)),
      y: Math.max(b.top, Math.min(b.bottom, y)),
      vx: 0,
      vy: 0,
      angle: 0,
      z: 0,
      vz: 0,
    };
    this.nextThink = this.world.time + 1;
  }
  beginDrag() {
    if (!this.ball) return;
    this.release();
    this.dragging = true;
    this.ball.vx = this.ball.vy = this.ball.z = this.ball.vz = 0;
  }
  moveDrag(x: number, y: number) {
    if (!this.dragging || !this.ball) return;
    const b = this.bounds();
    this.ball.x = Math.max(b.left, Math.min(b.right, x));
    this.ball.y = Math.max(b.top, Math.min(b.bottom, y));
  }
  endDrag() {
    this.dragging = false;
    this.nextThink = this.world.time + 1;
  }
  throwBall(vx: number, vy: number) {
    if (!this.ball || !Number.isFinite(vx) || !Number.isFinite(vy)) return;
    this.release();
    this.dragging = false;
    const speed = Math.hypot(vx, vy),
      factor = Math.min(1, 650 / Math.max(1, speed));
    this.ball.vx = vx * factor;
    this.ball.vy = vy * factor * 0.45;
    this.ball.vz = speed < 100 ? 0 : Math.min(420, speed * 0.24 + Math.max(0, -vy) * 0.3);
    this.nextThink = this.world.time + 1;
  }
  roll() {
    if (!this.ball) {
      this.place(this.world.width * 0.5, this.world.bounds().bottom - 20);
      return;
    }
    this.release();
    const a = this.random() * Math.PI * 2;
    this.ball.vx = Math.cos(a) * 95;
    this.ball.vy = Math.sin(a) * 75;
    this.nextThink = this.world.time + 1;
  }
  contact(p: Pet) {
    if (!this.ball) return null;
    const b = this.world.bounds();
    const ball = this.ball,
      radius = ballRadius(ball.y, this.world.height);
    return (
      (['right', 'left'] as const)
        .map((facing) => {
          let x = p.x,
            y = p.y;
          // Perspective depends on the destination, not the actor's starting depth.
          for (let i = 0; i < 12; i++) {
            const paw = this.pawPoint({ ...p, x, y }, facing);
            x += ball.x - (facing === 'right' ? 1 : -1) * radius * 0.75 - paw.x;
            y += ball.y + radius - this.groundY({ ...p, x, y });
          }
          return { x, y, facing };
        })
        .filter((t) => t.x >= b.left && t.x <= b.right && t.y >= b.top && t.y <= b.bottom)
        .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0] ??
      null
    );
  }
  pawPoint(p: Pet, facing: Side = p.facing === 'left' ? 'left' : 'right') {
    const anchor = pawAnchors[p.key]?.[facing] ?? {
      x: facing === 'right' ? 0.3 : -0.3,
      y: (242 - 128) / 256,
    };
    const size = this.world.size * this.world.scale(p);
    return { x: p.x + size * anchor.x, y: p.y + size * anchor.y };
  }
  groundY(p: Pet) {
    return p.y + (this.world.size * this.world.scale(p) * (242 - 128)) / 256;
  }
  private available(p: Pet) {
    return (
      !p.held &&
      !p.motion &&
      !p.near &&
      !this.world.social.owns(p.id) &&
      p.fatigue < 0.72 &&
      this.world.time >= this.cooldown[p.id] &&
      this.world.time >= p.decisionUntil &&
      ['rest', 'sit', 'walk', 'run', 'lie'].includes(p.state)
    );
  }
  private start(p: Pet) {
    this.contactSince = 0;
    this.progressAt = this.world.time;
    this.progressDistance = Infinity;
    p.edgeRest = false;
    p.nextState = undefined;
    p.riseFrom = null;
    p.state = 'walk';
    p.speed = 0;
    p.timer = 2;
  }
  update(dt: number) {
    const ball = this.ball;
    if (!ball || this.dragging) return;
    const w = this.world,
      b = this.bounds(),
      now = w.time;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.angle += (Math.hypot(ball.vx, ball.vy) * dt) / 16;
    for (const axis of ['x', 'y'] as const) {
      const min = axis === 'x' ? b.left : b.top,
        max = axis === 'x' ? b.right : b.bottom,
        v = axis === 'x' ? 'vx' : 'vy';
      if (ball[axis] < min || ball[axis] > max) {
        ball[axis] = Math.max(min, Math.min(max, ball[axis]));
        ball[v] *= -0.45;
      }
    }
    if (ball.z > 0 || ball.vz > 0) {
      ball.vz -= 900 * dt;
      ball.z += ball.vz * dt;
      if (ball.z <= 0) {
        ball.z = 0;
        ball.vz = Math.abs(ball.vz) > 65 ? -ball.vz * 0.48 : 0;
        ball.vx *= 0.82;
        ball.vy *= 0.82;
      }
    }
    // Keep the airborne ball visible even near the top edge.
    if (ball.z > Math.max(0, ball.y - 24)) {
      ball.z = Math.max(0, ball.y - 24);
      ball.vz = Math.min(0, ball.vz);
    }
    if (ball.z < 16)
      for (const p of w.pets) {
        if (this.owns(p.id) || p.held) continue;
        const dx = ball.x - p.x,
          dy = ball.y - (this.groundY(p) - ballRadius(ball.y, w.height)),
          d = Math.hypot(dx, dy),
          r = w.size * w.scale(p) * 0.2 + 14;
        if (d >= r) continue;
        const nx = d > 0.01 ? dx / d : 1,
          ny = d > 0.01 ? dy / d : 0,
          pvx = p.dx * p.speed,
          pvy = p.dy * p.speed;
        const toward = (ball.vx - pvx) * nx + (ball.vy - pvy) * ny;
        if (toward < 0) {
          ball.vx -= 1.45 * toward * nx;
          ball.vy -= 1.45 * toward * ny;
          ball.vz = Math.max(ball.vz, Math.min(120, -toward * 0.4));
        }
        ball.x = Math.max(b.left, Math.min(b.right, p.x + nx * r));
        ball.y = Math.max(
          b.top,
          Math.min(b.bottom, this.groundY(p) - ballRadius(ball.y, w.height) + ny * r),
        );
      }
    const friction = Math.exp(-(ball.z > 0 ? 0.15 : 2.2) * dt);
    ball.vx *= friction;
    ball.vy *= friction;
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed < 1) ball.vx = ball.vy = 0;
    const m = w.pets[0];
    if (
      speed > 30 &&
      now > this.shyUntil &&
      Math.hypot(m.x - ball.x, m.y - ball.y) < w.size * 1.1 &&
      !m.held &&
      !m.near &&
      m.state !== 'sleep' &&
      this.available(m)
    ) {
      this.cancel(m.id);
      m.mind.surprise = 0.8;
      m.state = 'sit';
      beginMotion(m, 'retreat');
      m.target = null;
      m.speed = 0;
      m.timer = 4;
      m.decisionUntil = now + 4;
      this.shyUntil = now + 12;
      this.cooldown[0] = now + 12;
    }
    if (ball.z > 2) {
      this.contactSince = 0;
      return;
    }
    if (this.actor) {
      const a = this.actor;
      if (
        now > this.until ||
        [a, this.buddy].some((p) => p && (p.held || p.near || p.fatigue > 0.85))
      ) {
        this.release();
        return;
      }
      a.timer = 2;
      if (this.buddy) {
        this.buddy.timer = 2;
        this.buddy.socialNeed = Math.max(0, this.buddy.socialNeed - dt * 0.025);
      }
      if (a.motion?.id === 'paw' && a.motion.contactEmitted && !a.motion.contactPending) return;
      const contact = this.contact(a);
      if (!contact) {
        this.diagnostics.unreachable++;
        this.release();
        return;
      }
      const distance = Math.hypot(a.x - contact.x, a.y - contact.y);
      if (distance < this.progressDistance - 2) {
        this.progressDistance = distance;
        this.progressAt = now;
      }
      if (now - this.progressAt > 4) {
        this.diagnostics.stalled++;
        this.release();
        return;
      }
      if (distance < 2 && speed < 20) {
        a.x = contact.x;
        a.y = contact.y;
        a.target = null;
        a.speed = 0;
        a.state = 'rest';
        a.facing = contact.facing;
        if (!this.contactSince) {
          this.contactSince = now;
          beginMotion(a, 'paw', 0.7);
        }
      } else {
        this.contactSince = 0;
        if (a.motion?.id === 'paw') cancelMotion(a, true);
      }
      if (this.contactSince && consumeMotionContact(a)) {
        this.contactSince = 0;
        this.progressDistance = Infinity;
        this.progressAt = now;
        this.diagnostics.hits++;
        const target = this.buddy;
        const angle = target
          ? Math.atan2(
              this.groundY(target) - ballRadius(this.groundY(target), w.height) - ball.y,
              target.x - ball.x,
            )
          : (a.facing === 'right' ? 0 : Math.PI) + (this.random() - 0.5) * 0.25;
        const dribble = !target;
        const force = dribble ? 48 : 95;
        ball.vx = Math.cos(angle) * force;
        ball.vy = Math.sin(angle) * force;
        ball.vz = target ? 65 : 35;
        a.state = 'rest';
        a.target = null;
        a.speed = 0;
        a.mind.joy = Math.min(1, a.mind.joy + 0.2);
        remember(a, 'play', now, target?.id ?? null);
        if (now - this.lastExpression > 5) {
          w.events.push({ type: 'social', id: a.id, name: a.name });
          this.lastExpression = now;
        }
        this.turns++;
        if (this.turns >= (target ? 16 : 20)) {
          this.release();
          return;
        }
        if (target) {
          this.actor = target;
          this.buddy = a;
          this.start(target);
        }
        this.nextThink = now + (target ? 0.7 : 0.15);
      } else if (!this.contactSince && now >= this.nextThink) {
        const { x, y } = contact;
        if (
          w.pets.some(
            (p) => p !== a && p !== this.buddy && Math.hypot(p.x - x, p.y - y) < w.size * 0.55,
          )
        ) {
          this.release();
          return;
        }
        const petBounds = w.bounds();
        a.state = 'walk';
        a.target = {
          x: Math.max(petBounds.left, Math.min(petBounds.right, x)),
          y: Math.max(petBounds.top, Math.min(petBounds.bottom, y)),
        };
        this.nextThink = now + 0.5;
      }
      return;
    }
    if (now < this.nextThink) return;
    this.nextThink = now + 1 + this.random();
    const choices = w.pets
      .filter(
        (p) =>
          this.available(p) &&
          this.contact(p) !== null &&
          Math.hypot(p.x - ball.x, p.y - ball.y) < w.size * (p.id === 0 ? 1.3 : 3) &&
          !(p.id === 0 && speed > 2),
      )
      .map((p) => ({
        p,
        weight: [0.06, 0.85, 1, 0.2][p.id] * (1 - p.fatigue) * (0.4 + p.mind.curiosity),
      }));
    let n = this.random() * choices.reduce((s, c) => s + c.weight, 0);
    const chosen = choices.find((c) => (n -= c.weight) < 0)?.p;
    if (!chosen) return;
    this.diagnostics.started++;
    this.actor = chosen;
    this.until = now + 60;
    this.start(chosen);
    const others = w.pets.filter(
      (p) =>
        p !== chosen &&
        this.available(p) &&
        this.contact(p) !== null &&
        Math.hypot(p.x - ball.x, p.y - ball.y) < w.size * 2.2,
    );
    const preferred =
      chosen.id === 2 ? others.find((p) => p.id === 3) : others.find((p) => p.id !== 0);
    if (preferred && this.random() < 0.75) {
      this.buddy = preferred;
      preferred.edgeRest = false;
      preferred.target = null;
      preferred.state = 'sit';
      preferred.speed = 0;
      preferred.timer = 2;
    }
  }
}
