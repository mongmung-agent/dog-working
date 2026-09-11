import type { Pet } from './core'
export type Participation = 'solo' | 'social' | 'ball'
export type EligibilityContext = {
  kind: Participation
  now: number
  owned?: boolean
  cooldown?: number
}
/** Hard entry gates. Scores and personality never override these conditions. */
export function participationReason(p: Pet, c: EligibilityContext): string | null {
  if (p.held) return 'held'
  if (p.pendingCall) return 'pending-call'
  if (c.kind !== 'solo' && p.near) return 'user-owned'
  if (p.motion) return 'motion-active'
  if (c.owned) return 'other-owner'
  if (p.state === 'sleep' && (c.kind !== 'solo' || p.timer > 0)) return 'sleeping'
  const states =
    c.kind === 'solo'
      ? ['rest', 'sit', 'lie', 'walk', 'run', 'sleep', 'wait', 'pet', 'eat']
      : ['rest', 'sit', 'lie', 'walk', 'run']
  if (!states.includes(p.state)) return 'posture-unavailable'
  if (c.kind !== 'solo' && c.now < p.decisionUntil) return 'minimum-duration'
  if (c.now < (c.cooldown ?? 0)) return 'cooldown'
  if (c.kind === 'ball' && p.fatigue >= 0.72) return 'fatigue'
  return null
}
