import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupTextRows, sampleTextGust, sampleTextRibbon, textGustDelay, textWindOffset } from '../src/core/text-wind.ts';

test('each breeze has a quiet gap and variable strength and travel time', () => {
  const gentle = sampleTextGust(() => 0), stronger = sampleTextGust(() => 1);
  assert.ok(gentle.restMs >= 4000 && stronger.restMs <= 8500);
  assert.ok(gentle.travelMs < stronger.travelMs);
  assert.ok(gentle.rippleMs < stronger.rippleMs);
  assert.ok(gentle.strength < stronger.strength);
});

test('each ribbon carries wind from its own left edge to its right edge', () => {
  const ribbon = sampleTextRibbon(sampleTextGust(() => .5), () => .5);
  const left = textGustDelay(0, 800, ribbon);
  const middle = textGustDelay(400, 800, ribbon);
  const right = textGustDelay(800, 800, ribbon);
  assert.ok(left < middle && middle < right);
  assert.equal(left, ribbon.startMs);
  assert.ok(Number.isFinite(textGustDelay(0, 0, ribbon)));
});

test('rendered rows tolerate fractional baselines and regroup when text wraps', () => {
  const glyphs = [
    { id: 'c', left: 20, right: 40, top: 50 },
    { id: 'b', left: 40, right: 60, top: 10.8 },
    { id: 'a', left: 20, right: 40, top: 10 },
    { id: 'signature', left: 100, right: 120, top: 100 },
  ];
  const rows = groupTextRows(glyphs);
  assert.deepEqual(rows.map(row => row.items.map(item => item.id)), [['a', 'b'], ['c'], ['signature']]);
  assert.equal(rows[0]!.right - rows[0]!.left, 40);
  const wrapped = groupTextRows(glyphs.map(item => item.id === 'b' ? { ...item, left: 0, right: 20, top: 50 } : item));
  assert.deepEqual(wrapped.map(row => row.items.map(item => item.id)), [['a'], ['b', 'c'], ['signature']]);
});

test('rows vary their actual trajectories while remaining bounded and returning to rest', () => {
  const gust = sampleTextGust(() => .5);
  const first = sampleTextRibbon(gust, () => .1), second = sampleTextRibbon(gust, () => .9);
  // Same progress and amplitude: the difference must come from the waveform itself.
  assert.notDeepEqual(textWindOffset(.3, 5, first), textWindOffset(.3, 5, second));
  assert.notEqual(first.startMs, second.startMs);
  assert.notEqual(first.rippleMs, second.rippleMs);
  for (const row of [first, second]) {
    assert.deepEqual(textWindOffset(0, 5, row), { x: 0, y: 0 });
    assert.deepEqual(textWindOffset(1, 5, row), { x: 0, y: 0 });
    for (let step = 0; step <= 100; step++) {
      const point = textWindOffset(step / 100, 5, row);
      assert.ok(point.x >= 0 && point.x <= .9);
      assert.ok(Math.abs(point.y) <= 3.3);
    }
  }
});

test('ribbon motion settles exactly, stays gentle, and neighboring letters remain connected', () => {
  const amplitude = 5;
  assert.deepEqual(textWindOffset(0, amplitude), { x: 0, y: 0 });
  assert.deepEqual(textWindOffset(1, amplitude), { x: 0, y: 0 });
  assert.ok(textWindOffset(.25, amplitude).y < 0);
  assert.ok(textWindOffset(.75, amplitude).y > 0);
  for (let i = 0; i <= 100; i++) {
    const point = textWindOffset(i / 100, amplitude);
    const neighbor = textWindOffset(i / 100 - .025, amplitude);
    assert.ok(point.x >= 0 && point.x <= .9);
    assert.ok(Math.abs(point.y) <= 3.3);
    assert.ok(Math.abs(point.y - neighbor.y) < .8);
  }
});
