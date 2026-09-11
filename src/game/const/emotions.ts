/** Single source for in-game expressions and the automatically rendered guide.
 * Each expression has a distinct emoji and one meaning. */
export const EMOTIONS = {
  rest: { emoji: '🙂', label: '잠깐 쉬는 중' },
  sit: { emoji: '👀', label: '주변이 궁금해요' },
  lie: { emoji: '☺️', label: '누워서 편하게 쉬어요' },
  sleep: { emoji: '💤', label: '새근새근…' },
  rising: { emoji: '🥱', label: '일어나는 중' },
  run: { emoji: '😆', label: '신나게 뛰는 중' },
  walk: { emoji: '🧭', label: '들판을 구경해요' },
  notice: { emoji: '❓', label: '응? 불렀어?' },
  coming: { emoji: '🎶', label: '지금 갈게!' },
  wait: { emoji: '💡', label: '여기 왔어요!' },
  pet: { emoji: '😍', label: '쓰다듬어 주니 좋아요' },
  eat: { emoji: '😋', label: '냠냠, 맛있어' },
  greet: { emoji: '👋', label: '친구에게 인사해요' },
  company: { emoji: '😊', label: '친구 곁에서 쉬어요' },
  stroll: { emoji: '🐾', label: '친구와 함께 걸어요' },
  sniff: { emoji: '🔎', label: '함께 냄새를 살펴봐요' },
  play: { emoji: '😝', label: '친구와 놀아요' },
  comfort: { emoji: '💗', label: '친구 곁에서 안심시켜요' },
  ball: { emoji: '⚽', label: '공을 밀며 놀아요' },
  declined: { emoji: '🌿', label: '다음에 같이 놀자' },
  content: { emoji: '🥰', label: '만족스럽고 기분 좋아요' },
  startled: { emoji: '😯', label: '조금 놀랐어요' },
  expectation: { emoji: '✨', label: '같이 해볼까?' },
  relieved: { emoji: '😌', label: '친구가 곁에 있어 안심돼요' },
} as const satisfies Record<string, { emoji: string; label: string }>

export type ExpressionKind = keyof typeof EMOTIONS
