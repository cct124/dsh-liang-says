import * as React from 'react';

const SURFACE = '[data-slot="main.conversation"] > [data-phase]';

/** Follow the resident main panel without moving or remounting the host's editor. */
export function useConversationSurface(active: boolean): Element | null {
  const [surface, setSurface] = React.useState<Element | null>(null);
  React.useLayoutEffect(() => {
    if (!active) { setSurface(null); return; }
    const observer = new MutationObserver(update);
    function update() {
      const next = document.querySelector(SURFACE);
      setSurface(previous => previous === next ? previous : next);
      observer.disconnect();
      // Once mounted, only watch replacement of the panel, not streaming text or typing.
      observer.observe(next?.parentElement ?? document.body, { childList: true, subtree: !next });
    }
    update();
    return () => observer.disconnect();
  }, [active]);
  return active && surface?.isConnected ? surface : null;
}

/** Keep the dismiss hint above the growing composer without inspecting its draft. */
export function useComposerHeight(surface: Element | null, sessionId: string | undefined): number {
  const [height, setHeight] = React.useState(0);
  React.useLayoutEffect(() => {
    const seat = surface?.querySelector('[data-composer-seat]');
    if (!seat) { setHeight(0); return; }
    const update = () => setHeight(Math.ceil(seat.getBoundingClientRect().height));
    const observer = new ResizeObserver(update);
    observer.observe(seat);
    update();
    return () => observer.disconnect();
  }, [surface, sessionId]);
  return height;
}
