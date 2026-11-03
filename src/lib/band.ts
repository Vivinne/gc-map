import { BUILDINGS, ERA_ORDER, type Building } from './model';
import type { EraId } from './types';

/**
 * The period band: one solid block per style, its width proportional to the number of buildings
 * (with a minimum so small groups stay clickable). Inside a block, x is linear in start year over that
 * style's own year span. "Others" (non-buildings) sits at the end and is not part of the year scale.
 */
export interface Block {
  id: EraId;
  x: number;
  w: number;
  count: number;
  min: number;
  max: number;
}

export const GAP = 2;
const MIN_SHARE = 0.035;

/**
 * Year span of every block (fixed, so the band does not jump while filtering). Styles overlap in time and
 * a few entries carry late dates (a museum's opening year, a later facade), so a block is not its own
 * min-max: neighbouring blocks meet halfway between their median years. The band then reads as one
 * continuous, never-reversing year scale; a building dated outside its block's span sits at the block's edge.
 * "Others" (non-buildings) keeps its own span and is not part of the scale.
 */
const SPANS: Record<EraId, [number, number]> = (() => {
  const years = (e: EraId) => BUILDINGS.filter((b) => b.era === e && b.y0 != null).map((b) => b.y0 as number).sort((a, b) => a - b);
  const median = (ys: number[]) => (ys.length ? ys[Math.floor(ys.length / 2)]! : 0);
  const scale = ERA_ORDER.filter((e) => e !== 'others' && years(e).length);
  const out = {} as Record<EraId, [number, number]>;
  let start = Math.min(...years(scale[0]!));
  scale.forEach((e, i) => {
    const next = scale[i + 1];
    const end = next ? Math.max(start + 1, Math.round((median(years(e)) + median(years(next))) / 2)) : Math.max(...years(e));
    out[e] = [start, end];
    start = end;
  });
  for (const e of ERA_ORDER) {
    if (out[e]) continue;
    const ys = years(e);
    out[e] = ys.length ? [ys[0]!, ys[ys.length - 1]!] : [0, 0];
  }
  return out;
})();

export function blocks(width: number, list: Building[]): Block[] {
  const counts = ERA_ORDER.map((e) => list.filter((b) => b.eras.includes(e)).length);
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  const weights = counts.map((c) => Math.max(c / total, MIN_SHARE));
  const wsum = weights.reduce((a, b) => a + b, 0);
  const usable = width - GAP * (ERA_ORDER.length - 1);
  let x = 0;
  return ERA_ORDER.map((id, i) => {
    const w = (usable * (weights[i] ?? 0)) / wsum;
    const b = { id, x, w, count: counts[i] ?? 0, min: SPANS[id][0], max: SPANS[id][1] };
    x += w + GAP;
    return b;
  });
}

const PAD = 5;

/** x of a building's tick inside its own (primary) style block */
export function tickX(bl: Block[], b: Building): number | null {
  if (b.y0 == null) return null;
  const k = bl.find((x) => x.id === b.era);
  if (!k) return null;
  const t = k.max === k.min ? 0.5 : (b.y0 - k.min) / (k.max - k.min);
  return k.x + PAD + Math.min(1, Math.max(0, t)) * Math.max(0, k.w - 2 * PAD);
}

/** Blocks on the year scale (everything except Others), in order */
function scaleBlocks(bl: Block[]): Block[] {
  return bl.filter((k) => k.id !== 'others');
}

/** Year at an x position (clamped to the year scale) */
export function yearAt(bl: Block[], x: number): number {
  const s = scaleBlocks(bl);
  const first = s[0]!;
  const last = s[s.length - 1]!;
  if (x <= first.x) return first.min;
  if (x >= last.x + last.w) return last.max;
  for (const k of s) {
    if (x <= k.x + k.w + GAP) {
      const t = Math.min(1, Math.max(0, (x - k.x - PAD) / Math.max(1, k.w - 2 * PAD)));
      return Math.round(k.min + t * (k.max - k.min));
    }
  }
  return last.max;
}

/** x position of a year: the first block whose span reaches it */
export function xOfYear(bl: Block[], y: number): number {
  const s = scaleBlocks(bl);
  for (const k of s) {
    if (y <= k.max) {
      if (y <= k.min) return k.x;
      const t = (y - k.min) / Math.max(1, k.max - k.min);
      return k.x + PAD + t * Math.max(0, k.w - 2 * PAD);
    }
  }
  const last = s[s.length - 1]!;
  return last.x + last.w;
}

/** Right edge of the year scale */
export function scaleEnd(bl: Block[]): number {
  const s = scaleBlocks(bl);
  const last = s[s.length - 1]!;
  return last.x + last.w;
}
