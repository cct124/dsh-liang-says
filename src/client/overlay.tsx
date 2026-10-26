import * as React from 'react';
import portrait from '../../asset/images/liangwenfeng01.png';
import { splitQuote, type Quote } from '../core/quote-picker.ts';
import type { QuoteRequest } from '../core/simulation.ts';

function nextPaint(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cancel = () => { cancelAnimationFrame(frame); reject(signal.reason); };
    const frame = requestAnimationFrame(() => {
      signal.removeEventListener('abort', cancel);
      if (signal.aborted) reject(signal.reason); else resolve();
    });
    signal.addEventListener('abort', cancel, { once: true });
  });
}

async function play(element: Element, frames: Keyframe[], options: KeyframeAnimationOptions,
  signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw signal.reason;
  const animation = element.animate(frames, { fill: 'forwards', ...options });
  const cancel = () => { animation.cancel(); };
  signal.addEventListener('abort', cancel, { once: true });
  try { await animation.finished; animation.commitStyles(); animation.cancel(); }
  finally { signal.removeEventListener('abort', cancel); }
  if (signal.aborted) throw signal.reason;
}

async function gather(words: HTMLElement[], stage: HTMLElement, signal: AbortSignal) {
  const bounds = stage.getBoundingClientRect();
  const centerX = bounds.left + bounds.width / 2;
  const centerY = bounds.top + bounds.height / 2;
  const cloudWidth = Math.min(bounds.width * .72, 900);
  const cloudHeight = Math.min(bounds.height * .32, 320);
  const columns = Math.max(1, Math.round(Math.sqrt(words.length * cloudWidth / cloudHeight)));
  const rows = Math.max(1, Math.ceil(words.length / columns));
  const cells = Array.from({ length: columns * rows }, (_, index) => index);
  // Jittered cells spread fragments across the full rectangle, including its corners.
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cells[i], cells[j]] = [cells[j]!, cells[i]!];
  }
  // Read natural paragraph positions before applying any transforms.
  const targets = words.map(element => ({ element, rect: element.getBoundingClientRect() }));
  for (let i = targets.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [targets[i], targets[j]] = [targets[j]!, targets[i]!];
  }
  await Promise.all(targets.map(({ element, rect }, order) => {
    const cell = cells[order]!;
    const point = () => ({
      x: ((cell % columns + .15 + Math.random() * .7) / columns - .5) * cloudWidth,
      y: ((Math.floor(cell / columns) + .15 + Math.random() * .7) / rows - .5) * cloudHeight,
    });
    const start = point(), spread = point(), drift = point();
    const rotation = (Math.random() - .5) * 90;
    const originX = centerX - rect.left - rect.width / 2;
    const originY = centerY - rect.top - rect.height / 2;
    const position = (x: number, y: number, turn: number, scale: number) =>
      `translate(${originX + x}px, ${originY + y}px) rotate(${turn}deg) scale(${scale})`;
    return play(element, [
      { offset: 0, opacity: 0, transform: position(start.x, start.y, rotation, .72), easing: 'ease-out' },
      { offset: .18, opacity: .85, transform: position(spread.x, spread.y, rotation * .7, .92), easing: 'ease-in-out' },
      { offset: .48, opacity: 1, transform: position(drift.x, drift.y, rotation * .35, 1), easing: 'cubic-bezier(.65,0,.2,1)' },
      { offset: 1, opacity: 1, transform: 'translate(0, 0) rotate(0deg) scale(1)' },
    ], { duration: 2600 + Math.random() * 450, delay: order / Math.max(1, targets.length - 1) * 350 }, signal);
  }));
}

export interface OverlayProps {
  request: QuoteRequest | null;
  commit: (ticket: number) => boolean;
  onEntered: (ticket: number) => void;
  dismiss: () => void;
  reducedMotion: boolean;
  closeLabel: string;
  onError: (message: string) => void;
}

/** Presentation shared by the development simulator and the future live adapter. */
export function QuoteOverlay({ request, commit, onEntered, dismiss, reducedMotion, closeLabel, onError }: OverlayProps) {
  const root = React.useRef<HTMLDivElement>(null);
  const content = React.useRef<HTMLDivElement>(null);
  const [frame, setFrame] = React.useState<QuoteRequest | null>(null);
  const quote = frame?.quote;
  const displayed = React.useRef<Quote | null>(null);
  const [mounted, setMounted] = React.useState(false);
  const reducedMotionRef = React.useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;

  React.useEffect(() => {
    const abort = new AbortController();
    const { signal } = abort;
    // Motion preferences affect the next transition without replaying the current quote.
    const reducedMotion = reducedMotionRef.current;
    async function transition() {
      if (!request) {
        if (root.current && displayed.current) {
          await play(root.current, [{ opacity: 1 }, { opacity: 0 }], { duration: reducedMotion ? 100 : 260 }, signal);
        }
        if (!signal.aborted) { displayed.current = null; setFrame(null); setMounted(false); }
        return;
      }
      const replacing = displayed.current !== null;
      if (replacing && content.current) {
        const elements = Array.from(content.current.querySelectorAll<HTMLElement>('[data-fragment]'));
        const bounds = content.current.getBoundingClientRect();
        await Promise.all(elements.map((element, index) => {
          const rect = element.getBoundingClientRect();
          const dx = rect.left + rect.width / 2 - bounds.left - bounds.width / 2;
          const dy = rect.top + rect.height / 2 - bounds.top - bounds.height / 2;
          const angle = Math.atan2(dy || (index % 2 ? 1 : -1), dx || 1);
          const distance = 70 + (index * 37) % 130;
          return play(element, [{ opacity: 1, transform: 'translate(0, 0) rotate(0deg)' },
            { opacity: 0, transform: reducedMotion ? 'none' :
              `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance}px) rotate(${(index % 7 - 3) * 7}deg)` }],
          { duration: reducedMotion ? 130 : 650, delay: reducedMotion ? 0 : (index % 5) * 20, easing: 'cubic-bezier(.3,0,.8,.4)' }, signal);
        }));
      }
      if (signal.aborted) return;
      setMounted(true); setFrame(request);
      await nextPaint(signal); await nextPaint(signal);
      if (!root.current || !content.current) return;
      if (!replacing) await play(root.current, [{ opacity: 0 }, { opacity: 1 }],
        { duration: reducedMotion ? 120 : 600, easing: 'ease-out' }, signal);
      else root.current.style.opacity = '1';
      if (!commit(request.ticket)) return;
      displayed.current = request.quote;
      const words = Array.from(content.current.querySelectorAll<HTMLElement>('.lx-fragment'));
      if (reducedMotion) await Promise.all(words.map(element => play(element,
        [{ opacity: 0 }, { opacity: 1 }], { duration: 150 }, signal)));
      else await gather(words, root.current, signal);
      const signature = content.current.querySelector('.lx-signature');
      if (signature) await play(signature, [
        { opacity: 0, transform: reducedMotion ? 'none' : 'translateY(18px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ], { duration: reducedMotion ? 120 : 600, easing: 'cubic-bezier(.16,1,.3,1)' }, signal);
      if (!signal.aborted) onEntered(request.ticket);
    }
    void transition().catch(error => {
      if (!signal.aborted) { onError(error instanceof Error ? error.message : String(error)); dismiss(); }
    });
    return () => { abort.abort(); };
  }, [request, commit, onEntered, dismiss, onError]);

  React.useEffect(() => {
    if (!request) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('keydown', onKey, true); };
  }, [request, dismiss]);

  if (!mounted || !quote) return null;
  return <div ref={root} className={'lx-overlay' + (reducedMotion ? ' lx-reduced' : '')}
    onClick={event => { event.stopPropagation(); dismiss(); }} role="region" aria-label="梁选文案">
    <div className="lx-shade" />
    <div className="lx-art" aria-hidden="true">
      <div className="lx-aureole" /><div className="lx-rays" /><div className="lx-rays lx-rays-soft" />
      <div className="lx-halo" /><img className="lx-portrait" src={portrait} alt="" draggable={false} />
    </div>
    <div className="lx-edition" aria-hidden="true"><span />梁 选<span /></div>
    <div ref={content} className={'lx-quote' + (quote.text.length > 80 ? ' lx-quote-long' : '')} key={frame!.ticket}>
      <div className="lx-passage">
        <p className="lx-words" aria-label={quote.text}>
          {splitQuote(quote.text).map((text, index) => <span className="lx-fragment" data-fragment key={index} aria-hidden="true">{text}</span>)}
        </p>
        <p className="lx-signature" data-fragment>—— 梁文峰</p>
      </div>
    </div>
    <button type="button" className="lx-dismiss" onClick={event => { event.stopPropagation(); dismiss(); }}>{closeLabel} <kbd>Esc</kbd></button>
  </div>;
}
