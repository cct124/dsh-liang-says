export const MIN_QUOTE_MS = 10_000;
export const MAX_QUOTE_MS = 20_000;

/** A score-dependent baseline plus 0–4 seconds of fresh jitter per display. */
export function quoteDurationMs(classicScore: number, random = Math.random): number {
  if (!Number.isFinite(classicScore) || classicScore < 1 || classicScore > 100) {
    throw new Error('Classic score must be between 1 and 100.');
  }
  const draw = random();
  if (!Number.isFinite(draw) || draw < 0 || draw > 1) throw new Error('Invalid random draw.');
  const range = MAX_QUOTE_MS - MIN_QUOTE_MS;
  const milliseconds = MIN_QUOTE_MS + range * (.6 * (classicScore - 1) / 99 + .4 * draw);
  return Math.round(milliseconds / 1000) * 1000;
}
