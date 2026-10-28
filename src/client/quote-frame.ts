import type { QuoteRequest } from '../core/simulation.ts';

export interface QuoteFrame extends QuoteRequest {
  rendered: Promise<void>;
  didRender: () => void;
}

/** Each transition waits for its own DOM commit, regardless of React scheduling. */
export function createQuoteFrame(request: QuoteRequest, signal: AbortSignal): QuoteFrame {
  let didRender = () => {};
  const rendered = new Promise<void>((resolve, reject) => {
    const cancel = () => { reject(signal.reason); };
    didRender = () => {
      signal.removeEventListener('abort', cancel);
      if (signal.aborted) reject(signal.reason); else resolve();
    };
    if (signal.aborted) cancel();
    else signal.addEventListener('abort', cancel, { once: true });
  });
  return { ...request, rendered, didRender };
}
