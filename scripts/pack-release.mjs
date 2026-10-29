import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'dist/release');
const source = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(await readFile(resolve(output, 'package.json'), 'utf8'));
assert.equal(manifest.name, source.name);
assert.equal(manifest.version, source.version);
assert.equal(manifest.private, false);
assert.equal(manifest.license, 'MIT');
assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml');
assert(!manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-sidebar'));
assert.equal(typeof (await import(pathToFileURL(resolve(output, 'index.js')).href)).apply, 'function');

// Exercise the shipped loader and registration path, without starting a model request.
const client = await readFile(resolve(output, 'client.js'), 'utf8');
assert(client.includes('data:image/png;base64,'), 'Portrait must be embedded.');
assert(client.includes('data:audio/mpeg;base64,'), 'Entrance audio must be embedded.');
for (const marker of ['liang-preview', '模拟状态', 'Reset simulation', 'sourceMappingURL=']) {
  assert(!client.includes(marker), `Unexpected development content: ${marker}`);
}
let registration;
const listeners = new Map();
runInNewContext(client, {
  window: {
    __ModuleLoader__: { load(value) { registration = value; } },
    localStorage: { getItem() { return null; } },
    addEventListener(event, handler) { listeners.set(event, handler); },
    removeEventListener(event) { listeners.delete(event); },
  },
}, { timeout: 1000 });
assert.equal(registration.id, manifest.name);
const external = new Set();
const plugin = registration.factory(name => { external.add(name); return {}; });
assert.deepEqual([...external].sort(), ['react', 'react-dom']);
const slots = [];
const cleanups = [];
plugin.apply({
  locale: { register() { return () => {}; } },
  effect(setup) { cleanups.push(setup()); },
  slots: {
    inject(name, setup) { slots.push(name); cleanups.push(setup()); },
    register() { return () => {}; },
  },
});
assert.deepEqual(slots, ['conversation.input.left', 'shell.overlay']);
for (const cleanup of cleanups.reverse()) cleanup();
assert.equal(listeners.size, 0);

assert(process.env.npm_execpath, 'Run via npm run pack:release.');
const packed = spawnSync(process.execPath, [process.env.npm_execpath, 'pack', './dist/release',
  '--pack-destination', './dist', '--json', '--ignore-scripts'], {
  cwd: root, encoding: 'utf8', windowsHide: true,
});
if (packed.error) throw packed.error;
assert.equal(packed.status, 0, packed.stderr || packed.stdout);
const [info] = JSON.parse(packed.stdout);
assert.deepEqual(info.files.map(file => file.path).sort(), [
  'package.json', 'index.js', 'client.js', 'cordis.patch.yml', 'icon.svg',
  'locale/en.json', 'locale/zh.json', 'asset/quotes/quotes.json', 'asset/quotes/quote-context.json',
  'README.md', 'CHANGELOG.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md',
].sort(), 'Release package must contain only the reviewed files.');
const archive = await readFile(resolve(root, 'dist', info.filename));
const sha256 = createHash('sha256').update(archive).digest('hex');
await writeFile(resolve(root, 'dist/SHA256SUMS'), `${sha256}  ${info.filename}\n`);
await writeFile(resolve(root, 'dist/release-info.json'), JSON.stringify({
  name: info.name, version: info.version, filename: info.filename,
  size: info.size, unpackedSize: info.unpackedSize, sha256, integrity: info.integrity,
  files: info.files.map(file => file.path),
}, null, 2) + '\n');
console.log(`Verified ${info.filename}: ${info.files.length} files, ${info.size} bytes.\nSHA-256 ${sha256}`);
