import * as React from 'react';
import entranceRiser from '../../asset/sfx/06-cinematic-riser-full.mp3';
import { splitQuote, type Quote } from '../core/quote-picker.ts';
import { quotePresentation } from '../core/quote-presentation.ts';
import type { QuoteRequest } from '../core/simulation.ts';
import { createQuoteFrame, type QuoteFrame } from './quote-frame.ts';
import { animateText } from './text-particles.ts';
import { playEntranceSound } from './entrance-audio.ts';
import { startTextWind, type TextWind } from './text-wind.ts';
import { portraitForScore } from '../core/portraits.ts';
import { PORTRAIT_ASSETS } from './portrait-assets.ts';
import { LiangScene, type PreparedText } from './scene.ts';

const glyphSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const windGlyphs = (text: string) => Array.from(glyphSegmenter.segment(text), ({ segment, index }) =>
  /^\s+$/u.test(segment) ? segment : <span className="lx-glyph" aria-hidden="true" key={index}>{segment}</span>);

function QuoteContent({ frame, contentRef, preparing = false }: {
  frame: QuoteFrame; contentRef: React.RefObject<HTMLDivElement>; preparing?: boolean;
}) {
  const quote = frame.quote, presentation = quotePresentation(quote.id);
  React.useLayoutEffect(() => {
    const paragraph = contentRef.current!.querySelector<HTMLElement>('.lx-words')!;
    const signature = contentRef.current!.querySelector<HTMLElement>('.lx-signature')!;
    const fragments = Array.from(paragraph.querySelectorAll<HTMLElement>('.lx-fragment'));
    const alignSignature = () => {
      const right = Math.max(...fragments.map(fragment => fragment.offsetLeft + fragment.offsetWidth));
      const margin = `${Math.max(0, paragraph.clientWidth - right)}px`;
      if (signature.style.marginRight !== margin) signature.style.marginRight = margin;
    };
    alignSignature();
    const observer = new ResizeObserver(alignSignature);
    observer.observe(paragraph); frame.didRender();
    return () => { observer.disconnect(); };
  }, [frame, contentRef]);
  return <div ref={contentRef} className={'lx-quote' + (quote.text.length > 80 ? ' lx-quote-long' : '')}
    style={preparing ? { visibility: 'hidden' } : undefined} aria-hidden={preparing || undefined}>
    <div className="lx-passage">
      <p className="lx-words" aria-label={quote.text}>
        {splitQuote(quote.text).map((text, index) => <span className="lx-fragment" data-fragment key={index} aria-hidden="true">{windGlyphs(text)}</span>)}
      </p>
      <p className="lx-signature" data-fragment aria-label={presentation.signature}>{windGlyphs(presentation.signature)}</p>
    </div>
  </div>;
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

export interface OverlayProps {
  request: QuoteRequest | null;
  commit: (ticket: number) => boolean;
  onEntered: (ticket: number) => void;
  dismiss: () => void;
  reducedMotion: boolean;
  closeLabel: string;
  onError: (message: string) => void;
}

/** Presentation shared by the development simulator and live session adapter. */
export function QuoteOverlay({ request, commit, onEntered, dismiss, reducedMotion, closeLabel, onError }: OverlayProps) {
  const root = React.useRef<HTMLDivElement>(null);
  const entranceAudio = React.useRef<HTMLAudioElement>(null);
  const textLayer = React.useRef<HTMLDivElement>(null);
  const content = React.useRef<HTMLDivElement>(null);
  const preparingContent = React.useRef<HTMLDivElement>(null);
  const canvas = React.useRef<HTMLCanvasElement>(null);
  const scene = React.useRef<LiangScene | null>(null);
  const rendererFailed = React.useRef(false);
  const [gpu, setGpu] = React.useState(false);
  const wind = React.useRef<TextWind | null>(null);
  const [frame, setFrame] = React.useState<QuoteFrame | null>(null);
  const [preparingFrame, setPreparingFrame] = React.useState<QuoteFrame | null>(null);
  const quote = frame?.quote;
  const displayed = React.useRef<Quote | null>(null);
  const reducedMotionRef = React.useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;
  React.useLayoutEffect(() => {
    wind.current?.setReduced(reducedMotion); scene.current?.setReduced(reducedMotion);
  }, [reducedMotion]);
  React.useEffect(() => () => { scene.current?.destroy(); scene.current = null; }, []);

  React.useEffect(() => {
    const abort = new AbortController();
    const { signal } = abort;
    let prepared: PreparedText | undefined;
    let staging: QuoteFrame | undefined;
    // Motion preferences affect the next transition without replaying the current quote.
    const reducedMotion = reducedMotionRef.current;
    async function leaveText() {
      if (scene.current) { await scene.current.leave(signal); return; }
      if (!textLayer.current || !content.current) return;
      wind.current?.freeze();
      wind.current = null;
      const elements = Array.from(content.current.querySelectorAll<HTMLElement>('[data-fragment]'));
      if (reducedMotion) await Promise.all(elements.map(element => play(element,
        [{ opacity: getComputedStyle(element).opacity }, { opacity: 0 }], { duration: 130 }, signal)));
      else await animateText(elements, textLayer.current, 'disperse', signal);
    }
    async function transition() {
      if (!request) {
        if (root.current && displayed.current) {
          await leaveText();
          if (scene.current) await scene.current.fade(0, reducedMotion ? 100 : 260, signal);
          else await play(root.current, [{ opacity: 1 }, { opacity: 0 }], { duration: reducedMotion ? 100 : 260 }, signal);
        }
        if (!signal.aborted) {
          scene.current?.destroy(); scene.current = null; setGpu(false);
          displayed.current = null; setFrame(null);
        }
        return;
      }
      const replacing = displayed.current !== null;
      if (replacing && scene.current) {
        // Prepare the incoming layout while the old text is still dispersing.
        // The hidden DOM uses the same wrapping/signature layout as the live text.
        const renderer = scene.current;
        staging = createQuoteFrame(request, signal);
        setPreparingFrame(staging);
        const prepare = async () => {
          await staging!.rendered; signal.throwIfAborted();
          if (!preparingContent.current) throw new Error('Preparation frame was removed');
          return renderer.prepareText(preparingContent.current, signal);
        };
        const [leaving, preparation] = await Promise.allSettled([leaveText(), prepare()]);
        if (preparation.status === 'fulfilled') prepared = preparation.value;
        if (leaving.status === 'rejected') throw leaving.reason;
        if (preparation.status === 'rejected') throw preparation.reason;
      } else if (replacing) await leaveText();
      if (signal.aborted) return;
      const nextFrame = createQuoteFrame(request, signal);
      setFrame(nextFrame);
      await nextFrame.rendered;
      signal.throwIfAborted();
      if (!root.current || !textLayer.current || !content.current) throw new Error('Quote frame was removed before entrance');
      if (!scene.current && !rendererFailed.current && canvas.current) {
        try {
          scene.current = await LiangScene.create(root.current, canvas.current, reducedMotion, signal, error => {
            console.warn('Liang renderer fallback:', error);
            rendererFailed.current = true; scene.current?.destroy(); scene.current = null;
            setGpu(false); dismiss();
          });
          setGpu(true);
        } catch (error) {
          if (signal.aborted) throw error;
          console.warn('Liang WebGL unavailable; using basic animation:', error);
          rendererFailed.current = true;
        }
      }
      if (scene.current) {
        scene.current.setReduced(reducedMotionRef.current);
        await scene.current.layoutText(content.current, signal, prepared);
        prepared = undefined;
        if (!replacing) await scene.current.switchPortrait(request.quote.classicScore, signal);
      }
      setPreparingFrame(current => current === staging ? null : current);
      if (!replacing && scene.current) await scene.current.fade(1, reducedMotion ? 120 : 600, signal);
      else if (!replacing) await play(root.current, [{ opacity: 0 }, { opacity: 1 }],
        { duration: reducedMotion ? 120 : 600, easing: 'ease-out' }, signal);
      else root.current.style.opacity = '1';
      if (!commit(request.ticket)) return;
      displayed.current = request.quote;
      const audio = entranceAudio.current;
      if (audio) await playEntranceSound(audio, signal);
      signal.throwIfAborted();
      const elements = Array.from(content.current.querySelectorAll<HTMLElement>('[data-fragment]'));
      if (scene.current) await Promise.all([
        scene.current.switchPortrait(request.quote.classicScore, signal), scene.current.enter(signal),
      ]);
      else if (reducedMotion) await Promise.all(elements.map(element => play(element,
        [{ opacity: 0 }, { opacity: 1 }], { duration: 150 }, signal)));
      else await animateText(elements, textLayer.current, 'gather', signal);
      if (!signal.aborted) {
        if (!scene.current) wind.current = startTextWind(content.current, reducedMotionRef.current);
        onEntered(request.ticket);
      }
    }
    void transition().catch(error => {
      if (!signal.aborted) { onError(error instanceof Error ? error.message : String(error)); dismiss(); }
    }).finally(() => {
      if (prepared) void prepared.text.dispose();
      setPreparingFrame(current => current === staging ? null : current);
    });
    return () => { wind.current?.freeze(); wind.current = null; abort.abort(); };
  }, [request, commit, onEntered, dismiss, onError]);

  React.useEffect(() => {
    if (!request) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
      // Editing and host popovers keep their own keyboard behavior above the artwork.
      if (event.target instanceof Element && event.target.closest(
        '[data-composer-seat], [contenteditable="true"], input, textarea, select, [role="menu"], [role="listbox"], [role="dialog"]',
      )) return;
      event.preventDefault(); dismiss();
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); };
  }, [request, dismiss]);

  if (!quote) return null;
  const portraitRule = portraitForScore(quote.classicScore);
  const portrait = PORTRAIT_ASSETS[portraitRule.image]!;
  return <div ref={root} className={'lx-overlay' + (reducedMotion ? ' lx-reduced' : '') + (gpu ? ' lx-gpu' : '')}
    onClick={event => { event.stopPropagation(); dismiss(); }} role="region" aria-label="梁选文案">
    <audio ref={entranceAudio} src={entranceRiser} preload="auto" hidden />
    <div className="lx-shade" />
    <canvas ref={canvas} className="lx-scene" aria-hidden="true" />
    <div className="lx-art" aria-hidden="true" style={{ '--lx-portrait-height': `${portraitRule.height * 100}cqh`,
      '--lx-portrait-top': `${portraitRule.top * 100}cqh` } as React.CSSProperties}>
      <div className="lx-light" style={{ '--lx-portrait-mask': `url("${portrait}")` } as React.CSSProperties}>
        <div className="lx-aureole" /><div className="lx-rays" /><div className="lx-rays lx-rays-soft" />
        <div className="lx-halo" />
      </div>
      <img className="lx-portrait" src={portrait} alt="" draggable={false} />
    </div>
    <div className="lx-edition" aria-hidden="true">
      <span className="lx-edition-line" />
      <span className="lx-edition-label">
        <span>梁</span>
        <svg className="lx-edition-book" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" focusable="false">
          <path d="M12 6C9 4.2 5.5 4 2.5 5v14c3-1 6.5-.8 9.5 1 3-1.8 6.5-2 9.5-1V5c-3-1-6.5-.8-9.5 1Z" />
          <path d="M12 6v14M5.5 8.5c1.4-.2 2.6.1 3.5.6M15 9.1c.9-.5 2.1-.8 3.5-.6" />
        </svg>
        <span>选</span>
      </span>
      <span className="lx-edition-line" />
    </div>
    <div ref={textLayer} className="lx-text-layer">
      <QuoteContent frame={frame!} contentRef={content} key={frame!.ticket} />
      {preparingFrame && <QuoteContent frame={preparingFrame} contentRef={preparingContent} preparing key={'preparing-' + preparingFrame.ticket} />}
    </div>
    <button type="button" className="lx-dismiss" onClick={event => { event.stopPropagation(); dismiss(); }}>{closeLabel} <kbd>Esc</kbd></button>
  </div>;
}
