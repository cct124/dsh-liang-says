import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleInk, seedParticles, particlePose, particleInkProgress } from '../src/core/particle-motion.ts';
import { animateParticles, type ParticleClock } from '../src/client/particle-clock.ts';

test('sampling keeps every stroke and respects the particle budget, including edge pixels', () => {
  const width = 31, height = 17;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const ink = [0, 15, width * 8 + 10, width * height - 1];
  for (const index of ink) pixels[index * 4 + 3] = 255;
  const tiles = sampleInk(pixels, width, height, 2, 3);
  assert.ok(tiles.length <= 3);
  for (const index of ink) {
    const x = index % width, y = Math.floor(index / width);
    assert.equal(tiles.filter(tile => x >= tile.x && x < tile.x + tile.width
      && y >= tile.y && y < tile.y + tile.height).length, 1);
  }
  assert.deepEqual(sampleInk(new Uint8ClampedArray(width * height * 4), width, height), []);
});

test('entrance ends exactly on the text pixels without drift or lost opacity', () => {
  const particles = seedParticles([{ x: 12, y: 34, width: 2, height: 2 }], 600, 200, () => .3);
  const particle = particles[0]!;
  assert.notEqual(particle.startX, particle.x);
  assert.deepEqual(particlePose(particle, 1, 'gather', 600), { x: 12, y: 34, alpha: 1, scale: 1 });
});

test('particles fade in independently and wander before gathering', () => {
  const particle = seedParticles([{ x: 12, y: 34, width: 2, height: 2 }], 600, 200, () => .3)[0]!;
  const early = { ...particle, appearAt: 0, fadeDuration: .2, gatherAt: .5 };
  const late = { ...particle, appearAt: .25, gatherAt: .5 };
  assert.equal(particlePose(early, 0, 'gather', 600).alpha, 0);
  assert.ok(particlePose(early, .1, 'gather', 600).alpha > 0);
  assert.ok(particlePose(early, .1, 'gather', 600).alpha < particlePose(early, .2, 'gather', 600).alpha);
  assert.equal(particlePose(late, .2, 'gather', 600).alpha, 0);
  const wandering = particlePose(early, .2, 'gather', 600);
  assert.notEqual(wandering.x, early.startX);
  assert.notEqual(wandering.y, early.startY);
  assert.notEqual(wandering.x, early.x);
});

test('particle color follows each arrival and already matches the text before handoff', () => {
  const particles = seedParticles([0, 250, 499].map(x => ({ x, y: 20, width: 2, height: 2 })), 500, 100, () => .5);
  for (const particle of particles) {
    assert.equal(particleInkProgress(particle, particle.gatherAt, 'gather', 500), 0);
    const halfway = particleInkProgress(particle, (particle.gatherAt + particle.arriveAt) / 2, 'gather', 500);
    assert.ok(halfway > .49 && halfway < .51);
    assert.equal(particleInkProgress(particle, particle.arriveAt, 'gather', 500), 1);
    assert.equal(particleInkProgress(particle, 1, 'gather', 500), 1);
    let previous = 0;
    for (let step = 0; step <= 100; step++) {
      const color = particleInkProgress(particle, step / 100, 'gather', 500);
      assert.ok(color >= previous && color <= 1);
      previous = color;
    }
  }
  assert.ok(particleInkProgress(particles[0]!, .5, 'gather', 500)
    > particleInkProgress(particles[2]!, .5, 'gather', 500));
});

test('outgoing particles keep the text color until released and then gradually darken', () => {
  const particles = seedParticles([0, 499].map(x => ({ x, y: 20, width: 2, height: 2 })), 500, 100, () => .5);
  for (const particle of particles) {
    assert.equal(particleInkProgress(particle, 0, 'disperse', 500), 1);
    assert.equal(particleInkProgress(particle, 1, 'disperse', 500), 0);
    let previous = 1;
    for (let step = 0; step <= 100; step++) {
      const color = particleInkProgress(particle, step / 100, 'disperse', 500);
      assert.ok(color <= previous && color >= 0);
      previous = color;
    }
  }
  assert.ok(particleInkProgress(particles[0]!, .3, 'disperse', 500) < 1);
  assert.equal(particleInkProgress(particles[1]!, .3, 'disperse', 500), 1);
});

test('entrance dust stays near its own text line even on large displays', () => {
  let seed = 42;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  const tiles = Array.from({ length: 100 }, (_, i) => ({ x: (i % 20) * 80, y: Math.floor(i / 20) * 100, width: 2, height: 2 }));
  for (const particle of seedParticles(tiles, 1600, 500, random)) {
    for (const progress of [0, .2, .4, .6, 1]) {
      const pose = particlePose(particle, progress, 'gather', 1600);
      assert.ok(Math.abs(pose.x - particle.x) < 150);
      assert.ok(Math.abs(pose.y - particle.y) < 55);
    }
  }
});

test('wind erodes the left side first and every released particle moves right', () => {
  const particles = seedParticles([0, 250, 499].map(x => ({ x, y: 20, width: 2, height: 2 })), 500, 100, () => .5);
  const left = particlePose(particles[0]!, .3, 'disperse', 500);
  const right = particlePose(particles[2]!, .3, 'disperse', 500);
  assert.ok(left.x > particles[0]!.x);
  assert.equal(right.x, particles[2]!.x);
  assert.equal(right.alpha, 1);
  for (const particle of particles) {
    let previousX = particle.x;
    for (let step = 0; step <= 20; step++) {
      const pose = particlePose(particle, step / 20, 'disperse', 500);
      assert.ok(pose.x >= previousX);
      assert.ok(pose.alpha >= 0 && pose.alpha <= 1);
      previousX = pose.x;
    }
    assert.equal(particlePose(particle, 1, 'disperse', 500).alpha, 0);
  }
});

function manualClock() {
  let frame: FrameRequestCallback | undefined;
  let deadline: (() => void) | undefined;
  const clock: ParticleClock = {
    now: () => 0,
    request: callback => { frame = callback; return 1; },
    cancel: () => { frame = undefined; },
    deadline: callback => { deadline = callback; return () => { deadline = undefined; }; },
  };
  return { clock, step: (ms: number) => { const callback = frame; frame = undefined; callback?.(ms); },
    expire: () => deadline?.(), pending: () => !!frame || !!deadline };
}

test('animation finishes and cleans up even if the browser stops delivering frames', async () => {
  const timer = manualClock(), draws: number[] = [];
  const animation = animateParticles(2100, new AbortController().signal, p => draws.push(p), timer.clock);
  timer.step(1000);
  timer.expire();
  await animation;
  assert.equal(draws[0], 0);
  assert.equal(draws.at(-1), 1);
  assert.equal(timer.pending(), false);
});

test('cancelling mid-animation removes both schedules and prevents stale draws', async () => {
  const timer = manualClock(), abort = new AbortController(), draws: number[] = [];
  const animation = animateParticles(1500, abort.signal, p => draws.push(p), timer.clock);
  const cancelled = assert.rejects(animation, { name: 'AbortError' });
  timer.step(500);
  abort.abort();
  await cancelled;
  const count = draws.length;
  timer.step(1500); timer.expire();
  assert.equal(timer.pending(), false);
  assert.equal(draws.length, count);
});

test('a drawing failure rejects and cleans up rather than leaving a pending transition', async () => {
  const timer = manualClock();
  await assert.rejects(animateParticles(1500, new AbortController().signal,
    () => { throw new Error('Canvas unavailable'); }, timer.clock), /Canvas unavailable/);
  assert.equal(timer.pending(), false);
});
