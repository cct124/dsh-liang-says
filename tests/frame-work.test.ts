import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInSlices } from '../src/client/frame-work.ts';

test('preparation yields between batches and cancellation closes the generator', async () => {
  const abort = new AbortController();
  const events: string[] = [];
  function* work() {
    try { for (let i = 0; i < 10; i++) { events.push(`work-${i}`); yield; } }
    finally { events.push('released'); }
  }
  const pending = runInSlices(work(), abort.signal, 0);
  setTimeout(() => { events.push('other-task'); abort.abort(); }, 0);
  await assert.rejects(pending, { name: 'AbortError' });
  assert.deepEqual(events, ['work-0', 'other-task', 'released']);
});

test('resource batches complete once, and failures still close the generator', async () => {
  let completed = 0;
  function* work() { for (let i = 0; i < 5; i++) { completed++; yield; } }
  await runInSlices(work(), undefined, 0);
  assert.equal(completed, 5);
  let released = false;
  function* failing() { try { yield; throw new Error('layout failed'); } finally { released = true; } }
  await assert.rejects(runInSlices(failing()), /layout failed/);
  assert.equal(released, true);
});
