import { Container, Filter, GlProgram, Rectangle, Sprite, Texture, WebGLRenderer, defaultFilterVert } from 'pixi.js';
import { PORTRAITS, PORTRAIT_TRANSITION_MS, portraitForScore, portraitTransition, type PortraitRule } from '../core/portraits.ts';
import { smooth } from '../core/particle-motion.ts';
import { PORTRAIT_ASSETS } from './portrait-assets.ts';
import { artworkFragment, textShadowFragment } from './artwork-shader.ts';
import { animateParticles } from './particle-clock.ts';
import { SceneClock } from './scene-clock.ts';
import { SceneText } from './scene-text.ts';

export interface PreparedText { text: SceneText; revision: number }

async function loadImage(src: string, signal: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const finish = (error?: unknown) => {
      clearTimeout(timer); signal.removeEventListener('abort', cancel);
      image.onload = image.onerror = null;
      if (error) reject(error); else resolve(image);
    };
    const cancel = () => finish(signal.reason);
    const timer = setTimeout(() => finish(new Error('Portrait loading timed out')), 8000);
    image.onload = () => finish(); image.onerror = () => finish(new Error('Portrait could not be loaded'));
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel(); else image.src = src;
  });
}

/** One WebGL context, one clock. The host input and accessible HTML remain outside the scene. */
export class LiangScene {
  readonly clock: SceneClock;
  private readonly renderer = new WebGLRenderer<HTMLCanvasElement>();
  private readonly stage = new Container();
  private readonly art = new Sprite(Texture.WHITE);
  private text = new SceneText();
  private readonly retiring = new Set<SceneText>();
  private readonly lifetime = new AbortController();
  private readonly portraits = new Map<string, Texture>();
  private artFilter!: Filter;
  private shadow!: Filter;
  private sizeObserver!: ResizeObserver;
  private themeObserver!: MutationObserver;
  private current: PortraitRule | null = null;
  private from = PORTRAITS[0]!;
  private to = PORTRAITS[0]!;
  private width = 1;
  private height = 1;
  private resolution = 1;
  private elapsed = 0;
  private reduced = false;
  private content: HTMLElement | null = null;
  private layoutDirty = false;
  private layoutRevision = 0;
  private relayoutRunning = false;
  private textVisible = false;
  private textMode: 'gather' | 'disperse' | null = null;
  private textProgress = 0;
  private disposed = false;
  private initialized = false;

  private constructor(private readonly root: HTMLElement, private readonly canvas: HTMLCanvasElement,
    private readonly onFailure: (error: unknown) => void) {
    this.clock = new SceneClock((elapsed) => this.draw(elapsed), onFailure);
  }

  static async create(root: HTMLElement, canvas: HTMLCanvasElement, reduced: boolean,
    signal: AbortSignal, onFailure: (error: unknown) => void): Promise<LiangScene> {
    const scene = new LiangScene(root, canvas, onFailure);
    try {
      await scene.init(reduced, signal);
      signal.throwIfAborted(); return scene;
    } catch (error) { scene.destroy(); throw error; }
  }

  private async init(reduced: boolean, signal: AbortSignal) {
    const combined = AbortSignal.any([signal, this.lifetime.signal]);
    const loaded = await Promise.all(PORTRAITS.map(async rule => {
      const image = await loadImage(PORTRAIT_ASSETS[rule.image]!, combined);
      return { rule, image };
    }));
    combined.throwIfAborted();
    for (const { rule, image } of loaded) this.portraits.set(rule.id, Texture.from(image));
    const bounds = this.root.getBoundingClientRect();
    this.width = Math.max(1, bounds.width); this.height = Math.max(1, bounds.height);
    await this.renderer.init({ canvas: this.canvas, width: this.width, height: this.height,
      resolution: Math.min(devicePixelRatio || 1, 2), autoDensity: true, backgroundAlpha: 0,
      antialias: false, powerPreference: 'low-power' });
    this.initialized = true;
    combined.throwIfAborted();
    for (const texture of this.portraits.values()) this.renderer.texture.initSource(texture.source);
    this.artFilter = new Filter({
      glProgram: GlProgram.from({ vertex: defaultFilterVert, fragment: artworkFragment, name: 'liang-artwork' }),
      resolution: 'inherit',
      resources: {
        uFrom: this.portraits.get(this.from.id)!.source, uTo: this.portraits.get(this.to.id)!.source,
        artworkUniforms: {
          uFromRect: { value: new Float32Array(4), type: 'vec4<f32>' },
          uToRect: { value: new Float32Array(4), type: 'vec4<f32>' },
          uViewport: { value: new Float32Array([this.width, this.height]), type: 'vec2<f32>' },
          uTime: { value: 0, type: 'f32' }, uBreath: { value: 1, type: 'f32' },
          uOldAlpha: { value: 1, type: 'f32' }, uNewAlpha: { value: 0, type: 'f32' },
          uGlitch: { value: 0, type: 'f32' }, uSeed: { value: Math.random() * 100, type: 'f32' },
          uLight: { value: 0, type: 'f32' },
        },
      },
    });
    this.shadow = new Filter({
      glProgram: GlProgram.from({ vertex: defaultFilterVert, fragment: textShadowFragment, name: 'liang-text-shadow' }),
      resolution: 'inherit', padding: 8,
      resources: { textUniforms: { uLight: { value: 0, type: 'f32' } } },
    });
    this.art.filters = [this.artFilter]; this.text.container.filters = [this.shadow];
    this.stage.addChild(this.art, this.text.container);
    this.resize(true); this.theme(); this.setReduced(reduced);
    this.sizeObserver = new ResizeObserver(() => {
      if (this.resize()) { this.layoutRevision++; this.layoutDirty = true; this.clock.invalidate(); }
    });
    this.sizeObserver.observe(this.root);
    this.themeObserver = new MutationObserver(() => { this.theme(); this.clock.invalidate(); });
    this.themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] });
    document.fonts.addEventListener('loadingdone', this.fontsChanged);
    this.canvas.addEventListener('webglcontextlost', this.contextLost);
    this.root.dataset.renderer = 'webgl';
    this.clock.invalidate();
  }

  private contextLost = (event: Event) => {
    event.preventDefault();
    if (!this.disposed) this.onFailure(new Error('WebGL context lost; using the basic renderer'));
  };
  private fontsChanged = () => { this.layoutRevision++; this.layoutDirty = true; this.clock.invalidate(); };
  private get uniforms() { return this.artFilter.resources.artworkUniforms.uniforms; }
  private resize(force = false) {
    const rect = this.root.getBoundingClientRect();
    const width = Math.max(1, rect.width), height = Math.max(1, rect.height);
    const resolution = Math.min(devicePixelRatio || 1, 2);
    if (!force && width === this.width && height === this.height && resolution === this.resolution) return false;
    this.width = width; this.height = height; this.resolution = resolution;
    this.renderer.resize(this.width, this.height, resolution);
    this.art.width = this.width; this.art.height = this.height;
    this.art.filterArea = new Rectangle(0, 0, this.width, this.height);
    this.text.container.filterArea = new Rectangle(0, 0, this.width, this.height);
    this.uniforms.uViewport = new Float32Array([this.width, this.height]);
    this.updateRects();
    return true;
  }
  private updateRects() {
    const rect = (rule: PortraitRule) => {
      const texture = this.portraits.get(rule.id)!;
      const height = this.height * rule.height, width = height * texture.width / texture.height;
      return new Float32Array([this.width * rule.centerX - width / 2, this.height * rule.top, width, height]);
    };
    this.uniforms.uFromRect = rect(this.from); this.uniforms.uToRect = rect(this.to);
  }
  private theme() {
    const light = document.body.hasAttribute('data-ds-dark-theme') ? 0 : 1;
    this.uniforms.uLight = light; this.shadow.resources.textUniforms.uniforms.uLight = light;
    this.text.theme(this.root);
  }
  private draw(elapsed: number) {
    if (this.disposed) return;
    this.elapsed = elapsed;
    if (this.layoutDirty && this.content?.isConnected && !this.relayoutRunning) this.refreshLayout();
    this.uniforms.uTime = elapsed;
    this.uniforms.uBreath = this.reduced ? 1 : 1 + .0125 * (1 - Math.cos(elapsed / 10000 * Math.PI * 2));
    this.text.updateWind(elapsed, this.reduced);
    this.renderer.render(this.stage);
  }

  setReduced(reduced: boolean) {
    if (this.reduced !== reduced) { this.text.resetWind(); if (!reduced) this.text.startWind(this.elapsed); }
    this.reduced = reduced; this.clock.setContinuous(!reduced);
  }
  async prepareText(content: HTMLElement, signal: AbortSignal): Promise<PreparedText> {
    const combined = AbortSignal.any([signal, this.lifetime.signal]);
    for (;;) {
      const revision = this.layoutRevision;
      const text = await SceneText.prepare(content, this.root, combined);
      if (combined.aborted) { void text.dispose(); combined.throwIfAborted(); }
      if (revision !== this.layoutRevision) { void text.dispose(); continue; }
      // Upload ahead of the entrance frame; the atlas is immutable for this layout.
      try { if (text.source) this.renderer.texture.initSource(text.source); }
      catch (error) { void text.dispose(); throw error; }
      return { text, revision };
    }
  }
  private adoptText(text: SceneText) {
    const previous = this.text;
    this.text = text;
    text.container.filters = [this.shadow];
    text.container.filterArea = new Rectangle(0, 0, this.width, this.height);
    text.theme(this.root);
    previous.container.filters = null;
    this.stage.addChild(text.container);
    this.retiring.add(previous);
    void previous.dispose().finally(() => this.retiring.delete(previous));
  }
  async layoutText(content: HTMLElement, signal: AbortSignal, prepared?: PreparedText) {
    let next = prepared;
    if (next && next.revision !== this.layoutRevision) { void next.text.dispose(); next = undefined; }
    next ??= await this.prepareText(content, signal);
    if (signal.aborted || this.disposed) { void next.text.dispose(); signal.throwIfAborted(); throw new Error('Scene disposed'); }
    this.content = content; this.layoutDirty = false;
    this.adoptText(next.text); this.textVisible = false; this.textMode = null;
    this.clock.invalidate();
  }
  private refreshLayout() {
    const content = this.content!, previous = this.text;
    this.layoutDirty = false; this.relayoutRunning = true;
    void this.prepareText(content, this.lifetime.signal).then(next => {
      if (this.disposed || previous !== this.text || !content.isConnected) { void next.text.dispose(); return; }
      const alpha = previous.container.alpha;
      this.adoptText(next.text); this.text.setAlpha(alpha);
      if (this.textMode) { this.text.begin(this.textMode); this.text.drawProgress(this.textProgress); }
      else if (this.textVisible) { this.text.show(); this.text.startWind(this.elapsed); }
      this.clock.invalidate();
    }).catch(error => { if (!this.disposed) this.onFailure(error); })
      .finally(() => { this.relayoutRunning = false; });
  }
  private animate(ms: number, signal: AbortSignal, draw: (progress: number) => void) {
    return animateParticles(ms, AbortSignal.any([signal, this.lifetime.signal]), draw, this.clock);
  }
  async fade(to: number, ms: number, signal: AbortSignal) {
    const from = Number(getComputedStyle(this.root).opacity);
    await this.animate(ms, signal, p => { this.root.style.opacity = String(from + (to - from) * smooth(p)); });
  }
  async switchPortrait(score: number, signal: AbortSignal) {
    const next = portraitForScore(score);
    this.root.dataset.portrait = next.id; this.root.dataset.classicScore = String(score);
    if (this.current?.id === next.id) return;
    const first = this.current === null;
    this.from = this.current ?? next; this.to = next; this.current = next;
    this.artFilter.resources.uFrom = this.portraits.get(this.from.id)!.source;
    this.artFilter.resources.uTo = this.portraits.get(this.to.id)!.source;
    this.updateRects();
    this.uniforms.uSeed = Math.random() * 100;
    this.root.dataset.portraitTransition = first ? 'idle' : 'switching';
    try {
      if (!first) await this.animate(this.reduced ? 160 : PORTRAIT_TRANSITION_MS, signal, p => {
        const state = portraitTransition(p, this.reduced);
        this.uniforms.uOldAlpha = state.outgoing; this.uniforms.uNewAlpha = state.incoming;
        this.uniforms.uGlitch = state.glitch;
        this.root.dataset.portraitProgress = p.toFixed(3);
      });
    } finally {
      if (!this.disposed) {
        this.uniforms.uOldAlpha = 0; this.uniforms.uNewAlpha = 1; this.uniforms.uGlitch = 0;
        this.root.dataset.portraitTransition = 'idle'; this.root.dataset.portraitProgress = '1';
        this.clock.invalidate();
      }
    }
  }
  async enter(signal: AbortSignal) {
    this.text.setAlpha(1); this.textVisible = true;
    if (this.reduced) {
      this.text.show(); await this.animate(150, signal, p => this.text.setAlpha(smooth(p)));
    } else {
      this.textMode = 'gather'; this.textProgress = 0; this.text.begin('gather');
      await this.animate(2400, signal, p => { this.textProgress = p; this.text.drawProgress(p); });
    }
    this.textMode = null; this.text.startWind(this.elapsed); this.clock.invalidate();
  }
  async leave(signal: AbortSignal) {
    if (!this.content || !this.textVisible) return;
    if (this.reduced) await this.animate(130, signal, p => this.text.setAlpha(1 - smooth(p)));
    else {
      this.textMode = 'disperse'; this.textProgress = 0; this.text.begin('disperse');
      await this.animate(1500, signal, p => { this.textProgress = p; this.text.drawProgress(p); });
    }
    this.text.hide(); this.textVisible = false; this.textMode = null; this.clock.invalidate();
  }
  destroy() {
    if (this.disposed) return;
    this.disposed = true; this.lifetime.abort(); this.clock.destroy();
    this.sizeObserver?.disconnect(); this.themeObserver?.disconnect();
    this.canvas.removeEventListener('webglcontextlost', this.contextLost);
    document.fonts.removeEventListener('loadingdone', this.fontsChanged);
    this.text.destroy(); this.artFilter?.destroy(); this.shadow?.destroy(); this.art.destroy();
    for (const text of this.retiring) text.destroy();
    this.retiring.clear();
    this.stage.destroy();
    for (const texture of this.portraits.values()) texture.destroy(true);
    this.portraits.clear();
    if (this.initialized) this.renderer.destroy();
    delete this.root.dataset.renderer;
  }
}
