import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playEntranceSound } from '../src/client/entrance-audio.ts';

function fakeAudio() {
  return {
    currentTime: 0, volume: 1, paused: true, error: null,
    pause() { this.paused = true; },
    play() { this.paused = false; return Promise.resolve(); },
  };
}

test('the visual lead follows actual playback, excluding audio startup latency', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const audio = fakeAudio();
  let entered = false;
  const ready = playEntranceSound(audio as HTMLAudioElement, new AbortController().signal).then(() => { entered = true; });
  t.mock.timers.tick(300);
  await Promise.resolve();
  assert.equal(entered, false);
  assert.equal(audio.volume, .25);
  audio.currentTime = .299;
  t.mock.timers.tick(16);
  await Promise.resolve();
  assert.equal(entered, false);
  audio.currentTime = .3;
  t.mock.timers.tick(16);
  await ready;
  assert.equal(entered, true);
  assert.equal(audio.paused, false);
});

test('dismissal during the lead stops sound and cancels the pending entrance', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const audio = fakeAudio(), abort = new AbortController();
  const ready = playEntranceSound(audio as HTMLAudioElement, abort.signal);
  const rejected = assert.rejects(ready, { name: 'AbortError' });
  audio.currentTime = .1;
  abort.abort();
  await rejected;
  t.mock.timers.tick(2000);
  assert.equal(audio.paused, true);
  assert.equal(audio.currentTime, 0);
});

test('blocked audio lets the visual transition continue without sound', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const audio = fakeAudio();
  audio.play = () => Promise.reject(new Error('Autoplay blocked'));
  await playEntranceSound(audio as HTMLAudioElement, new AbortController().signal);
  assert.equal(audio.paused, true);
});

test('stalled playback cannot keep the switch pending forever', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const audio = fakeAudio();
  const ready = playEntranceSound(audio as HTMLAudioElement, new AbortController().signal);
  t.mock.timers.tick(1500);
  await ready;
  assert.equal(audio.paused, true);
  assert.equal(audio.currentTime, 0);
});
