import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// A disposable local repository exercises Git prepare without pushing or publishing.
const root = fileURLToPath(new URL('../', import.meta.url));
const run = (command, args, cwd) => {
  const result = spawnSync(command, args, {
    cwd, encoding: 'utf8', windowsHide: true, timeout: 180_000,
    env: { ...process.env, CI: 'true' },
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr + result.stdout);
  return result.stdout;
};
await mkdir(join(root, '.dev-logs'), { recursive: true });
const scratch = await mkdtemp(join(root, '.dev-logs/git-install-'));
const source = join(scratch, 'source');
const consumer = join(scratch, 'consumer');
await mkdir(consumer, { recursive: true });
const files = run('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], root).split('\0').filter(Boolean);
for (const name of files) {
  const destination = join(source, name);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(join(root, name), destination);
}
run('git', ['init', '--quiet'], source);
run('git', ['add', '.'], source);
run('git', ['-c', 'user.name=Install smoke test', '-c', 'user.email=smoke@example.invalid',
  'commit', '--quiet', '-m', 'Local install fixture'], source);
const spec = 'git+' + pathToFileURL(source).href;
const commit = run('git', ['rev-parse', 'HEAD'], source).trim();
const approval = `dsh-liang-says@${spec}#${commit}`;
await writeFile(join(consumer, 'package.json'), JSON.stringify({ name: 'liang-git-install-smoke', private: true }));
await writeFile(join(consumer, 'pnpm-workspace.yaml'), `allowBuilds:\n  ${JSON.stringify(approval)}: true\n`);
console.log('Testing clean Git installation in ' + scratch);
const pnpmCli = process.env.npm_execpath;
assert(pnpmCli?.includes('pnpm'), 'Run this smoke with pnpm run check:git-install.');
const pnpm = spawnSync(process.execPath, [pnpmCli, 'add', spec, '--registry=https://registry.npmjs.org/'], {
  cwd: consumer, encoding: 'utf8', windowsHide: true,
  timeout: 180_000, env: { ...process.env, CI: 'true' },
});
if (pnpm.error) throw pnpm.error;
assert.equal(pnpm.status, 0, pnpm.stderr + pnpm.stdout);
const installed = join(consumer, 'node_modules/dsh-liang-says');
const manifest = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'));
const patch = await readFile(join(installed, manifest.dsh.bundle.patch), 'utf8');
assert.match(patch, /name: 'dsh-liang-says'/);
for (const [key, target] of Object.entries(manifest.exports)) {
  if (key.includes('*')) {
    for (const locale of ['zh', 'en']) await access(join(installed, target.replace('*', locale)));
  } else await access(join(installed, target));
}
assert.equal(typeof (await import(pathToFileURL(join(installed, manifest.exports['.'])).href)).apply, 'function');
const client = await readFile(join(installed, manifest.exports['./client']), 'utf8');
assert(client.includes('window.__ModuleLoader__.load'));
assert(!client.includes('liang-preview'));
assert(!client.includes('sourceMappingURL='));
console.log(`Git install passed: ${manifest.name}@${manifest.version}; bundle, host, client, locales and icon resolved.`);
