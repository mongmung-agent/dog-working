import { assets } from './assets';

function load(key: keyof typeof assets) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Intro artwork failed: ${key}`));
    image.src = assets[key];
  });
}
function paint(canvas: HTMLCanvasElement, image: HTMLImageElement, key: string) {
  const source = document.createElement('canvas');
  source.width = image.naturalWidth;
  source.height = image.naturalHeight;
  const context = source.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, source.width, source.height),
    data = pixels.data;
  let left = source.width,
    top = source.height,
    right = -1,
    bottom = -1;
  for (let y = 0; y < source.height; y += 1)
    for (let x = 0; x < source.width; x += 1) {
      const index = (y * source.width + x) * 4;
      if (data[index + 3] > 128) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
  if (right < left) throw new Error(`Empty intro artwork: ${key}`);
  canvas.width = right - left + 1;
  canvas.height = bottom - top + 1;
  canvas
    .getContext('2d')!
    .drawImage(source, left, top, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
}
export async function prepareIntro() {
  const keys = ['background', 'logo', 'minky', 'mongsil'] as const;
  await Promise.all(
    keys.map(async (key) => {
      const image = await load(`intro_${key}`);
      if (key === 'background')
        (document.getElementById('intro-background') as HTMLImageElement).src = image.src;
      else paint(document.getElementById(`intro-${key}`) as HTMLCanvasElement, image, key);
    }),
  );
}
