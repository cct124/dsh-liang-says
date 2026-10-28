import { clamp } from '../core/particle-motion.ts';

export interface ParticleClock {
  now: () => number;
  request: (callback: FrameRequestCallback) => number;
  cancel: (id: number) => void;
  deadline: (callback: () => void, ms: number) => () => void;
}
const browserClock: ParticleClock = {
  now: () => performance.now(),
  request: callback => requestAnimationFrame(callback),
  cancel: id => cancelAnimationFrame(id),
  deadline: (callback, ms) => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer); },
};

/** A missing browser frame must never leave the switch button permanently pending. */
export function animateParticles(duration: number, signal: AbortSignal, draw: (progress: number) => void,
  clock: ParticleClock = browserClock): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const start = clock.now();
    let frame = 0, settled = false;
    let clearDeadline = () => {};
    const cleanup = () => { clock.cancel(frame); clearDeadline(); signal.removeEventListener('abort', cancel); };
    const fail = (error: unknown) => { if (!settled) { settled = true; cleanup(); reject(error); } };
    const cancel = () => fail(signal.reason);
    const tick = (now: number) => {
      if (settled) return;
      const progress = clamp((now - start) / duration);
      try { draw(progress); } catch (error) { fail(error); return; }
      if (progress === 1) { settled = true; cleanup(); resolve(); }
      else frame = clock.request(tick);
    };
    signal.addEventListener('abort', cancel, { once: true });
    clearDeadline = clock.deadline(() => tick(start + duration), duration + 150);
    tick(start);
  });
}
