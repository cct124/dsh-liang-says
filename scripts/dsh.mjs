import { spawn } from 'node:child_process';
import { mkdir, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const harness = resolve(process.env.DSH_SOURCE ?? join(root, '../deepseek-harness'));
const home = join(root, '.dsh-dev');
const action = process.argv[2] ?? 'start';
await access(join(harness, 'apps/cli/src/bin.ts'));
await mkdir(home, { recursive: true });
let args;
if (action === 'install') {
  await access(join(root, 'dist/dev/package.json'));
  args = ['plugin', '--profile', 'web', 'add', 'link:' + join(root, 'dist/dev').replaceAll('\\', '/')];
} else if (action === 'start') {
  args = ['--profile', 'web', '--patch', join(harness, 'apps/web/tests/pin-browse-picker.overlay.yml'),
    '--port', process.env.LIANG_PORT ?? '41831', '--no-open'];
} else throw new Error('Use install or start.');
const child = spawn(process.execPath, ['--import', 'tsx/esm', 'apps/cli/src/bin.ts', ...args], {
  cwd: harness, env: { ...process.env, DSH_HOME: home }, stdio: 'inherit', windowsHide: true,
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { child.kill(signal); });
