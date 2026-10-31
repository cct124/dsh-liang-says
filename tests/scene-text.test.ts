import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Container, Sprite } from 'pixi.js';
import { SceneText } from '../src/client/scene-text.ts';

// A deterministic ink mask; real Pixi containers/textures exercise resource ownership.
class InkCanvas {
  width = 1; height = 1;
  getContext() {
    return {
      font: '', fillStyle: '', textBaseline: '', save() {}, restore() {}, translate() {}, scale() {}, fillText() {}, fillRect() {},
      measureText: () => ({ fontBoundingBoxAscent: 17, fontBoundingBoxDescent: 3 }),
      getImageData: (_x: number, _y: number, width: number, height: number) => ({
        width, height, data: new Uint8ClampedArray(width * height * 4).fill(255),
      }),
    };
  }
}

async function withLayout(run: (content: HTMLElement, stage: HTMLElement) => Promise<void>) {
  const original = { document: globalThis.document, window: globalThis.window,
    canvas: globalThis.HTMLCanvasElement, style: globalThis.getComputedStyle };
  Object.assign(globalThis, {
    document: { createElement: () => new InkCanvas() }, window: { devicePixelRatio: 1 }, HTMLCanvasElement: InkCanvas,
    getComputedStyle: () => ({ fontSize: '20px', fontStyle: 'normal', fontWeight: '500', fontFamily: 'serif', getPropertyValue: () => '' }),
  });
  const content = { querySelectorAll: () => Array.from({ length: 40 }, (_, i) => ({
    textContent: '文', getBoundingClientRect: () => ({ left: i * 24, right: i * 24 + 20, top: 100, width: 20, height: 24 }),
  })) } as unknown as HTMLElement;
  const stage = { getBoundingClientRect: () => ({ left: 0, top: 0 }) } as HTMLElement;
  try { await run(content, stage); }
  finally { Object.assign(globalThis, { document: original.document, window: original.window,
    HTMLCanvasElement: original.canvas, getComputedStyle: original.style }); }
}

test('entry and exit reuse the same ink tiles and textures, including the live wind offset', async () => {
  await withLayout(async (content, stage) => {
    const text = await SceneText.prepare(content, stage, new AbortController().signal);
    const [letters, dust] = text.container.children as Container[];
    const sprites = [...dust.children] as Sprite[], textures = sprites.map(s => s.texture);
    assert.ok(sprites.length > 0 && sprites.length <= 6500);
    assert.equal(text.source!.listenerCount('resize'), 1, 'only the atlas owns a resize subscription');
    text.begin('gather'); text.drawProgress(.999);
    const landed = sprites.map(s => ({ x: s.x, y: s.y }));
    text.drawProgress(1);
    assert.equal(letters.visible, true); assert.equal(dust.visible, false);
    assert.ok(sprites.every(s => !s.destroyed));
    const initial = letters.children.map(s => ({ x: s.x, y: s.y }));
    text.startWind(0); text.updateWind(10_000, false); text.updateWind(10_400, false);
    const offsets = letters.children.map((s, i) => ({ x: s.x - initial[i]!.x, y: s.y - initial[i]!.y }));
    text.begin('disperse');
    assert.deepEqual(dust.children, sprites);
    assert.ok(sprites.every((s, i) => s.texture === textures[i]));
    const perGlyph = sprites.length / initial.length;
    for (let i = 0; i < sprites.length; i++) {
      const offset = offsets[Math.floor(i / perGlyph)]!;
      assert.ok(Math.abs(sprites[i]!.x - landed[i]!.x - offset.x) < 1e-8);
      assert.ok(Math.abs(sprites[i]!.y - landed[i]!.y - offset.y) < 1e-8);
    }
    text.drawProgress(1);
    assert.equal(letters.visible, false); assert.equal(dust.visible, false);
    assert.ok(sprites.every(s => !s.destroyed), 'finishing an animation never destroys resources');
    const source = text.source!;
    await text.dispose();
    assert.ok(sprites.every(s => s.destroyed)); assert.ok(textures.every(t => t.destroyed));
    assert.equal(source.destroyed, true); assert.equal(text.container.destroyed, true);
  });
});

test('unmount drains an already scheduled reclamation without double disposal', async () => {
  await withLayout(async (content, stage) => {
    const text = await SceneText.prepare(content, stage, new AbortController().signal);
    const source = text.source!;
    const disposing = text.dispose();
    text.destroy(); text.destroy();
    await disposing;
    assert.equal(source.destroyed, true); assert.equal(text.container.destroyed, true);
  });
});
