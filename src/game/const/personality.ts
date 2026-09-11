import { AnimalKey } from '../core';

/** Behavioral tuning only: no artwork, palette, species, or sprite geometry. */
const common = {
  curiosity: 0.25,
  socialJoy: 1,
  affinityGain: 0.04,
  replyDelay: 0.8,
  passingGreeting: 0.25,
  ballRadius: 3,
  ballCaution: false,
  preferredBuddy: null as AnimalKey | null,
  preferLie: false,
};
export const PERSONALITIES = {
  minky: {
    ...common,
    initiative: 0.22,
    acceptance: 0.7,
    edgeRest: 0.78,
    energy: 0.48,
    shy: true,
    ballInterest: 0.06,
    ballRadius: 1.3,
    ballCaution: true,
    preferLie: true,
  },
  mongsil: {
    ...common,
    initiative: 0.95,
    acceptance: 0.95,
    edgeRest: 0,
    energy: 0.78,
    shy: false,
    ballInterest: 0.85,
    passingGreeting: 0.65,
  },
} as const satisfies Record<
  AnimalKey,
  typeof common & {
    initiative: number;
    acceptance: number;
    edgeRest: number;
    energy: number;
    shy: boolean;
    ballInterest: number;
  }
>;
export const RELATIONSHIPS = [
  [
    { affinity: 0.5, preference: 1 },
    { affinity: 0.5, preference: 1 },
    { affinity: 0.5, preference: 1 },
    { affinity: 0.5, preference: 1 },
  ],
  [
    { affinity: 0.5, preference: 1 },
    { affinity: 0.5, preference: 1 },
    { affinity: 0.5, preference: 1 },
    { affinity: 0.5, preference: 1 },
  ],
  [
    { affinity: 0.5, preference: 1 },
    { affinity: 0.5, preference: 1 },
    { affinity: 0.5, preference: 1 },
    { affinity: 0.85, preference: 3 },
  ],
  [
    { affinity: 0.5, preference: 1 },
    { affinity: 0.5, preference: 1 },
    { affinity: 0.6, preference: 1 },
    { affinity: 0.5, preference: 1 },
  ],
] as const;
