/**
 * Returns the resolved URL for a static asset, taking into account Vite's base path.
 * Supports both root hosting, subpath hosting (e.g. GitHub Pages /repo-name/), and relative builds.
 */
export function assetUrl(path: string): string {
  const base = import.meta.env.BASE_URL ?? '/';
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  if (!base || base === '/') {
    return `/${cleanPath}`;
  }
  return base.endsWith('/') ? `${base}${cleanPath}` : `${base}/${cleanPath}`;
}
