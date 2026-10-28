import { groupTextRows, sampleTextGust, sampleTextRibbon, textGustDelay, textWindOffset } from '../core/text-wind.ts';

export interface TextWind {
  setReduced(value: boolean): void;
  freeze(): void;
}

/** Native glyph animations share one gust; only the quiet gaps need a JS timer. */
export function startTextWind(content: HTMLElement, reduced: boolean): TextWind {
  const glyphs = Array.from(content.querySelectorAll<HTMLElement>('.lx-glyph'));
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const animations: Animation[] = [];
  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
    for (const animation of animations) animation.cancel();
    animations.length = 0;
  };
  const rest = (delay: number) => {
    content.dataset.wind = reduced ? 'off' : 'rest';
    if (!stopped && !reduced && !document.hidden && glyphs.length) timer = setTimeout(blow, delay);
  };
  const reset = () => {
    cancel();
    for (const glyph of glyphs) glyph.style.transform = '';
    rest(1200 + Math.random() * 1400);
  };
  function blow() {
    timer = undefined;
    if (stopped || reduced || document.hidden) return;
    const gust = sampleTextGust();
    // Read layout once per gust; transforms never reflow or change the line wrapping.
    const positions = glyphs.map(glyph => {
      const { left, right, top } = glyph.getBoundingClientRect();
      return { glyph, left, right, top, size: parseFloat(getComputedStyle(glyph).fontSize) };
    });
    let lastEnd = 0;
    for (const row of groupTextRows(positions)) {
      const ribbon = sampleTextRibbon(gust);
      for (const { glyph, left, size } of row.items) {
        const delay = textGustDelay(left - row.left, row.right - row.left, ribbon);
        const amplitude = Math.min(5, Math.max(2.5, size * .13)) * ribbon.strength;
        const frames = Array.from({ length: 41 }, (_, index) => {
          const offset = index / 40;
          const { x, y } = textWindOffset(offset, amplitude, ribbon);
          return { offset, transform: `translate(${x}px, ${y}px)` };
        });
        animations.push(glyph.animate(frames, { duration: ribbon.rippleMs, delay, easing: 'linear' }));
        lastEnd = Math.max(lastEnd, delay + ribbon.rippleMs);
      }
    }
    content.dataset.wind = 'gust';
    timer = setTimeout(() => { cancel(); rest(gust.restMs); }, lastEnd);
  }
  const observer = new ResizeObserver(reset);
  observer.observe(content);
  document.addEventListener('visibilitychange', reset);
  rest(1200 + Math.random() * 1400);
  return {
    setReduced(value) {
      if (stopped || value === reduced) return;
      reduced = value;
      reset();
    },
    freeze() {
      if (stopped) return;
      stopped = true;
      // Preserve the actual in-flight glyph positions for the particle rasterizer.
      const transforms = glyphs.map(glyph => getComputedStyle(glyph).transform);
      cancel();
      glyphs.forEach((glyph, index) => { glyph.style.transform = transforms[index]!; });
      content.dataset.wind = 'frozen';
      observer.disconnect();
      document.removeEventListener('visibilitychange', reset);
    },
  };
}
