import { QuotePicker, type Quote } from './quote-picker.ts';
import { MIN_QUOTE_MS, quoteDurationMs } from './quote-timing.ts';

export type Phase = 'idle' | 'thinking' | 'tool' | 'answer' | 'done';
export const isTaskRunning = (phase: Phase): boolean => phase === 'thinking' || phase === 'tool' || phase === 'answer';
export interface QuoteRequest { readonly ticket: number; readonly quote: Quote; readonly durationMs: number }
export interface SimulationState {
  readonly phase: Phase;
  readonly enabled: boolean;
  readonly visible: boolean;
  readonly durationMs: number;
  readonly speed: number;
  readonly elapsedMs: number;
  readonly request: QuoteRequest | null;
  readonly pending: boolean;
  readonly shown: number;
}

const initialState = (): SimulationState => ({
  phase: 'idle', enabled: true, visible: true, durationMs: MIN_QUOTE_MS,
  speed: 1, elapsedMs: 0, request: null, pending: false, shown: 0,
});

/** Pure clock-driven simulator. It never reads or writes a DSH session. */
export class Simulation {
  private state = initialState();
  private serial = 0;
  private committedTicket = -1;
  private readonly listeners = new Set<() => void>();
  readonly picker: QuotePicker;
  private readonly durationRandom: () => number;
  private readonly canShow: () => boolean;
  constructor(picker: QuotePicker, durationRandom = Math.random, canShow = () => true) {
    this.picker = picker;
    this.durationRandom = durationRandom;
    this.canShow = canShow;
  }
  getSnapshot = (): SimulationState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private update(patch: Partial<SimulationState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  setPhase(phase: Phase): void {
    const starting = !isTaskRunning(this.state.phase) && isTaskRunning(phase);
    this.update({ phase, ...(!isTaskRunning(phase) ? { request: null, pending: false, elapsedMs: 0 } : {}) });
    if (starting && !this.state.request) this.show();
  }
  setEnabled(enabled: boolean): void {
    if (enabled === this.state.enabled) return;
    this.update({ enabled, request: null, pending: false, elapsedMs: 0 });
    if (enabled && isTaskRunning(this.state.phase)) this.show();
  }
  setVisible(visible: boolean): void {
    this.update({ visible, ...(!visible ? { request: null, pending: false } : {}) });
  }
  setSpeed(speed: number): void {
    if (!Number.isFinite(speed) || speed <= 0 || speed > 20) throw new Error('Invalid simulation speed.');
    this.update({ speed });
  }
  advance(realMilliseconds: number): void {
    const state = this.state;
    if (realMilliseconds <= 0 || !Number.isFinite(realMilliseconds) || !state.visible
      || !state.enabled || !isTaskRunning(state.phase) || state.pending) return;
    const elapsedMs = Math.min(state.durationMs, state.elapsedMs + realMilliseconds * state.speed);
    this.update({ elapsedMs });
    if (elapsedMs >= state.durationMs) this.show();
  }
  show(forcedId?: string): boolean {
    if (!this.state.enabled || !this.state.visible || this.state.pending || !this.canShow()) return false;
    const quote = this.picker.choose(forcedId);
    const durationMs = quoteDurationMs(quote.classicScore, this.durationRandom);
    this.update({ request: { ticket: ++this.serial, quote, durationMs }, durationMs, elapsedMs: 0, pending: true });
    return true;
  }
  /** Called once when the overlay actually begins displaying this quote. */
  commit(ticket: number): boolean {
    if (this.state.request?.ticket !== ticket || this.committedTicket === ticket) return false;
    // Recheck after the async entrance, immediately before counting a quote or playing audio.
    if (!this.canShow()) { this.dismiss(); return false; }
    this.picker.recordShown(this.state.request.quote.id);
    this.committedTicket = ticket;
    this.update({ shown: this.state.shown + 1 });
    return true;
  }
  /** Start the holding time only after the paragraph and signature are readable. */
  completeEntrance(ticket: number): boolean {
    if (this.state.request?.ticket !== ticket || this.committedTicket !== ticket || !this.state.pending) return false;
    this.update({ pending: false, elapsedMs: 0 });
    return true;
  }
  dismiss(): void { this.update({ request: null, pending: false, elapsedMs: 0 }); }
  reset(): void { this.picker.reset(); this.state = initialState(); this.update({}); }
}
