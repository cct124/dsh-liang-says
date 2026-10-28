import { Simulation } from './simulation.ts';

export interface LiveState {
  sessionId: string | undefined;
  running: boolean;
  enabled: boolean;
  visible: boolean;
  waitingForUser: boolean;
}

/** Uses the host's running state for every preset; never alters the agent configuration. */
export class LiveQuotes {
  private sessionId: string | undefined;
  readonly simulation: Simulation;
  constructor(simulation: Simulation) { this.simulation = simulation; }
  sync(state: LiveState) {
    const changed = this.sessionId !== state.sessionId;
    this.sessionId = state.sessionId;
    if (changed) this.simulation.setPhase('idle');
    const visible = state.visible && !state.waitingForUser && state.sessionId !== undefined;
    const before = this.simulation.getSnapshot();
    if (visible !== before.visible) this.simulation.setVisible(visible);
    this.simulation.setEnabled(state.enabled);
    const phase = state.running && state.sessionId !== undefined ? 'thinking' : 'done';
    if (this.simulation.getSnapshot().phase !== phase) this.simulation.setPhase(phase);
    else if (visible && !before.visible && state.running && state.enabled) this.simulation.show();
  }
}
