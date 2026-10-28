export type ParticleMode = 'gather' | 'disperse';
export interface InkTile { x: number; y: number; width: number; height: number }
export interface InkParticle extends InkTile {
  startX: number; startY: number; driftX: number; driftY: number;
  delay: number; phase: number;
  appearAt: number; fadeDuration: number; gatherAt: number; arriveAt: number;
  floatY: number; frequency: number; initialScale: number;
  tint: number;
}
export const PARTICLE_TINTS = ['#fff8e8', '#fff4d6', '#f5e8c9', '#eadbbc', '#f9eddb'] as const;

export const clamp = (value: number) => Math.max(0, Math.min(1, value));
export const smooth = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };

/** Keep every ink tile, increasing tile size rather than dropping strokes on long quotes. */
export function sampleInk(alpha: Uint8ClampedArray, width: number, height: number,
  initialStep = 2, limit = 6500): InkTile[] {
  for (let step = Math.max(1, Math.ceil(initialStep)); ; step++) {
    const tiles: InkTile[] = [];
    for (let y = 0; y < height; y += step) for (let x = 0; x < width; x += step) {
      const w = Math.min(step, width - x), h = Math.min(step, height - y);
      let ink = false;
      for (let dy = 0; dy < h && !ink; dy++) for (let dx = 0; dx < w; dx++) {
        if (alpha[((y + dy) * width + x + dx) * 4 + 3]! > 0) { ink = true; break; }
      }
      if (ink) tiles.push({ x, y, width: w, height: h });
    }
    if (tiles.length <= limit) return tiles;
  }
}

export function seedParticles(tiles: InkTile[], width: number, height: number,
  random = Math.random): InkParticle[] {
  // An incoming breeze carries nearby dust from the left and deposits strokes left → right.
  const spreadX = Math.min(100, Math.max(40, width * .12));
  const spreadY = Math.min(28, Math.max(16, height * .15));
  return tiles.map(tile => {
    const across = clamp(tile.x / Math.max(1, width));
    return {
      ...tile,
      startX: tile.x - (.55 + random() * .65) * spreadX,
      startY: tile.y + (random() + random() - 1) * spreadY,
      driftX: 160 + random() * Math.min(360, width * .6),
      driftY: -65 + random() * 100,
      delay: random() * .14,
      phase: random() * Math.PI * 2,
      appearAt: .02 + across * .24 + random() * .1,
      fadeDuration: .1 + random() * .16,
      gatherAt: .18 + across * .28 + random() * .1,
      arriveAt: .58 + across * .28 + random() * .08,
      floatY: (random() - .5) * 40,
      frequency: 5 + random() * 7,
      initialScale: .65 + random() * .3,
      tint: Math.min(PARTICLE_TINTS.length - 1, Math.floor(random() * PARTICLE_TINTS.length)),
    };
  });
}

const gatherProgress = (particle: InkParticle, progress: number) =>
  smooth((progress - particle.gatherAt) / (particle.arriveAt - particle.gatherAt));

function releaseProgress(particle: InkParticle, progress: number, width: number) {
  const release = .04 + particle.x / Math.max(1, width) * .42 + particle.delay * .45;
  return clamp((progress - release) / (1 - release));
}

/** Match the text color before landing; retain it until the outgoing wind releases the ink. */
export function particleInkProgress(particle: InkParticle, progress: number, mode: ParticleMode, width: number) {
  return mode === 'gather' ? gatherProgress(particle, progress)
    : 1 - smooth(releaseProgress(particle, progress, width) / .65);
}

export function particlePose(particle: InkParticle, progress: number, mode: ParticleMode, width: number) {
  if (mode === 'gather') {
    const age = Math.max(0, progress - particle.appearAt);
    const t = gatherProgress(particle, progress);
    const flight = clamp(age / (particle.arriveAt - particle.appearAt));
    const wind = 1 - (1 - flight) ** 2;
    const floatY = particle.startY + particle.floatY * age
      + (Math.cos(particle.phase + age * particle.frequency * .8) - Math.cos(particle.phase)) * 5;
    return {
      x: particle.x + (particle.startX - particle.x) * (1 - wind),
      y: particle.y + (floatY - particle.y) * (1 - t),
      alpha: smooth(age / particle.fadeDuration) * (.75 + .25 * t),
      scale: particle.initialScale + (1 - particle.initialScale) * t,
    };
  }
  // A ragged erosion front travels left → right; released ash keeps moving downwind.
  const t = releaseProgress(particle, progress, width);
  const wind = t * (.35 + .65 * t);
  const curl = Math.sin(t * 7 + particle.phase) - Math.sin(particle.phase);
  return {
    x: particle.x + particle.driftX * wind,
    y: particle.y + particle.driftY * t + curl * 11 * t,
    alpha: 1 - smooth((t - .2) / .8), scale: 1 - .65 * t,
  };
}
