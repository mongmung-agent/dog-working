import type { Facing, Pet, PetState } from './core';
import { assets } from './assets';
import { assetUrl } from './base-path';
import {
  layoutFrames,
  layoutMotionFrames,
  correctMotionPixels,
  movementArtwork,
  frontCallArtwork,
  directionalBodyFactor,
  motionSkulls,
  profiles,
  type ArtBox,
} from './art-layout';
import { motionKeypose, motionFrame, type MotionPanel } from './motion';
import { registerNoseAnchor } from './toys';

type Bounds = { x: number; y: number; w: number; h: number };
type ArtCanvas = HTMLCanvasElement & { artBounds?: Bounds };
const sheets: Record<string, ArtCanvas[][]> = {};
const originalSkullHeights: Record<string, number> = {};
const movementScales: Record<string, number> = {};
// Enabled only after identity and frame review of the replacement set.
const motionArtworkEnabled = true;
const actions: Record<string, ArtCanvas[][]> = {};
type MotionSource = {
  key: string;
  facing: 'left' | 'right';
  panel: MotionPanel;
  source: HTMLCanvasElement;
  boxes: ArtBox[][];
};
const motionSources: MotionSource[] = [];
// Nose tip in the cropped maximum-reach pose (actions R1 C4), after correction.
// Explicit landmarks exclude ears, tongue and whiskers; left is not mirrored right.
const noseTips: Record<string, Record<'left' | 'right', [number, number]>> = {
  minky: { right: [0.905, 0.36], left: [0.095, 0.46] },
  mongsil: { right: [0.96, 0.29], left: [0.04, 0.155] },
};
let loadError: Error | null = null;

function sheet(key: string, rowCount = 5, columnCount = 4) {
  return new Promise<void>((resolve, reject) => {
    const image = new Image();
    image.onerror = () => reject(new Error(`${key} image failed`));
    image.onload = () => {
      try {
        const source = document.createElement('canvas');
        source.width = image.width;
        source.height = image.height;
        const context = source.getContext('2d', { willReadFrequently: true })!;
        context.drawImage(image, 0, 0);
        const data = context.getImageData(0, 0, image.width, image.height).data;
        const boxes: ArtBox[][] = Array.from({ length: rowCount }, (_, row) =>
          Array.from({ length: columnCount }, (_, column) => {
            const sx = Math.round((image.width * column) / columnCount),
              ex = Math.round((image.width * (column + 1)) / columnCount);
            const sy = Math.round((image.height * row) / rowCount),
              ey = Math.round((image.height * (row + 1)) / rowCount);
            let left = ex,
              right = -1,
              top = ey,
              bottom = -1;
            for (let y = sy; y < ey; y++)
              for (let x = sx; x < ex; x++) {
                if (data[(y * image.width + x) * 4 + 3] > 128) {
                  left = Math.min(left, x);
                  right = Math.max(right, x);
                  top = Math.min(top, y);
                  bottom = Math.max(bottom, y);
                }
              }
            if (right < left) throw new Error(`Empty animation cell ${key}`);
            return { l: left, t: top, w: right - left + 1, h: bottom - top + 1 };
          }),
        );
        const placements = layoutFrames(key, boxes);
        if (profiles[key])
          originalSkullHeights[key] = placements[1][0].scale * profiles[key].directions[1].skull;
        sheets[key] = boxes.map((row, r) =>
          row.map((box, c) => {
            const tile = document.createElement('canvas') as ArtCanvas;
            tile.width = tile.height = 256;
            const ctx = tile.getContext('2d')!;
            ctx.imageSmoothingEnabled = false;
            const { x, y, w, h } = placements[r][c];
            ctx.drawImage(source, box.l, box.t, box.w, box.h, x, y, w, h);
            tile.artBounds = { x, y, w, h };
            return tile;
          }),
        );
        resolve();
      } catch (error) {
        reject(error);
      }
    };
    image.src = assets[key as keyof typeof assets];
  });
}

const petKeys = ['minky', 'mongsil'] as const;
async function actionSheet(key: string, facing: 'left' | 'right', panel: MotionPanel) {
  const image = new Image();
  image.src = assetUrl(`/pets/${panel}/${key}-${facing}.webp`);
  await image.decode();
  const source = document.createElement('canvas');
  source.width = image.width;
  source.height = image.height;
  const context = source.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, image.width, image.height);
  // Generated key-color is background, never part of the animal's coat.
  for (let i = 0; i < pixels.data.length; i += 4) {
    const [r, g, b] = pixels.data.subarray(i, i + 3);
    if (Math.min(r, b) - g > 45 && r > 110 && b > 110) pixels.data[i + 3] = 0;
  }
  correctMotionPixels(key, facing, panel, pixels.data, image.width, image.height);
  context.putImageData(pixels, 0, 0);
  const boxes = Array.from({ length: 4 }, (_, row) =>
    Array.from({ length: 4 }, (_, col) => {
      const sx = Math.round((col * image.width) / 4),
        ex = Math.round(((col + 1) * image.width) / 4);
      const sy = Math.round((row * image.height) / 4),
        ey = Math.round(((row + 1) * image.height) / 4);
      let l = ex,
        t = ey,
        right = -1,
        bottom = -1,
        largest = 0;
      const cw = ex - sx,
        ch = ey - sy,
        seen = new Uint8Array(cw * ch);
      // Ignore detached key-color compression specks when measuring the animal.
      // This preserves the rendered body and prevents a stray pixel moving its feet.
      for (let start = 0; start < seen.length; start++) {
        if (seen[start]) continue;
        const queue = [start];
        seen[start] = 1;
        let count = 0,
          cl = ex,
          ct = ey,
          cr = -1,
          cb = -1;
        for (let n = 0; n < queue.length; n++) {
          const index = queue[n],
            x = sx + (index % cw),
            y = sy + Math.floor(index / cw);
          if (pixels.data[(y * image.width + x) * 4 + 3] <= 128) continue;
          count++;
          cl = Math.min(cl, x);
          ct = Math.min(ct, y);
          cr = Math.max(cr, x);
          cb = Math.max(cb, y);
          for (const next of [
            index % cw ? index - 1 : -1,
            index % cw < cw - 1 ? index + 1 : -1,
            index - cw,
            index + cw,
          ]) {
            if (next >= 0 && next < seen.length && !seen[next]) {
              seen[next] = 1;
              queue.push(next);
            }
          }
        }
        if (count > largest) {
          largest = count;
          l = cl;
          t = ct;
          right = cr;
          bottom = cb;
        }
      }
      if (right < l) throw new Error(`Missing action keypose ${key}/${facing}/${row}/${col}`);
      return { l, t, w: right - l + 1, h: bottom - t + 1 };
    }),
  );
  motionSources.push({ key, facing, panel, source, boxes });
}

function registerMotionSheets() {
  for (const key of petKeys) {
    const sources = motionSources.filter((item) => item.key === key);
    if (!sources.length) continue;
    const placements = layoutMotionFrames(
      key,
      sources.map((item) => ({
        ...item,
        sourceHeight: item.source.height,
      })),
      originalSkullHeights[key],
    );
    const reference = sources[0];
    movementScales[key] =
      (placements[0][0][0].scale *
        motionSkulls[key][reference.facing][reference.panel] *
        reference.source.height) /
      1254 /
      originalSkullHeights[key];
    for (const [index, { facing, panel, source, boxes }] of sources.entries()) {
      actions[`${key}-${facing}-${panel}`] = boxes.map((row, r) =>
        row.map((box, c) => {
          const tile = document.createElement('canvas') as ArtCanvas;
          tile.width = tile.height = 256;
          const { x, y, w, h } = placements[index][r][c];
          if (panel === 'actions' && r === 0 && c === 3) {
            const [nx, ny] = noseTips[key][facing];
            registerNoseAnchor(key, facing, x + w * nx, y + h * ny);
          }
          tile.getContext('2d')!.drawImage(source, box.l, box.t, box.w, box.h, x, y, w, h);
          tile.artBounds = { x, y, w, h };
          return tile;
        }),
      );
    }
  }
  motionSources.length = 0;
}
export const artworkReady = Promise.all([
  ...petKeys.map((key) => sheet(key)),
  sheet('treats', 1, 2),
  ...(motionArtworkEnabled
    ? petKeys.flatMap((key) =>
        (['actions', 'rest', 'detail', 'gait'] as const).flatMap((panel) => [
          actionSheet(key, 'right', panel),
          actionSheet(key, 'left', panel),
        ]),
      )
    : []),
])
  .then(registerMotionSheets)
  .catch((error: Error) => {
    loadError = error;
    throw error;
  });
const directionRows: Record<Facing | 'poses', number> = {
  front: 0,
  right: 1,
  back: 2,
  left: 3,
  poses: 4,
};
function frame(pet: Pet, key: Facing | 'poses', column: number) {
  return sheets[petKeys[pet.id]]?.[directionRows[key]]?.[column];
}

export function paintPet(canvas: HTMLCanvasElement, pet: Pet, time = 0, portrait = false) {
  if (canvas.width !== 256) canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d')!;
  context.clearRect(0, 0, 256, 256);
  context.imageSmoothingEnabled = false;
  const visibleState = pet.state === 'pet' ? pet.petPose || 'rest' : pet.state;
  const moving = ['run', 'walk', 'coming'].includes(visibleState);
  const pose: Partial<Record<PetState, number>> = { sit: 0, lie: 1, sleep: 2 };
  let key: Facing | 'poses' = moving ? pet.facing : 'poses',
    column = moving ? Math.floor(pet.stride * 4) % 4 : (pose[visibleState] ?? 3);
  if (portrait) {
    key = 'front';
    column = 0;
  }
  if (pet.state === 'rising') {
    key = 'poses';
    column = pet.timer > 0.24 ? (pose[pet.riseFrom || 'rest'] ?? 0) : 3;
  }
  const facing = pet.facing === 'left' ? 'left' : 'right';
  const passive = moving
    ? visibleState === 'walk'
      ? 'walk'
      : 'run'
    : visibleState === 'eat'
      ? 'mouth'
      : visibleState === 'sleep'
        ? 'sleep'
        : visibleState === 'lie'
          ? 'lie'
          : visibleState === 'sit'
            ? 'sit'
            : 'idle';
  const phase = pet.motion
    ? motionFrame(pet.motion)
    : ['sit', 'lie', 'sleep'].includes(passive)
      ? 7
      : moving
        ? Math.floor(pet.stride * 8) % 8
        : Math.floor(time * (passive === 'mouth' ? 7 : 3)) % 8;
  const clip = motionKeypose(pet.motion?.id ?? passive, phase);
  const frontCall = frontCallArtwork(pet.facing, visibleState, pet.motion?.id);
  if (frontCall) {
    key = 'front';
    column = 0;
  }
  const directionalMovement =
    movementArtwork(pet.facing, moving, Boolean(pet.motion)) === 'original';
  const tile =
    portrait || !motionArtworkEnabled || directionalMovement || frontCall
      ? frame(pet, key, column)
      : actions[`${pet.key}-${facing}-${clip.panel}`]?.[clip.row]?.[clip.column];
  if (!tile) return;
  context.fillStyle = '#41612638';
  context.beginPath();
  context.ellipse(128, 238, 65, 11, 0, 0, Math.PI * 2);
  context.fill();
  const movementScale =
    (directionalMovement || frontCall) && motionArtworkEnabled && !portrait
      ? (movementScales[pet.key] ?? 1) * directionalBodyFactor(pet.key, pet.facing)
      : 1;
  const offsetX = 128 * (1 - movementScale),
    offsetY = 242 * (1 - movementScale);
  context.drawImage(tile, offsetX, offsetY, 256 * movementScale, 256 * movementScale);
  if (pet.state === 'eat' && !pet.motion) {
    const treat = sheets.treats?.[0]?.[1],
      b = tile.artBounds,
      anchor = [facing === 'left' ? 0.07 : 0.93, 0.37];
    if (treat && b) {
      const x = b.x + b.w * anchor[0],
        y = b.y + b.h * anchor[1];
      context.drawImage(treat, x - 44, y - 11, 52, 52);
    }
  }
  const b = tile.artBounds;
  return b
    ? {
        x: offsetX + b.x * movementScale,
        y: offsetY + b.y * movementScale,
        w: b.w * movementScale,
        h: b.h * movementScale,
      }
    : undefined;
}
export const artworkError = () => loadError;
