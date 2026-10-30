import type { ParticleClock } from './particle-clock.ts';

/** All visual effects advance before a single render, using the same browser timestamp. */
export class SceneClock implements ParticleClock {
  private callbacks = new Map<number, FrameRequestCallback>();
  private serial = 0;
  private frame = 0;
  private disposed = false;
  private continuous = true;
  private elapsed = 0;
  private previous: number | null = null;
  private readonly draw: (elapsed: number, now: number) => void;
  private readonly onError: (error: unknown) => void;
  constructor(draw: (elapsed: number, now: number) => void, onError: (error: unknown) => void) {
    this.draw = draw; this.onError = onError;
    document.addEventListener('visibilitychange', this.visibility);
  }
  now = () => performance.now();
  request = (callback: FrameRequestCallback) => {
    const id = ++this.serial;
    this.callbacks.set(id, callback); this.invalidate(); return id;
  };
  cancel = (id: number) => { this.callbacks.delete(id); };
  deadline = (callback: () => void, ms: number) => {
    const timer = setTimeout(() => { callback(); this.invalidate(); }, ms);
    return () => clearTimeout(timer);
  };
  setContinuous(value: boolean) { this.continuous = value; this.invalidate(); }
  invalidate() {
    if (!this.frame && !this.disposed && !document.hidden) this.frame = requestAnimationFrame(this.tick);
  }
  private visibility = () => {
    cancelAnimationFrame(this.frame); this.frame = 0; this.previous = null; this.invalidate();
  };
  private tick = (now: number) => {
    this.frame = 0;
    if (this.disposed) return;
    if (this.previous !== null) this.elapsed += Math.min(100, Math.max(0, now - this.previous));
    this.previous = now;
    const callbacks = [...this.callbacks.values()]; this.callbacks.clear();
    try {
      for (const callback of callbacks) callback(now);
      this.draw(this.elapsed, now);
    } catch (error) { this.onError(error); return; }
    if (this.continuous || this.callbacks.size) this.invalidate();
  };
  destroy() {
    this.disposed = true; cancelAnimationFrame(this.frame); this.callbacks.clear();
    document.removeEventListener('visibilitychange', this.visibility);
  }
}
