import { build, context } from 'esbuild';
import { mkdir, writeFile, copyFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dev = process.argv.includes('--dev');
const watching = process.argv.includes('--watch');
const output = resolve(root, 'dist', dev ? 'dev' : 'release');
const name = dev ? 'dsh-liang-says-dev' : 'dsh-liang-says';
const packageInfo = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
await mkdir(resolve(output, 'locale'), { recursive: true });
await mkdir(resolve(output, 'asset/quotes'), { recursive: true });
const manifest = {
  name, version: packageInfo.version, private: true, type: 'module',
  description: dev ? '梁选开关与动效的 DSH 内置开发预览' : '在任意模式任务运行期间展示梁文峰语录，可通过输入框梁选开关控制',
  engines: { dsh: '0.2.1-rc.3' },
  exports: { '.': './index.js', './client': './client.js', './locale/*.json': './locale/*.json', './icon': './icon.svg' },
  files: ['index.js', 'client.js', 'cordis.patch.yml', 'locale', 'icon.svg', 'asset/quotes/quotes.json'],
  dsh: {
    bundle: { patch: './cordis.patch.yml' },
    client: { platform: 'web', immediately: true, inject: ['@deepseek-ai/dsh-client-ui-layout',
      '@deepseek-ai/dsh-client-ui-session', '@deepseek-ai/dsh-client-ui-conversation',
      ...(dev ? ['@deepseek-ai/dsh-client-ui-sidebar'] : [])] },
  },
};
await writeFile(resolve(output, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(resolve(output, 'cordis.patch.yml'), `- insert:\n    - id: ${name}\n      name: '${name}'\n`);
await copyFile(resolve(root, 'asset/icon.svg'), resolve(output, 'icon.svg'));
await copyFile(resolve(root, 'README.md'), resolve(output, 'README.md'));
await copyFile(resolve(root, 'asset/quotes/quotes.json'), resolve(output, 'asset/quotes/quotes.json'));
for (const [locale, title, description] of [
  ['zh', dev ? '梁选预览' : '梁选', dev ? '在 DSH 内模拟任务运行、预览语录与光芒动画。仅开发构建包含操控面板。' : '任意模式任务运行时展示梁文峰语录；输入框开关默认开启。'],
  ['en', dev ? 'Liang preview' : 'Liang', dev ? 'Simulate running tasks and preview quotes and sunlight inside DSH.' : 'Liang Wenfeng quotes for tasks in any mode, enabled by default with a composer switch.'],
]) await writeFile(resolve(output, 'locale', locale + '.json'), JSON.stringify({ meta: { title, description } }, null, 2) + '\n');

await build({ entryPoints: [resolve(root, 'src/host/index.ts')], outfile: resolve(output, 'index.js'), bundle: true, format: 'esm', platform: 'node', target: 'node24' });
const options = {
  absWorkingDir: root, entryPoints: [dev ? 'src/client/dev.tsx' : 'src/client/index.ts'],
  outfile: resolve(output, 'client.js'), bundle: true, format: 'cjs', platform: 'browser', target: 'chrome120',
  external: ['react'], jsx: 'transform', loader: { '.png': 'dataurl', '.mp3': 'dataurl', '.css': 'text' },
  define: { 'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production') },
  minify: !dev, sourcemap: dev ? 'inline' : false,
  banner: { js: `window.__ModuleLoader__.load({id:${JSON.stringify(name)},factory(require){const module={exports:{}};` },
  footer: { js: 'return module.exports;}});' },
};
if (watching) {
  const watcher = await context(options);
  await watcher.watch();
  console.log('Watching DSH client bundle: ' + output);
  const stop = async () => { await watcher.dispose(); process.exit(0); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
} else {
  await build(options);
  const content = await readFile(resolve(output, 'client.js'), 'utf8');
  if (!dev && ['liang-preview', '模拟状态', 'class Simulation', 'Reset simulation'].some(marker => content.includes(marker))) {
    throw new Error('Development controls leaked into the release artifact.');
  }
  console.log(`Built ${name} at ${output}`);
}
