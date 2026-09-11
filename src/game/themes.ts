export const THEMES = [
  {
    id: 'meadow',
    thumbnail: '/themes/thumbnails/meadow.webp',
    name: '햇살 들판',
    image: '/themes/meadow.webp',
  },
  {
    id: 'forest',
    thumbnail: '/themes/thumbnails/forest.webp',
    name: '숲속 오솔길',
    image: '/themes/forest.webp',
  },
  {
    id: 'park',
    thumbnail: '/themes/thumbnails/park.webp',
    name: '도심 공원',
    image: '/themes/park.webp',
  },
] as const;
export type ThemeId = (typeof THEMES)[number]['id'];
export const isThemeId = (value: unknown): value is ThemeId =>
  THEMES.some((theme) => theme.id === value);
