import { assetUrl } from '../base-path';

export const THEMES = [
  {
    id: 'meadow',
    thumbnail: assetUrl('/themes/thumbnails/meadow.webp'),
    name: '햇살 들판',
    image: assetUrl('/themes/meadow.webp'),
    music: assetUrl('/music/meadow.m4a?v=gemini-1'),
  },
  {
    id: 'forest',
    thumbnail: assetUrl('/themes/thumbnails/forest.webp'),
    name: '숲속 오솔길',
    image: assetUrl('/themes/forest.webp'),
    music: assetUrl('/music/forest.m4a?v=gemini-1'),
  },
  {
    id: 'park',
    thumbnail: assetUrl('/themes/thumbnails/park.webp'),
    name: '도심 공원',
    image: assetUrl('/themes/park.webp'),
    music: assetUrl('/music/park.m4a?v=gemini-1'),
  },
  {
    id: 'apartment',
    thumbnail: assetUrl('/themes/thumbnails/apartment.webp'),
    name: '벚꽃 단지 산책길',
    image: assetUrl('/themes/apartment.webp'),
    music: assetUrl('/music/apartment.m4a?v=petals-1'),
  },
] as const;
export type ThemeId = (typeof THEMES)[number]['id'];
export const isThemeId = (value: unknown): value is ThemeId =>
  THEMES.some((theme) => theme.id === value);
