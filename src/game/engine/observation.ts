/** Bounded local diagnostics. Nothing in this module sends or persists data. */
export type ActionKind =
  | 'social-proposal'
  | 'call'
  | 'pet'
  | 'eat'
  | 'greet'
  | 'company'
  | 'stroll'
  | 'sniff'
  | 'play'
  | 'comfort'
  | 'ball'
  | 'solo';
export type ActionPhase =
  | 'paused'
  | 'discovered'
  | 'responding'
  | 'accepted'
  | 'proposed'
  | 'approach'
  | 'inviting'
  | 'together'
  | 'strolling'
  | 'chasing'
  | 'contact'
  | 'ended';
export type ActionResult = 'completed' | 'declined' | 'interrupted' | 'failed';
export type ActionEvent = {
  sessionId: string;
  actor: number;
  partner: number | null;
  kind: ActionKind;
  phase: ActionPhase;
  result: ActionResult | null;
  reason: string;
  gameTime: number;
};
type Session = Omit<ActionEvent, 'phase' | 'result' | 'reason' | 'gameTime'> & {
  started: number;
  phase: ActionPhase;
  firstContact: number | null;
};
export type Candidate = {
  actor: number;
  partner: number | null;
  kind: string;
  score: number;
  reason: string;
  target?: { x: number; y: number } | null;
  factors?: Record<string, number>;
  posture?: string;
  interruptOn?: string;
};
export class Observation {
  private serial = 0;
  private active = new Map<string, Session>();
  private events: ActionEvent[] = [];
  private finishes: {
    sessionId: string;
    kind: ActionKind;
    seconds: number;
    firstContactSeconds: number | null;
    result: ActionResult;
    reason: string;
  }[] = [];
  private totals: Record<string, number> = {};
  private endReasons: Record<string, number> = {};
  private starts: Record<string, number> = {};
  private display: Record<string, number> = {};
  private lastDisplay = new Map<number, { key: string; time: number }>();
  private candidates: Candidate[] = [];
  private append(event: ActionEvent) {
    this.events.push(event);
    if (this.events.length > 512) this.events.shift();
  }
  begin(
    kind: ActionKind,
    actor: number,
    partner: number | null,
    time: number,
    reason: string,
    phase: ActionPhase = 'proposed',
  ) {
    const sessionId = `action-${++this.serial}`;
    this.active.set(sessionId, {
      sessionId,
      kind,
      actor,
      partner,
      started: time,
      phase,
      firstContact: null,
    });
    this.totals[`${kind}:started`] = (this.totals[`${kind}:started`] ?? 0) + 1;
    this.append({ sessionId, kind, actor, partner, gameTime: time, phase, result: null, reason });
    return sessionId;
  }
  phase(
    id: string | undefined,
    phase: ActionPhase,
    time: number,
    reason: string,
    actor?: number,
    partner?: number | null,
  ) {
    const s = id ? this.active.get(id) : undefined;
    if (!s) return false;
    const roleChanged =
      (actor !== undefined && actor !== s.actor) ||
      (partner !== undefined && partner !== s.partner);
    if (actor !== undefined) s.actor = actor;
    if (partner !== undefined) s.partner = partner;
    if (phase === 'contact' && s.firstContact === null) s.firstContact = time;
    if (phase !== 'contact' && s.phase === phase && !roleChanged) return false;
    s.phase = phase;
    this.append({
      sessionId: s.sessionId,
      kind: s.kind,
      actor: s.actor,
      partner: s.partner,
      phase,
      gameTime: time,
      result: null,
      reason,
    });
    return true;
  }
  end(id: string | undefined, time: number, result: ActionResult, reason: string) {
    const s = id ? this.active.get(id) : undefined;
    if (!s) return false;
    this.phase(id, 'ended', time, reason);
    this.events[this.events.length - 1].result = result;
    this.active.delete(s.sessionId);
    this.totals[`${s.kind}:${result}`] = (this.totals[`${s.kind}:${result}`] ?? 0) + 1;
    const reasonKey = `${s.kind}:${reason}`;
    this.endReasons[reasonKey] = (this.endReasons[reasonKey] ?? 0) + 1;
    this.finishes.push({
      sessionId: s.sessionId,
      kind: s.kind,
      seconds: time - s.started,
      firstContactSeconds: s.firstContact === null ? null : s.firstContact - s.started,
      result,
      reason,
    });
    if (this.finishes.length > 128) this.finishes.shift();
    return true;
  }
  motion(actor: number, id: string) {
    const k = `${actor}:${id}`;
    this.starts[k] = (this.starts[k] ?? 0) + 1;
  }
  shown(actor: number, key: string, time: number) {
    const prev = this.lastDisplay.get(actor);
    if (prev) {
      const dt = Math.max(0, Math.min(0.1, time - prev.time));
      this.display[prev.key] = (this.display[prev.key] ?? 0) + dt;
    }
    this.lastDisplay.set(actor, { key: `${actor}:${key}`, time });
  }
  choices(candidates: Candidate[], kind: string) {
    this.candidates = [
      ...this.candidates.filter((c) => c.kind !== kind),
      ...candidates.map((c) => ({ ...c })),
    ].slice(-32);
  }
  snapshot() {
    return {
      events: this.events.map((e) => ({ ...e })),
      active: [...this.active.values()].map((s) => ({ ...s })),
      completed: this.finishes.map((s) => ({ ...s })),
      totals: { ...this.totals },
      endReasons: { ...this.endReasons },
      motionStarts: { ...this.starts },
      displaySeconds: { ...this.display },
      candidates: this.candidates.map((c) => ({ ...c })),
    };
  }
}
