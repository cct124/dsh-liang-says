import { clamp, smooth } from './particle-motion.ts';

export interface PortraitRule {
  readonly id: string;
  readonly minScore: number;
  readonly maxScore: number | null;
  readonly image: string;
  /** Size and placement relative to the conversation panel, not the browser window. */
  readonly height: number;
  readonly top: number;
  readonly centerX: number;
}

/** Inclusive ranges. Add new images/ranges here and import the asset in portrait-assets.ts. */
export const PORTRAITS: readonly PortraitRule[] = [
  { id: 'liang-01', minScore: 0, maxScore: 89, image: 'liangwenfeng01.png', height: 1.12, top: .12, centerX: .5 },
  { id: 'liang-02', minScore: 90, maxScore: null, image: 'liangwenfeng02.png', height: 1.12, top: .11, centerX: .5 },
];

export function portraitForScore(score: number, rules = PORTRAITS): PortraitRule {
  if (!Number.isFinite(score) || score < 0) throw new Error('Invalid portrait score');
  const matches = rules.filter(rule => score >= rule.minScore && (rule.maxScore === null || score <= rule.maxScore));
  if (matches.length !== 1) throw new Error(`Portrait ranges must match score ${score} exactly once`);
  return matches[0]!;
}

export const PORTRAIT_TRANSITION_MS = 1000;

/** Two short bursts with a quiet handover; exact, clean endpoints also serve reduced motion. */
export function portraitTransition(progress: number, reduced = false) {
  const p = clamp(progress);
  if (reduced) return { outgoing: 1 - smooth(p), incoming: smooth(p), glitch: 0 };
  const burst = (start: number, end: number) => {
    const t = (p - start) / (end - start);
    return t <= 0 || t >= 1 ? 0 : Math.sin(Math.PI * t) ** 2;
  };
  return { outgoing: 1 - smooth((p - .16) / .4), incoming: smooth((p - .40) / .34),
    glitch: Math.max(burst(.02, .43), burst(.61, .94) * .65) };
}
