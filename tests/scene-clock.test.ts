import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SceneClock } from '../src/client/scene-clock.ts';

test('scene clock coalesces effects before rendering, pauses when hidden, and disposes queued frames', () => {
  const original = { document: globalThis.document, request: globalThis.requestAnimationFrame, cancel: globalThis.cancelAnimationFrame };
  const document = Object.assign(new EventTarget(), { hidden: false });
  const frames = new Map<number, FrameRequestCallback>();
  let serial = 0;
  Object.assign(globalThis, { document,
    requestAnimationFrame: (callback: FrameRequestCallback) => { frames.set(++serial, callback); return serial; },
    cancelAnimationFrame: (id: number) => frames.delete(id) });
  let scene: SceneClock | undefined;
  try {
    const events: string[] = [];
    const elapsed: number[] = [];
    scene = new SceneClock((time) => { events.push('render'); elapsed.push(time); }, error => { throw error; });
    const tick = (time: number) => {
      const queued = [...frames.values()]; frames.clear(); for (const callback of queued) callback(time);
    };
    scene.request(() => events.push('portrait')); scene.request(() => events.push('text'));
    assert.equal(frames.size, 1);
    tick(100); assert.deepEqual(events, ['portrait', 'text', 'render']);
    tick(116); assert.equal(elapsed.at(-1), 16);
    document.hidden = true; document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(frames.size, 0);
    document.hidden = false; document.dispatchEvent(new Event('visibilitychange'));
    tick(9000); assert.equal(elapsed.at(-1), 16, 'background time must not jump the breathing phase');
    scene.setContinuous(false); tick(9016); assert.equal(frames.size, 0);
    const cancelled = scene.request(() => events.push('cancelled'));
    scene.cancel(cancelled); tick(9032); assert.ok(!events.includes('cancelled'));
    scene.request(() => events.push('disposed')); scene.destroy();
    tick(9048); assert.ok(!events.includes('disposed')); assert.equal(frames.size, 0);
  } finally {
    scene?.destroy();
    Object.assign(globalThis, { document: original.document, requestAnimationFrame: original.request, cancelAnimationFrame: original.cancel });
  }
});
