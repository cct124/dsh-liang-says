import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PORTRAITS, PORTRAIT_TRANSITION_MS, portraitForScore, portraitTransition } from '../src/core/portraits.ts';

test('portrait selection uses inclusive classic-score boundaries and remains stable within a range', () => {
  for (const score of [0, 1, 50, 85, 89]) assert.equal(portraitForScore(score).id, 'liang-01');
  for (const score of [90, 95, 100, 101]) assert.equal(portraitForScore(score).id, 'liang-02');
  assert.equal(portraitForScore(95), portraitForScore(90));
  assert.notEqual(portraitForScore(89), portraitForScore(90));
  for (const value of [NaN, Infinity, -1]) assert.throws(() => portraitForScore(value));
});

test('portrait rules can be extended and ambiguous or uncovered ranges fail explicitly', () => {
  const rules = [PORTRAITS[0]!, { ...PORTRAITS[1]!, maxScore: 94 },
    { ...PORTRAITS[1]!, id: 'future', image: 'future.png', minScore: 95 }];
  assert.equal(portraitForScore(94, rules).id, 'liang-02');
  assert.equal(portraitForScore(95, rules).id, 'future');
  assert.throws(() => portraitForScore(90, [PORTRAITS[0]!]));
  assert.throws(() => portraitForScore(90, [PORTRAITS[1]!, PORTRAITS[1]!]));
});

test('one-second portrait transition has clean endpoints, bounded alpha and two separate glitch bursts', () => {
  assert.equal(PORTRAIT_TRANSITION_MS, 1000);
  assert.deepEqual(portraitTransition(0), { outgoing: 1, incoming: 0, glitch: 0 });
  assert.deepEqual(portraitTransition(1), { outgoing: 0, incoming: 1, glitch: 0 });
  let old = 1, next = 0;
  for (let i = 0; i <= 100; i++) {
    const state = portraitTransition(i / 100);
    for (const value of Object.values(state)) assert.ok(value >= 0 && value <= 1);
    assert.ok(state.outgoing <= old); assert.ok(state.incoming >= next);
    old = state.outgoing; next = state.incoming;
  }
  assert.ok(portraitTransition(.2).glitch > .9);
  assert.equal(portraitTransition(.5).glitch, 0);
  assert.ok(portraitTransition(.78).glitch > .5);
  assert.equal(portraitTransition(.96).glitch, 0);
});

test('reduced motion crossfades without any glitch or blank handover', () => {
  for (let i = 0; i <= 100; i++) {
    const state = portraitTransition(i / 100, true);
    assert.equal(state.glitch, 0);
    assert.equal(state.outgoing + state.incoming, 1);
  }
});
