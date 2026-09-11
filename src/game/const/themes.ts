export const THEMES = [
  {
    id: 'meadow',
    thumbnail: '/themes/thumbnails/meadow.webp',
    name: '햇살 들판',
    image: '/themes/meadow.webp',
    music: '/music/meadow.m4a?v=gemini-1',
  },
  {
    id: 'forest',
    thumbnail: '/themes/thumbnails/forest.webp',
    name: '숲속 오솔길',
    image: '/themes/forest.webp',
    music: '/music/forest.m4a?v=gemini-1',
  },
  {
    id: 'park',
    thumbnail: '/themes/thumbnails/park.webp',
    name: '도심 공원',
    image: '/themes/park.webp',
    music: '/music/park.m4a?v=gemini-1',
  },
  {
    id: 'apartment',
    thumbnail: '/themes/thumbnails/apartment.webp',
    name: '벚꽃 단지 산책길',
    image: '/themes/apartment.webp',
    music: '/music/apartment.m4a?v=petals-1',
  },
] as const
export type ThemeId = (typeof THEMES)[number]['id']
export const isThemeId = (value: unknown): value is ThemeId =>
  THEMES.some(theme => theme.id === value)
