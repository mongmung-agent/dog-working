import type { Pet } from './core';
export type Experience = {
  kind: 'play' | 'greet' | 'company' | 'stroll' | 'pet' | 'eat' | 'call' | 'declined';
  other: number | null;
  at: number;
  strength: number;
};
export type Mind = {
  joy: number;
  curiosity: number;
  surprise: number;
  memories: Experience[];
  affinity: number[];
};
export function createMind(id: number): Mind {
  return { joy: 0.25, curiosity: 0.25, surprise: 0, memories: [], affinity: [0.5, 0.5] };
}
/** Game-time decay, bounded recent memory; no persistence or neglect penalties. */
export function updateMind(p: Pet, dt: number, now: number) {
  const m = p.mind;
  m.joy = 0.25 + (m.joy - 0.25) * Math.exp(-dt / 25);
  const baseline = 0.25;
  m.curiosity = baseline + (m.curiosity - baseline) * Math.exp(-dt / 15);
  m.surprise *= Math.exp(-dt / 3);
  m.memories = m.memories.filter((e) => now - e.at < 120);
  for (let i = 0; i < m.affinity.length; i++) {
    const base = createAffinity(p.id, i);
    m.affinity[i] = base + (m.affinity[i] - base) * Math.exp(-dt / 300);
  }
}
function createAffinity(_id: number, _other: number) {
  return 0.5;
}
export function remember(
  p: Pet,
  kind: Experience['kind'],
  now: number,
  other: number | null = null,
) {
  const m = p.mind;
  const strength = kind === 'call' ? 0.45 : kind === 'declined' ? 0.15 : 0.35;
  m.memories.push({ kind, other, at: now, strength });
  if (m.memories.length > 8) m.memories.shift();
  if (kind === 'call') {
    m.surprise = Math.min(1, m.surprise + 0.5);
    m.curiosity = Math.min(1, m.curiosity + 0.15);
  } else if (kind !== 'declined') {
    m.joy = Math.min(1, m.joy + strength);
    if (other !== null) m.affinity[other] = Math.min(1, m.affinity[other] + 0.04);
  }
}
export function memoryWeight(p: Pet, other: number, kind: Experience['kind'], now: number) {
  return p.mind.memories.reduce(
    (score, e) =>
      e.other === other && now - e.at < 60
        ? score * (e.kind === 'declined' ? 0.2 : e.kind === kind ? 0.55 : 0.85)
        : score,
    1,
  );
}
