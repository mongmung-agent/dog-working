import type { MeadowEvent, Pet, PetState } from './core';

import { type ExpressionKind } from '../const/emotions';
type Expression = { mood: ExpressionKind; partner?: number | null; until: number; direct: boolean };
type Slot = {
  state: PetState;
  changedAt: number;
  handled: boolean;
  cooldown: number;
  lastShown: number;
  expression: Expression | null;
};
const everyday = new Set<PetState>(['rest', 'sit', 'lie', 'sleep', 'run', 'walk']);

/** Uses game time, so dialogs and hidden tabs pause expression timers too. */
export class Emotions {
  private slots: Slot[];
  private nextAmbient = 3;
  constructor(
    private pets: Pet[],
    private random: () => number = Math.random,
  ) {
    this.slots = pets.map((p) => ({
      state: p.state,
      changedAt: 0,
      handled: false,
      cooldown: 0,
      lastShown: -100 + p.id * 0.01,
      expression: null,
    }));
  }
  private show(id: number, mood: ExpressionKind, now: number, duration: number, direct: boolean) {
    const slot = this.slots[id];
    slot.expression = { mood, until: now + duration, direct };
    slot.lastShown = now;
    slot.cooldown = now + 12 + this.random() * 6;
    this.nextAmbient = now + 6 + this.random() * 4;
  }
  feedback(event: MeadowEvent, now: number) {
    // A deliberate interaction takes priority over background expressions.
    if (event.type !== 'social')
      this.slots.forEach((slot) => {
        if (slot.expression && !slot.expression.direct) slot.expression = null;
      });
    const slot = this.slots[event.id];
    if (slot.expression && now >= slot.expression.until) slot.expression = null;
    if (event.type === 'social' && slot.expression?.direct) return;
    // Events describe the state already applied by the world in this tick.
    // Synchronize before update() so it cannot discard that fresh feedback.
    if (slot.state !== this.pets[event.id].state) {
      slot.state = this.pets[event.id].state;
      slot.changedAt = now;
      slot.handled = false;
    }
    const mood: ExpressionKind =
      event.type === 'social'
        ? event.result === 'declined'
          ? 'declined'
          : event.kind === 'comfort' && event.result === 'completed'
            ? 'relieved'
            : event.result === 'completed' && event.phase === 'ended'
              ? 'content'
              : event.phase === 'inviting'
                ? 'expectation'
                : (event.kind ?? 'greet')
        : event.type === 'call'
          ? 'notice'
          : event.type === 'arrive'
            ? 'wait'
            : event.type;
    this.show(event.id, mood, now, event.type === 'call' ? 0.8 : 2.5, event.type !== 'social');
    this.slots[event.id].expression!.partner = event.partner;
  }
  update(pets: Pet[], now: number, size: number) {
    pets.forEach((pet) => {
      const slot = this.slots[pet.id];
      if (pet.state !== slot.state) {
        slot.state = pet.state;
        slot.changedAt = now;
        slot.handled = false;
        if (slot.expression && !slot.expression.direct) slot.expression = null;
      }
      if (slot.expression && now >= slot.expression.until) slot.expression = null;
      if (!slot.handled && pet.state === 'coming' && now - slot.changedAt >= 0.6) {
        slot.handled = true;
        this.show(pet.id, 'coming', now, 1.6, true);
      }
    });
    if (now < this.nextAmbient || this.slots.some((s) => s.expression)) return;
    const candidates = pets.filter(
      (p) =>
        everyday.has(p.state) &&
        !p.held &&
        now >= this.slots[p.id].cooldown &&
        now - this.slots[p.id].changedAt >= 0.7,
    );
    // Avoid crowded pairs. Waiting a little is better than overlapping labels.
    const spaced = candidates.filter((p) =>
      pets.every(
        (other) => other.id === p.id || Math.hypot(other.x - p.x, other.y - p.y) > size * 0.7,
      ),
    );
    spaced.sort((a, b) => this.slots[a.id].lastShown - this.slots[b.id].lastShown);
    const pet = spaced[0];
    if (!pet) return;
    const mood: ExpressionKind =
      pet.state === 'sleep'
        ? 'sleep'
        : pet.mind?.surprise > 0.35
          ? 'startled'
          : pet.mind?.joy > 0.55
            ? 'content'
            : pet.mind?.curiosity > 0.6 && pet.state === 'rest'
              ? 'sit'
              : pet.state;
    this.show(
      pet.id,
      mood,
      now,
      ['sleep', 'lie', 'sit', 'rest'].includes(pet.state) ? 2.5 : 2,
      false,
    );
  }
  get(id: number) {
    return this.slots[id].expression;
  }
}
