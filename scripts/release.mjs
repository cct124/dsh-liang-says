import assert from 'node:assert/strict';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { REGISTRY, releaseMetadata, verifyArchive, npmReleaseState, publishNpm, publishGithub } from './release-lib.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFile(resolve(root, path), 'utf8');
const pkg = JSON.parse(await read('package.json'));
const lock = JSON.parse(await read('package-lock.json'));
const command = process.argv[2];
const tagIndex = process.argv.indexOf('--tag');
if (tagIndex >= 0) assert(process.argv[tagIndex + 1], '--tag requires a version tag.');
const tag = command === 'metadata' ? (tagIndex >= 0 ? process.argv[tagIndex + 1] : undefined) : process.env.GITHUB_REF_NAME;
const metadata = releaseMetadata(pkg, lock, await read('CHANGELOG.md'), tag);

function run(binary, args) {
  const result = spawnSync(binary, args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 120_000 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout || `${binary} failed.`);
  return result.stdout.trim();
}

function verifyTag() {
  assert(tag, 'A version tag is required for publishing.');
  assert.equal(run('git', ['rev-parse', 'HEAD']), run('git', ['rev-parse', `refs/tags/${tag}^{commit}`]), 'Tag does not point to this checkout.');
  run('git', ['merge-base', '--is-ancestor', 'HEAD', 'refs/remotes/origin/main']);
}

if (command === 'metadata') {
  if (tag !== undefined) verifyTag();
  await mkdir(resolve(root, 'dist'), { recursive: true });
  await writeFile(resolve(root, 'dist/release-notes.md'), metadata.notes);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT,
    `version=${metadata.version}\ntag=${metadata.tag}\nfilename=${metadata.filename}\n`);
  console.log(`Validated ${metadata.tag}; npm channel: ${metadata.npmTag}`);
} else if (command === 'npm' || command === 'github') {
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Publishing is only available inside the release workflow.');
  assert.equal(process.env.GITHUB_EVENT_NAME, 'push');
  assert.equal(process.env.GITHUB_REF_TYPE, 'tag');
  assert.equal(pkg.repository.url, `git+https://github.com/${process.env.GITHUB_REPOSITORY}.git`, 'Repository mismatch.');
  verifyTag();
  const info = JSON.parse(await read('dist/release-info.json'));
  const archive = await readFile(resolve(root, 'dist', metadata.filename));
  verifyArchive(metadata, info, archive, await read('dist/SHA256SUMS'));
  assert.equal(await read('dist/release-notes.md'), metadata.notes, 'Release notes differ from the tagged source.');
  if (command === 'npm') {
    assert(process.env.npm_execpath, 'Run via npm run release:npm.');
    console.log(await publishNpm(info, () => run(process.execPath, [process.env.npm_execpath,
      'publish', `./dist/${metadata.filename}`, '--access', 'public', '--tag', metadata.npmTag,
      '--registry', REGISTRY, '--ignore-scripts']), {
      onPending: attempt => {
        if (attempt === 1 || attempt % 4 === 0) {
          console.log(`npm accepted the upload; waiting for registry visibility (${attempt}/120).`);
        }
      },
    }));
  } else {
    assert.equal(await npmReleaseState(info), 'published', 'Verify npm publication before creating the GitHub release.');
    assert(process.env.GH_TOKEN, 'GH_TOKEN is required.');
    const repository = process.env.GITHUB_REPOSITORY;
    const api = async (path, binary = false) => {
      const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, {
        headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`,
          Accept: binary ? 'application/octet-stream' : 'application/vnd.github+json' },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.status === 404 && !binary) return null;
      assert(response.ok, `GitHub API returned HTTP ${response.status}.`);
      return binary ? Buffer.from(await response.arrayBuffer()) : response.json();
    };
    const assets = await Promise.all([metadata.filename, 'SHA256SUMS', 'release-info.json'].map(async name => ({
      name, bytes: await readFile(resolve(root, 'dist', name)),
    })));
    console.log(await publishGithub(metadata, assets, {
      api, run: args => run('gh', [...args, '--repo', repository]),
    }));
  }
} else throw new Error('Use metadata, npm or github.');
