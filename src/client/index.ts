/** Client-only quote overlay for all agent presets. */
import { installLiang } from './live.tsx';
import type { DshClientContext } from './dsh-contract.ts';
export { QuoteOverlay } from './overlay.tsx';
export { QuotePicker } from '../core/quote-picker.ts';
export { quoteDurationMs } from '../core/quote-timing.ts';
export { default as artworkCss } from './artwork.css';
export const inject = ['slots', 'locale'];
export function apply(ctx: DshClientContext): void { installLiang(ctx); }
