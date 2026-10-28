import { sampleInk, seedParticles, particlePose, particleInkProgress, smooth, PARTICLE_TINTS, type ParticleMode } from '../core/particle-motion.ts';
import { animateParticles } from './particle-clock.ts';

const COLOR_STEPS = 64;

/** Resolve CSS colors once and cache a smooth ramp; no color parsing in the animation loop. */
function tintRamps(tints: string[], ink: string) {
  const swatches = document.createElement('canvas');
  swatches.width = tints.length + 1; swatches.height = 1;
  const context = swatches.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  [...tints, ink].forEach((color, index) => {
    context.fillStyle = color; context.fillRect(index, 0, 1, 1);
  });
  const pixels = context.getImageData(0, 0, swatches.width, 1).data;
  return tints.map((_, index) => Array.from({ length: COLOR_STEPS + 1 }, (_, step) => {
    const rgb = [0, 1, 2].map(channel => Math.round(pixels[index * 4 + channel]!
      + (pixels[tints.length * 4 + channel]! - pixels[index * 4 + channel]!) * step / COLOR_STEPS));
    return `rgb(${rgb.join(' ')})`;
  }));
}

/** Rasterize laid-out glyphs so particles match real wrapping, font fallback and letter spacing. */
function textMask(elements: HTMLElement[], stage: HTMLElement) {
  const stageRect = stage.getBoundingClientRect();
  const glyphs: { text: string; rect: DOMRect; style: CSSStyleDeclaration }[] = [];
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  for (const element of elements) {
    const style = getComputedStyle(element);
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      for (const { segment, index } of segmenter.segment(node.textContent ?? '')) {
        if (!segment.trim()) continue;
        const range = document.createRange();
        range.setStart(node, index); range.setEnd(node, index + segment.length);
        glyphs.push({ text: segment, rect: range.getBoundingClientRect(), style });
      }
    }
  }
  if (!glyphs.length) return null;
  const left = Math.floor(Math.min(...glyphs.map(g => g.rect.left))) - 3;
  const top = Math.floor(Math.min(...glyphs.map(g => g.rect.top))) - 3;
  const width = Math.ceil(Math.max(...glyphs.map(g => g.rect.right)) - left) + 3;
  const height = Math.ceil(Math.max(...glyphs.map(g => g.rect.bottom)) - top) + 3;
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * scale); canvas.height = Math.ceil(height * scale);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.scale(scale, scale);
  context.textBaseline = 'alphabetic';
  for (const glyph of glyphs) {
    const { style, rect, text } = glyph;
    const fontSize = parseFloat(style.fontSize);
    context.font = `${style.fontStyle} ${style.fontWeight} ${fontSize}px ${style.fontFamily}`;
    context.fillStyle = style.color;
    const metrics = context.measureText(text);
    const ascent = metrics.fontBoundingBoxAscent ?? fontSize * .85;
    const descent = metrics.fontBoundingBoxDescent ?? fontSize * .15;
    const baseline = rect.top - top + (rect.height - ascent - descent) / 2 + ascent;
    context.fillText(text, rect.left - left, baseline);
  }
  const data = context.getImageData(0, 0, canvas.width, canvas.height);
  const tiles = sampleInk(data.data, canvas.width, canvas.height, Math.ceil(1.5 * scale));
  const particles = seedParticles(tiles.map(tile => ({ x: tile.x / scale, y: tile.y / scale,
    width: tile.width / scale, height: tile.height / scale })), width, height);
  // Keep the glyph alpha intact while individual tiles change from dust to text color.
  const stageStyle = getComputedStyle(stage);
  const tints = PARTICLE_TINTS.map((color, index) => stageStyle.getPropertyValue(`--lx-particle-${index}`).trim() || color);
  const settleInk = stageStyle.getPropertyValue('--lx-particle-settle').trim();
  const ramps = settleInk ? tintRamps(tints, settleInk) : null;
  const colorSteps = new Int16Array(particles.length);
  context.globalCompositeOperation = 'source-atop';
  for (const particle of particles) {
    context.fillStyle = tints[particle.tint]!;
    context.fillRect(particle.x, particle.y, particle.width, particle.height);
  }
  const updateTints = (progress: number, mode: ParticleMode) => {
    if (!ramps) return;
    // Finish all recoloring before drawing any particle, so the texture uploads once per frame.
    for (const [index, particle] of particles.entries()) {
      const step = Math.round(particleInkProgress(particle, progress, mode, width) * COLOR_STEPS);
      if (colorSteps[index] === step) continue;
      colorSteps[index] = step;
      context.fillStyle = ramps[particle.tint]![step]!;
      context.fillRect(particle.x, particle.y, particle.width, particle.height);
    }
  };
  return { canvas, scale, width, height, left: left - stageRect.left, top: top - stageRect.top, particles, updateTints };
}

export async function animateText(elements: HTMLElement[], stage: HTMLElement, mode: ParticleMode, signal: AbortSignal) {
  signal.throwIfAborted();
  const targets = mode === 'disperse' ? elements.filter(element => Number(getComputedStyle(element).opacity) > .01) : elements;
  if (!targets.length) return;
  const mask = textMask(targets, stage);
  if (!mask) { for (const element of targets) element.style.opacity = mode === 'gather' ? '1' : '0'; return; }
  const canvas = document.createElement('canvas');
  canvas.className = 'lx-particles';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.dataset.effect = mode;
  const bounds = stage.getBoundingClientRect();
  canvas.width = Math.ceil(bounds.width * mask.scale); canvas.height = Math.ceil(bounds.height * mask.scale);
  const context = canvas.getContext('2d');
  if (!context) { for (const element of targets) element.style.opacity = mode === 'gather' ? '1' : '0'; return; }
  context.scale(mask.scale, mask.scale);
  const opacity = targets.map(element => element.style.opacity);
  const restore = () => targets.forEach((element, index) => { element.style.opacity = opacity[index]!; });
  let resized = false;
  const observer = new ResizeObserver(() => {
    const next = stage.getBoundingClientRect();
    if (Math.abs(next.width - bounds.width) > 1 || Math.abs(next.height - bounds.height) > 1) resized = true;
  });
  observer.observe(stage);
  stage.append(canvas);
  // Only crossfade once every particle is at its final position and full opacity.
  const handoffStart = Math.max(.9, ...mask.particles.map(particle => particle.arriveAt));
  try {
    await animateParticles(mode === 'gather' ? 2400 : 1500, signal, progress => {
      const p = resized ? 1 : progress;
      const textOpacity = mode === 'gather' ? smooth((p - handoffStart) / (1 - handoffStart)) : 0;
      for (const element of targets) element.style.opacity = String(textOpacity);
      mask.updateTints(p, mode);
      context.clearRect(0, 0, bounds.width, bounds.height);
      for (const particle of mask.particles) {
        const pose = particlePose(particle, p, mode, mask.width);
        context.globalAlpha = pose.alpha * (1 - textOpacity);
        if (context.globalAlpha < .005) continue;
        const w = particle.width * pose.scale, h = particle.height * pose.scale;
        context.drawImage(mask.canvas, particle.x * mask.scale, particle.y * mask.scale,
          particle.width * mask.scale, particle.height * mask.scale,
          mask.left + pose.x + (particle.width - w) / 2, mask.top + pose.y + (particle.height - h) / 2, w, h);
      }
    });
  } catch (error) { restore(); throw error; }
  finally { observer.disconnect(); canvas.remove(); }
}
