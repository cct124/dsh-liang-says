export interface TextGust {
  travelMs: number;
  rippleMs: number;
  restMs: number;
  strength: number;
}

export function sampleTextGust(random = Math.random): TextGust {
  return { travelMs: 1300 + random() * 700, rippleMs: 2400 + random() * 900,
    restMs: 4000 + random() * 4500, strength: .7 + random() * .3 };
}

export interface RibbonShape { skew: number; balance: number; drift: number }
export interface TextRibbon extends RibbonShape {
  travelMs: number; rippleMs: number; startMs: number; strength: number;
}

/** Keep a common breeze, but give every rendered line its own gentle response. */
export function sampleTextRibbon(gust: TextGust, random = Math.random): TextRibbon {
  return { travelMs: gust.travelMs * (.9 + random() * .2),
    rippleMs: gust.rippleMs * (.88 + random() * .24), startMs: random() * 360,
    strength: gust.strength * (.85 + random() * .15), skew: (random() - .5) * .44,
    balance: (random() - .5) * .4, drift: .12 + random() * .06 };
}

/** Rebuild rows from actual layout each gust, including after wrapping and resizing. */
export function groupTextRows<T extends { left: number; right: number; top: number }>(items: readonly T[]) {
  const rows: { top: number; left: number; right: number; items: T[] }[] = [];
  for (const item of [...items].sort((a, b) => a.top - b.top || a.left - b.left)) {
    let row = rows.find(candidate => Math.abs(candidate.top - item.top) <= 2);
    if (!row) { row = { top: item.top, left: item.left, right: item.right, items: [] }; rows.push(row); }
    row.left = Math.min(row.left, item.left);
    row.right = Math.max(row.right, item.right);
    row.items.push(item);
  }
  for (const row of rows) row.items.sort((a, b) => a.left - b.left);
  return rows;
}

/** Every ribbon starts at its own left edge and preserves the shared wind direction. */
export function textGustDelay(x: number, width: number, ribbon: TextRibbon): number {
  return ribbon.startMs + Math.max(0, Math.min(1, x / Math.max(1, width))) * ribbon.travelMs;
}

/** Smoothly lift, settle and return to rest without changing glyph size or opacity. */
export function textWindOffset(progress: number, amplitude: number,
  shape: RibbonShape = { skew: 0, balance: 0, drift: .18 }) {
  if (progress <= 0 || progress >= 1) return { x: 0, y: 0 };
  // Time skew and unequal lift/settling lobes vary the path, not just the start time.
  const t = progress + shape.skew * Math.sin(Math.PI * progress) / Math.PI;
  const envelope = Math.sin(Math.PI * t) ** 2;
  const balance = (1 + shape.balance * Math.cos(Math.PI * t)) / (1 + Math.abs(shape.balance));
  return { x: amplitude * shape.drift * envelope * Math.sin(Math.PI * t),
    y: -amplitude * envelope * Math.sin(Math.PI * 2 * t) * balance };
}
