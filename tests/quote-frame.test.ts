import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { createQuoteFrame } from '../src/client/quote-frame.ts';
import { QuotePicker } from '../src/core/quote-picker.ts';
import { Simulation } from '../src/core/simulation.ts';

const request = { ticket: 1, quote: { id: 'a', text: '甲。', classicScore: 90 }, durationMs: 30_000 };

test('a delayed render still starts entrance and releases the pending simulation', async () => {
  const simulation = new Simulation(new QuotePicker([request.quote]));
  simulation.show();
  const frame = createQuoteFrame(simulation.getSnapshot().request!, new AbortController().signal);
  const entrance = frame.rendered.then(() => {
    assert.equal(simulation.commit(frame.ticket), true);
    assert.equal(simulation.completeEntrance(frame.ticket), true);
  });
  // Several scheduling turns may pass before React commits the new text.
  for (let i = 0; i < 5; i++) await setImmediate();
  assert.equal(simulation.getSnapshot().shown, 0);
  assert.equal(simulation.getSnapshot().pending, true);
  frame.didRender();
  frame.didRender();
  await entrance;
  assert.equal(simulation.getSnapshot().shown, 1);
  assert.equal(simulation.getSnapshot().pending, false);
  assert.equal(simulation.show(), true);
});

test('cancelling a render releases its wait; a late commit cannot start the next frame', async () => {
  const abort = new AbortController();
  const first = createQuoteFrame(request, abort.signal);
  const cancelled = assert.rejects(first.rendered, { name: 'AbortError' });
  abort.abort();
  await cancelled;
  // Effect replays may use the same ticket, but need a fresh DOM commit.
  const next = createQuoteFrame(request, new AbortController().signal);
  let entered = false;
  const entrance = next.rendered.then(() => { entered = true; });
  first.didRender();
  await setImmediate();
  assert.equal(entered, false);
  next.didRender();
  await entrance;
  assert.equal(entered, true);
});

test('an already aborted request cannot wait indefinitely or start entrance', async () => {
  const abort = new AbortController();
  abort.abort();
  const frame = createQuoteFrame(request, abort.signal);
  frame.didRender();
  await assert.rejects(frame.rendered, { name: 'AbortError' });
});
