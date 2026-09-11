import { assetUrl } from '../base-path';

export const assets = {
  meadow: assetUrl('/themes/meadow.webp'),
  minky: assetUrl('/pets/minky-ear-fixed.webp'),
  mongsil: assetUrl('/pets/mongsil-photo.webp'),
  treats: assetUrl('/treats.webp'),
  intro_background: assetUrl('/intro/background.webp'),
  intro_logo: assetUrl('/intro/logo.webp'),
  intro_minky: assetUrl('/intro/minky.webp'),
  intro_mongsil: assetUrl('/intro/mongsil.webp'),
} as const;
