import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LiangPreference } from '../src/core/preference.ts';
import { LiveQuotes, type LiveState } from '../src/core/live-quotes.ts';
import { QuotePicker } from '../src/core/quote-picker.ts';
import { Simulation } from '../src/core/simulation.ts';

test('first install is enabled; a disabled preference survives reload and syncs across tabs', () => {
  const saved = new Map<string, string>();
  const storage = { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => { saved.set(key, value); } };
  const first = new LiangPreference(storage);
  assert.equal(first.getSnapshot(), true);
  first.setEnabled(false);
  const reloaded = new LiangPreference(storage);
  assert.equal(reloaded.getSnapshot(), false);
  let notifications = 0;
  const unsubscribe = reloaded.subscribe(() => notifications++);
  reloaded.receiveStorage('unrelated', 'true');
  assert.equal(reloaded.getSnapshot(), false);
  reloaded.receiveStorage('dsh-liang-says.enabled', 'true');
  assert.equal(reloaded.getSnapshot(), true);
  assert.equal(notifications, 1);
  unsubscribe();
  reloaded.receiveStorage('dsh-liang-says.enabled', 'false');
  assert.equal(notifications, 1);
});

test('denied browser storage keeps a working in-memory switch', () => {
  const preference = new LiangPreference({ getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); } });
  assert.equal(preference.getSnapshot(), true);
  preference.setEnabled(false);
  assert.equal(preference.getSnapshot(), false);
});

const setup = () => {
  const simulation = new Simulation(new QuotePicker([{ id: 'a', text: '测试文案', classicScore: 80 }]));
  return { simulation, live: new LiveQuotes(simulation), state: {
    sessionId: 'session-a', running: true, enabled: true, visible: true, waitingForUser: false, userTyping: false,
  } satisfies LiveState };
};

test('live running state opens quotes independently of preset; off cancels entrance and on resumes', () => {
  const { live, simulation, state } = setup();
  live.sync({ ...state, running: false });
  assert.equal(simulation.getSnapshot().request, null);
  live.sync(state);
  const ticket = simulation.getSnapshot().request!.ticket;
  live.sync({ ...state, enabled: false });
  assert.equal(simulation.getSnapshot().request, null);
  assert.equal(simulation.commit(ticket), false);
  simulation.advance(60_000);
  assert.equal(simulation.getSnapshot().request, null);
  live.sync(state);
  assert.ok(simulation.getSnapshot().request!.ticket > ticket);
  live.sync({ ...state, running: false });
  assert.equal(simulation.getSnapshot().request, null);
});

test('navigation and user interactions hide quotes, then restore only a running foreground session', () => {
  const { live, simulation, state } = setup();
  live.sync(state);
  for (const hidden of [{ visible: false }, { waitingForUser: true }, { userTyping: true }]) {
    live.sync({ ...state, ...hidden });
    assert.equal(simulation.getSnapshot().request, null);
    simulation.advance(60_000);
    assert.equal(simulation.getSnapshot().request, null);
    live.sync(state);
    assert.ok(simulation.getSnapshot().request);
  }
  const previous = simulation.getSnapshot().request!.ticket;
  live.sync({ ...state, sessionId: 'session-b', running: false });
  assert.equal(simulation.getSnapshot().request, null);
  assert.equal(simulation.commit(previous), false);
  live.sync({ ...state, sessionId: undefined });
  assert.equal(simulation.getSnapshot().request, null);
});

test('typing blocks initial display and recurrence without consuming quotes; blur resumes only a running task', () => {
  const { live, simulation, state } = setup();
  live.sync({ ...state, userTyping: true });
  simulation.advance(120_000);
  assert.equal(simulation.getSnapshot().request, null);
  assert.equal(simulation.getSnapshot().shown, 0);
  live.sync(state);
  const ticket = simulation.getSnapshot().request!.ticket;
  live.sync({ ...state, userTyping: true });
  assert.equal(simulation.commit(ticket), false);
  live.sync({ ...state, userTyping: true, running: false });
  live.sync({ ...state, running: false });
  assert.equal(simulation.getSnapshot().request, null);
});

test('the last-moment guard prevents a quote and sound from starting while async entrance is pending', () => {
  let typing = true;
  const simulation = new Simulation(new QuotePicker([{ id: 'a', text: '测试', classicScore: 80 }]), () => 0, () => !typing);
  simulation.setPhase('thinking');
  assert.equal(simulation.getSnapshot().request, null);
  typing = false;
  simulation.show();
  const ticket = simulation.getSnapshot().request!.ticket;
  typing = true;
  assert.equal(simulation.commit(ticket), false);
  assert.equal(simulation.getSnapshot().shown, 0);
  assert.equal(simulation.getSnapshot().pending, false);
  simulation.advance(120_000);
  assert.equal(simulation.getSnapshot().request, null);
  typing = false;
  simulation.advance(100);
  assert.ok(simulation.getSnapshot().request);
});

test('status rerenders do not restart an entrance or the reading clock', () => {
  const { live, simulation, state } = setup();
  live.sync(state);
  const request = simulation.getSnapshot().request!;
  simulation.commit(request.ticket);
  simulation.completeEntrance(request.ticket);
  simulation.advance(5000);
  live.sync(state);
  assert.equal(simulation.getSnapshot().request, request);
  assert.equal(simulation.getSnapshot().elapsedMs, 5000);
});
