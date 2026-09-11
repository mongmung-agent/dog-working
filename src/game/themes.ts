import { assetUrl } from './base-path';

export const THEMES = [
  {
    id: 'meadow',
    thumbnail: assetUrl('/themes/thumbnails/meadow.webp'),
    name: '햇살 들판',
    image: assetUrl('/themes/meadow.webp'),
  },
  {
    id: 'forest',
    thumbnail: assetUrl('/themes/thumbnails/forest.webp'),
    name: '숲속 오솔길',
    image: assetUrl('/themes/forest.webp'),
  },
  {
    id: 'park',
    thumbnail: assetUrl('/themes/thumbnails/park.webp'),
    name: '도심 공원',
    image: assetUrl('/themes/park.webp'),
  },
] as const;
export type ThemeId = (typeof THEMES)[number]['id'];
export const isThemeId = (value: unknown): value is ThemeId =>
  THEMES.some((theme) => theme.id === value);
