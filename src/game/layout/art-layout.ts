/** Coordinates inside a normalized 256px tile. World positions refer to its center. */
export const ART_SPACE = { tile: 256, center: 128, feet: 242, shadow: 238 } as const;
export function tileOffset(pixel: number) {
  return (pixel - ART_SPACE.center) / ART_SPACE.tile;
}
/** Greeting is a non-contact nose gesture, with extra personal space for shy pets. */
export function greetingGap(size: number, actorScale: number, partnerScale: number, shy: boolean) {
  return ((size * (actorScale + partnerScale)) / 2) * (shy ? 1.05 : 0.9);
}
export type ArtBox = { l: number; t: number; w: number; h: number };
export type ArtPlacement = { x: number; y: number; w: number; h: number; scale: number };
type Measure = { shoulder: number; skull: number };
type Profile = { directions: Measure[]; poseSkulls: number[] };

// Visual estimates in source pixels, measured on the representative first frame
// of front/right/back/left. Shoulder height is measured from the support foot;
// skull height excludes ears, tail and loose hair. These are calibration inputs,
// not automatically detected anatomy. Recheck when replacing a sprite sheet.
export const profiles: Record<string, Profile> = {
  minky: {
    directions: [
      { shoulder: 96, skull: 90 },
      { shoulder: 101, skull: 72 },
      { shoulder: 106, skull: 77 },
      { shoulder: 101, skull: 72 },
    ],
    poseSkulls: [91, 86, 83, 92],
  },
  mongsil: {
    directions: [
      { shoulder: 116, skull: 96 },
      { shoulder: 119, skull: 78 },
      { shoulder: 132, skull: 88 },
      { shoulder: 119, skull: 78 },
    ],
    poseSkulls: [97, 90, 83, 97],
  },
};
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const limit = (v: number) => Math.max(0.72, Math.min(1.22, v));
export function directionFactors(key: string): number[] {
  const profile = profiles[key];
  if (!profile) return [1, 1, 1, 1];
  const body = median(profile.directions.map((m) => m.shoulder));
  const head = median(profile.directions.map((m) => m.skull));
  // Heads are the stable visual identity across turns. Shoulder height changes
  // with perspective and gait, so it only moderates head-based calibration.
  // Keep uniform scaling: stretching a whole frame would distort faces and legs.
  return profile.directions.map((m) => limit((body / m.shoulder) ** 0.1 * (head / m.skull) ** 0.9));
}

export function layoutFrames(key: string, rows: ArtBox[][], normalized = true): ArtPlacement[][] {
  const profile = normalized ? profiles[key] : undefined;
  const factors = directionFactors(key);
  const correctedFrontHead = profile ? profile.directions[0].skull * factors[0] : 1;
  const scales = rows.map((row, r) =>
    row.map((_, c) =>
      profile ? (r < 4 ? factors[r] : limit(correctedFrontHead / profile.poseSkulls[c])) : 1,
    ),
  );
  // Fit the entire character once. Never enlarge each direction to fill its box.
  const commonScale = profile
    ? Math.min(
        ...rows
          .slice(0, 4)
          .flatMap((row, r) =>
            row.flatMap((b, c) => [224 / (b.w * scales[r][c]), 226 / (b.h * scales[r][c])]),
          ),
      )
    : 1;
  return rows.map((row, r) => {
    const legacyScale = Math.min(...row.flatMap((b) => [224 / b.w, 226 / b.h]));
    return row.map((b, c) => {
      const scale = profile
        ? Math.min(commonScale * scales[r][c], 224 / b.w, 226 / b.h)
        : legacyScale;
      const w = Math.round(b.w * scale),
        h = Math.round(b.h * scale);
      return { x: Math.round((256 - w) / 2), y: ART_SPACE.feet - h, w, h, scale };
    });
  });
}

/** Measured neutral skull height in source pixels (1254px sheets), excluding
 * ears, tongue, tail and loose hair. Re-measure when replacing these assets.
 * Order is gait/rest/actions/detail; each direction is measured separately. */
export const motionSkulls: Record<string, Record<'right' | 'left', Record<string, number>>> = {
  minky: {
    right: { gait: 100, rest: 110, actions: 105, detail: 102 },
    left: { gait: 94, rest: 99, actions: 97, detail: 94 },
  },
  mongsil: {
    right: { gait: 82, rest: 92, actions: 92, detail: 90 },
    left: { gait: 85, rest: 87, actions: 83, detail: 82 },
  },
};

type MotionLayoutSource = {
  facing: 'left' | 'right';
  panel: string;
  boxes: ArtBox[][];
  sourceHeight: number;
};
export function layoutMotionFrames(
  key: string,
  sources: MotionLayoutSource[],
  targetSkull: number,
) {
  const skulls = sources.map((s) => (motionSkulls[key][s.facing][s.panel] * s.sourceHeight) / 1254);
  // One viewport safety factor for the entire character. A long tail may require
  // more canvas room, but never changes one panel's scale relative to another.
  const head = Math.min(
    targetSkull,
    ...sources.flatMap((s, i) =>
      s.boxes.flatMap((row) =>
        row.flatMap((b) => [(224 * skulls[i]) / b.w, (210 * skulls[i]) / b.h]),
      ),
    ),
  );
  return sources.map((s, i) => {
    const scale = head / skulls[i];
    const neutralWidth = s.boxes[0][0].w * scale;
    return s.boxes.map((row, r) =>
      row.map((b, c) => {
        const w = b.w * scale,
          h = b.h * scale;
        const anchoredX =
          s.facing === 'right' ? (256 - neutralWidth) / 2 : (256 + neutralWidth) / 2 - w;
        const x = Math.max(0, Math.min(256 - w, anchoredX));
        const lift =
          s.panel === 'actions' && r === 3 && c === 2
            ? 28
            : s.panel === 'gait' && r === 2 && c % 2 === 1
              ? 12
              : 0;
        return { x, y: ART_SPACE.feet - h - lift, w, h, scale };
      }),
    );
  });
}

// Source-cell head centres for Luffy's action sheet. A local, feathered warp
// corrects its larger head without shrinking the torso, paws or tail.
const luffyActionHeads = [
  [0.7, 0.5],
  [0.71, 0.49],
  [0.71, 0.52],
  [0.73, 0.54],
  [0.7, 0.48],
  [0.72, 0.61],
  [0.72, 0.72],
  [0.73, 0.69],
  [0.7, 0.48],
  [0.71, 0.58],
  [0.73, 0.64],
  [0.73, 0.64],
  [0.7, 0.35],
  [0.71, 0.51],
  [0.7, 0.2],
  [0.73, 0.51],
];
export function correctMotionPixels(
  key: string,
  facing: string,
  panel: string,
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
) {
  if (key !== 'luffy' || facing !== 'right' || panel !== 'actions') return;
  const source = pixels.slice(),
    cw = width / 4,
    ch = height / 4;
  for (let row = 0; row < 4; row++)
    for (let col = 0; col < 4; col++) {
      const [hx, hy] = luffyActionHeads[row * 4 + col];
      const cx = (col + hx) * cw,
        cy = (row + hy) * ch;
      const rx = cw * 0.28,
        ry = ch * 0.34;
      const x0 = Math.round(col * cw),
        x1 = Math.round((col + 1) * cw) - 1;
      const y0 = Math.round(row * ch),
        y1 = Math.round((row + 1) * ch) - 1;
      for (let y = Math.max(y0, Math.floor(cy - ry)); y <= Math.min(y1, Math.ceil(cy + ry)); y++) {
        for (
          let x = Math.max(x0, Math.floor(cx - rx));
          x <= Math.min(x1, Math.ceil(cx + rx));
          x++
        ) {
          const dx = x - cx,
            dy = y - cy,
            r = Math.hypot(dx / rx, dy / ry);
          if (r >= 1) continue;
          const t = Math.max(0, Math.min(1, (r - 0.55) / 0.45));
          const weight = 1 - t * t * (3 - 2 * t),
            factor = 1 + (1 / 0.85 - 1) * weight;
          const sx = Math.max(x0, Math.min(x1, cx + dx * factor));
          const sy = Math.max(y0, Math.min(y1, cy + dy * factor));
          const ax = Math.floor(sx),
            ay = Math.floor(sy),
            bx = Math.min(x1, ax + 1),
            by = Math.min(y1, ay + 1);
          const fx = sx - ax,
            fy = sy - ay,
            d = (y * width + x) * 4;
          for (let k = 0; k < 4; k++)
            pixels[d + k] =
              source[(ay * width + ax) * 4 + k] * (1 - fx) * (1 - fy) +
              source[(ay * width + bx) * 4 + k] * fx * (1 - fy) +
              source[(by * width + ax) * 4 + k] * (1 - fx) * fy +
              source[(by * width + bx) * 4 + k] * fx * fy;
        }
      }
    }
}

/** Side-only action sheets cannot represent forward/backward locomotion. */
export function movementArtwork(
  facing: 'front' | 'back' | 'left' | 'right',
  moving: boolean,
  hasMotion: boolean,
): 'original' | 'motion' {
  return moving && !hasMotion && (facing === 'front' || facing === 'back') ? 'original' : 'motion';
}

/** Call acknowledgement and arrival must not fall through to side-only idle. */
export function frontCallArtwork(facing: string, state: string, motion?: string): boolean {
  return (
    facing === 'front' &&
    ((state === 'wait' && !motion) || (state === 'notice' && (!motion || motion === 'attend')))
  );
}

// Calibrated against the new side gait at equal scene depth. Front views were
// disproportionately reduced by legacy head-first normalization; do not apply
// this correction to portraits, side poses, or individual animation phases.
export function directionalBodyFactor(key: string, facing: string): number {
  if (key === 'mongsil') return facing === 'front' ? 1.12 : 1;
  if (key === 'minky') return facing === 'back' ? 0.94 : 1;
  return facing === 'front' ? 1.3 : facing === 'back' ? 1.08 : 1;
}

/** Mouth height within the visible standing/chewing artwork, below the nose.
 * Keep food outside the muzzle; each character has different head proportions. */
export const treatMouthHeight: Record<string, number> = {
  minky: 0.49,
  mongsil: 0.4,
};
