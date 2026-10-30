import { Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { PARTICLE_TINTS, particleInkProgress, particlePose, sampleInk, seedParticles,
  type InkParticle, type ParticleMode } from '../core/particle-motion.ts';
import { groupTextRows, sampleTextGust, sampleTextRibbon, textGustDelay, textWindOffset,
  type TextRibbon } from '../core/text-wind.ts';

interface Glyph {
  text: string; left: number; right: number; top: number; width: number; height: number;
  font: string; size: number; baseline: number; ax: number; ay: number;
  sprite: Sprite; dx: number; dy: number; ribbon?: TextRibbon; delay: number;
}
interface Dust { particle: InkParticle; sprite: Sprite; }
const color = (css: string) => {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1);
  const rgba = ctx.getImageData(0, 0, 1, 1).data;
  return [rgba[0]!, rgba[1]!, rgba[2]!] as const;
};
const packed = (rgb: readonly number[]) => (rgb[0]! << 16) | (rgb[1]! << 8) | rgb[2]!;

/** Browser layout supplies glyph positions; one cached white atlas supplies both dust and text. */
export class SceneText {
  readonly container = new Container();
  private readonly letters = new Container();
  private readonly dust = new Container();
  private atlas: Texture | null = null;
  private pixels: ImageData | null = null;
  private glyphs: Glyph[] = [];
  private particles: Dust[] = [];
  private textures: Texture[] = [];
  private scale = 1;
  private width = 1;
  private height = 1;
  private left = 0;
  private top = 0;
  private ink: readonly number[] = [255, 244, 214];
  private tints: readonly (readonly number[])[] = [];
  private mode: ParticleMode | null = null;
  private progress = 0;
  private nextGust = Infinity;
  private gustStart = 0;
  private gustEnd = 0;
  private restingMs = 0;

  constructor() { this.container.addChild(this.letters, this.dust); }

  layout(content: HTMLElement, stage: HTMLElement) {
    this.clear();
    const bounds = stage.getBoundingClientRect();
    this.scale = Math.min(window.devicePixelRatio || 1, 2);
    const measure = document.createElement('canvas').getContext('2d')!;
    this.glyphs = Array.from(content.querySelectorAll<HTMLElement>('.lx-glyph')).map(element => {
      const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
      const size = parseFloat(style.fontSize);
      const font = `${style.fontStyle} ${style.fontWeight} ${size}px ${style.fontFamily}`;
      measure.font = font;
      const metrics = measure.measureText(element.textContent ?? '');
      const ascent = metrics.fontBoundingBoxAscent ?? size * .85;
      const descent = metrics.fontBoundingBoxDescent ?? size * .15;
      return { text: element.textContent ?? '', left: rect.left - bounds.left - 2,
        right: rect.right - bounds.left + 2, top: rect.top - bounds.top - 2,
        width: Math.ceil((rect.width + 4) * this.scale), height: Math.ceil((rect.height + 4) * this.scale),
        size, font, baseline: 2 + (rect.height - ascent - descent) / 2 + ascent,
        ax: 0, ay: 0, sprite: new Sprite(), dx: 0, dy: 0, delay: 0 };
    });
    if (!this.glyphs.length) return;
    this.left = Math.min(...this.glyphs.map(g => g.left));
    this.top = Math.min(...this.glyphs.map(g => g.top));
    this.width = Math.max(...this.glyphs.map(g => g.right)) - this.left;
    this.height = Math.max(...this.glyphs.map(g => g.top + g.height / this.scale)) - this.top;
    const area = this.glyphs.reduce((sum, g) => sum + (g.width + 2) * (g.height + 2), 0);
    const atlasWidth = Math.max(256, Math.min(2048, Math.ceil(Math.sqrt(area) / 64) * 64));
    let x = 0, y = 0, rowHeight = 0;
    for (const g of this.glyphs) {
      if (x + g.width > atlasWidth) { y += rowHeight + 2; x = 0; rowHeight = 0; }
      g.ax = x; g.ay = y; x += g.width + 2; rowHeight = Math.max(rowHeight, g.height);
    }
    const canvas = document.createElement('canvas'); canvas.width = atlasWidth; canvas.height = y + rowHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'alphabetic';
    for (const g of this.glyphs) {
      ctx.save(); ctx.translate(g.ax, g.ay); ctx.scale(this.scale, this.scale);
      ctx.font = g.font; ctx.fillText(g.text, 2, g.baseline); ctx.restore();
    }
    this.pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    this.atlas = Texture.from(canvas);
    for (const g of this.glyphs) {
      g.sprite.texture = this.texture(g.ax, g.ay, g.width, g.height);
      g.sprite.scale.set(1 / this.scale); g.sprite.position.set(g.left, g.top);
      this.letters.addChild(g.sprite);
    }
    this.letters.visible = false; this.dust.visible = false;
    this.theme(stage);
  }

  theme(stage: HTMLElement) {
    const style = getComputedStyle(stage);
    this.ink = color(style.getPropertyValue('--lx-ink').trim() || '#fff4d6');
    this.tints = PARTICLE_TINTS.map((fallback, i) => color(style.getPropertyValue(`--lx-particle-${i}`).trim() || fallback));
    for (const glyph of this.glyphs) glyph.sprite.tint = packed(this.ink);
    if (this.mode) this.drawProgress(this.progress);
  }

  private texture(x: number, y: number, width: number, height: number) {
    const texture = new Texture({ source: this.atlas!.source, frame: new Rectangle(x, y, width, height) });
    this.textures.push(texture); return texture;
  }

  begin(mode: ParticleMode) {
    this.mode = mode; this.progress = 0; this.nextGust = Infinity;
    this.clearDust();
    if (!this.pixels || !this.atlas) return;
    // Sampling each glyph avoids gaps/duplicates in adjacent characters and keeps signature particles identical.
    const glyphPixels = this.glyphs.map(g => {
      const pixels = new Uint8ClampedArray(g.width * g.height * 4);
      for (let row = 0; row < g.height; row++) {
        const start = ((g.ay + row) * this.pixels!.width + g.ax) * 4;
        pixels.set(this.pixels!.data.subarray(start, start + g.width * 4), row * g.width * 4);
      }
      return pixels;
    });
    let step = Math.ceil(1.5 * this.scale);
    let tiles;
    do {
      tiles = this.glyphs.map((g, i) => sampleInk(glyphPixels[i]!, g.width, g.height, step, Infinity));
      step++;
    } while (tiles.reduce((sum, list) => sum + list.length, 0) > 6500);
    const worldTiles = tiles.flatMap((list, index) => {
      const g = this.glyphs[index]!;
      return list.map(tile => ({ x: g.left + g.dx - this.left + tile.x / this.scale,
        y: g.top + g.dy - this.top + tile.y / this.scale,
        width: tile.width / this.scale, height: tile.height / this.scale,
        ax: g.ax + tile.x, ay: g.ay + tile.y, aw: tile.width, ah: tile.height }));
    });
    const seeded = seedParticles(worldTiles, this.width, this.height);
    this.particles = seeded.map((particle, i) => {
      const tile = worldTiles[i]!;
      const sprite = new Sprite(this.texture(tile.ax, tile.ay, tile.aw, tile.ah));
      this.dust.addChild(sprite); return { particle, sprite };
    });
    this.letters.visible = false; this.dust.visible = true;
    this.drawProgress(0);
  }

  drawProgress(progress: number) {
    this.progress = progress;
    const mode = this.mode;
    if (!mode) return;
    for (const { particle, sprite } of this.particles) {
      const pose = particlePose(particle, progress, mode, this.width);
      const tint = this.tints[particle.tint]!;
      const t = particleInkProgress(particle, progress, mode, this.width);
      sprite.tint = (Math.round(tint[0]! + (this.ink[0]! - tint[0]!) * t) << 16)
        | (Math.round(tint[1]! + (this.ink[1]! - tint[1]!) * t) << 8)
        | Math.round(tint[2]! + (this.ink[2]! - tint[2]!) * t);
      sprite.alpha = pose.alpha;
      sprite.scale.set(pose.scale / this.scale);
      sprite.position.set(this.left + pose.x + particle.width * (1 - pose.scale) / 2,
        this.top + pose.y + particle.height * (1 - pose.scale) / 2);
    }
    if (progress >= 1) {
      this.mode = null; this.letters.visible = mode === 'gather'; this.dust.visible = false;
      this.clearDust();
      if (mode === 'gather') this.resetWind();
    }
  }

  show() { this.mode = null; this.dust.visible = false; this.letters.visible = true; this.resetWind(); }
  hide() { this.mode = null; this.letters.visible = this.dust.visible = false; }
  setAlpha(alpha: number) { this.container.alpha = alpha; }
  startWind(now: number) { this.nextGust = now + 1200 + Math.random() * 1400; }
  resetWind() {
    this.nextGust = Infinity; this.gustEnd = 0;
    for (const g of this.glyphs) { g.dx = g.dy = 0; g.sprite.position.set(g.left, g.top); }
  }
  updateWind(now: number, reduced: boolean) {
    if (reduced || this.mode || !this.letters.visible) return;
    if (now >= this.nextGust) {
      const gust = sampleTextGust(); this.gustStart = now; this.gustEnd = now; this.restingMs = gust.restMs;
      for (const row of groupTextRows(this.glyphs)) {
        const ribbon = sampleTextRibbon(gust);
        for (const g of row.items) {
          g.ribbon = ribbon; g.delay = textGustDelay(g.left - row.left, row.right - row.left, ribbon);
          this.gustEnd = Math.max(this.gustEnd, now + g.delay + ribbon.rippleMs);
        }
      }
      this.nextGust = Infinity;
    }
    if (!this.gustEnd) return;
    for (const g of this.glyphs) {
      if (!g.ribbon) continue;
      const amplitude = Math.min(5, Math.max(2.5, g.size * .13)) * g.ribbon.strength;
      const pose = textWindOffset((now - this.gustStart - g.delay) / g.ribbon.rippleMs, amplitude, g.ribbon);
      g.dx = pose.x; g.dy = pose.y; g.sprite.position.set(g.left + g.dx, g.top + g.dy);
    }
    if (now >= this.gustEnd) { this.nextGust = now + this.restingMs; this.gustEnd = 0; }
  }

  private clearDust() {
    const removed = new Set(this.particles.map(({ sprite }) => sprite.texture));
    for (const { sprite } of this.particles) {
      // Remove each tile view while retaining the shared atlas source.
      sprite.texture.destroy(); sprite.destroy();
    }
    this.textures = this.textures.filter(texture => !removed.has(texture));
    this.particles = [];
  }
  private clear() {
    this.clearDust();
    for (const g of this.glyphs) g.sprite.destroy();
    for (const texture of this.textures) texture.destroy();
    this.textures = []; this.glyphs = []; this.atlas?.destroy(true); this.atlas = null;
    this.pixels = null; this.mode = null; this.resetWind();
  }
  destroy() { this.clear(); this.container.destroy({ children: true }); }
}
