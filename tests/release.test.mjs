import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, copyFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { releaseMetadata, verifyArchive, npmReleaseState, publishNpm, publishGithub, sha256 } from '../scripts/release-lib.mjs';

const pkg = { name: 'dsh-liang-says', version: '0.1.0' };
const lock = { version: '0.1.0', packages: { '': { version: '0.1.0' } } };
const changelog = '# Changes\n\n## 0.1.0\n\nFirst release.\n\n## 0.0.1\n\nOld release.\n';
const metadata = releaseMetadata(pkg, lock, changelog);
const archive = Buffer.from('reviewed archive');
const info = { name: pkg.name, version: pkg.version, filename: metadata.filename,
  sha256: sha256(archive), integrity: `sha512-${createHash('sha512').update(archive).digest('base64')}` };
const sums = `${info.sha256}  ${info.filename}\n`;
const published = () => Response.json({ dist: { integrity: info.integrity } });

test('release metadata validates version alignment and extracts only the current notes', () => {
  assert.equal(releaseMetadata(pkg, lock, changelog, 'v0.1.0').notes, 'First release.\n');
  assert.equal(metadata.npmTag, 'latest');
  assert.throws(() => releaseMetadata(pkg, lock, changelog, 'v0.2.0'), /Tag must match/);
  assert.throws(() => releaseMetadata(pkg, { ...lock, version: '0.2.0' }, changelog), /Lockfile version/);
  assert.throws(() => releaseMetadata(pkg, { ...lock, packages: { '': { version: '0.2.0' } } }, changelog), /Lockfile root/);
  assert.throws(() => releaseMetadata(pkg, lock, '## 0.2.0\nOther version'), /heading/);
  assert.throws(() => releaseMetadata(pkg, lock, '## 0.1.0\n\n## 0.0.1\nOld'), /empty/);
});

test('prereleases use next and invalid version strings cannot reach shell or output files', () => {
  const version = '0.2.0-rc.1';
  const result = releaseMetadata({ ...pkg, version }, { version, packages: { '': { version } } }, `## ${version}\nPreview`);
  assert.equal(result.npmTag, 'next');
  assert.equal(result.prerelease, true);
  for (const version of ['01.0.0', '0.1.0-01', '0.1.0\n', '0.1.0\nother=value', '../0.1.0', '0.1.0;echo bad']) {
    assert.throws(() => releaseMetadata({ ...pkg, version }, lock, changelog), /Invalid release version/);
  }
});

test('publishing rejects changed archives, checksums, and filenames', () => {
  verifyArchive(metadata, info, archive, sums);
  assert.throws(() => verifyArchive(metadata, info, Buffer.from('different'), sums), /SHA-256/);
  assert.throws(() => verifyArchive(metadata, { ...info, integrity: 'wrong' }, archive, sums), /integrity/);
  assert.throws(() => verifyArchive(metadata, info, archive, 'wrong'), /Checksum/);
  assert.throws(() => verifyArchive(metadata, { ...info, filename: '../other.tgz' }, archive, sums));
});

test('the release CLI requires the checked-out tag commit to belong to main', async t => {
  const parent = resolve(tmpdir());
  const fixture = await mkdtemp(join(parent, 'liang-release-test-'));
  t.after(async () => {
    assert(resolve(fixture).startsWith(parent + sep));
    await rm(fixture, { recursive: true, force: true });
  });
  await mkdir(join(fixture, 'scripts'));
  for (const file of ['release.mjs', 'release-lib.mjs']) {
    await copyFile(new URL(`../scripts/${file}`, import.meta.url), join(fixture, 'scripts', file));
  }
  const git = args => {
    const result = spawnSync('git', args, { cwd: fixture, encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
  };
  const prepare = async version => {
    await writeFile(join(fixture, 'package.json'), JSON.stringify({ ...pkg, version }));
    await writeFile(join(fixture, 'package-lock.json'), JSON.stringify({ version, packages: { '': { version } } }));
    await writeFile(join(fixture, 'CHANGELOG.md'), `## ${version}\nRelease notes\n`);
    git(['add', '.']);
    git(['commit', '-qm', version]);
    git(['tag', `v${version}`]);
  };
  const cli = tag => spawnSync(process.execPath, ['scripts/release.mjs', 'metadata', '--tag', tag], {
    cwd: fixture, encoding: 'utf8', windowsHide: true, env: { ...process.env, GITHUB_OUTPUT: '' },
  });
  git(['init', '-q', '-b', 'main']);
  git(['config', 'user.email', 'release-test@example.invalid']);
  git(['config', 'user.name', 'Release test']);
  await prepare('0.1.0');
  git(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
  assert.equal(cli('v0.1.0').status, 0);
  assert.notEqual(cli('v0.2.0').status, 0);
  git(['switch', '-qc', 'unmerged']);
  await prepare('0.2.0');
  assert.notEqual(cli('v0.2.0').status, 0, 'A version tag outside main must be rejected.');
  git(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
  assert.equal(cli('v0.2.0').status, 0);
  await writeFile(join(fixture, 'later.txt'), 'A later commit');
  git(['add', 'later.txt']);
  git(['commit', '-qm', 'later']);
  git(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
  assert.notEqual(cli('v0.2.0').status, 0, 'A different checkout must not publish an older tag.');
});

test('npm reruns skip identical versions and refuse conflicts or registry errors', async () => {
  let calls = 0;
  assert.equal(await publishNpm(info, () => calls++, { request: published }), 'already-published');
  assert.equal(calls, 0);
  await assert.rejects(publishNpm(info, () => calls++, { request: () => Response.json({ dist: { integrity: 'different' } }) }), /different content/);
  await assert.rejects(publishNpm(info, () => calls++, { request: () => new Response('', { status: 503 }) }), /HTTP 503/);
  assert.equal(calls, 0);
  assert.equal(await npmReleaseState(info, () => new Response('', { status: 404 })), 'missing');
});

test('new npm releases publish once and wait for matching registry integrity', async () => {
  let requests = 0;
  let publishes = 0;
  let waits = 0;
  const result = await publishNpm(info, () => publishes++, {
    request: () => ++requests < 3 ? new Response('', { status: 404 }) : published(),
    wait: async () => { waits++; },
  });
  assert.equal(result, 'published');
  assert.equal(publishes, 1);
  assert.equal(waits, 1);
  await assert.rejects(publishNpm(info, () => {}, {
    request: () => new Response('', { status: 404 }), wait: async () => {},
  }), /not exposed/);
});

const assets = [{ name: metadata.filename, bytes: archive }, { name: 'SHA256SUMS', bytes: Buffer.from(sums) }];
test('npm validation can take minutes without repeating the upload', async () => {
  let requests = 0;
  let publishes = 0;
  let waits = 0;
  assert.equal(await publishNpm(info, () => publishes++, {
    request: () => ++requests < 85 ? new Response('', { status: 404 }) : published(),
    wait: async () => { waits++; },
  }), 'published');
  assert.equal(publishes, 1);
  assert.equal(waits, 83);
});

test('npm stops after its visibility window and still rejects different published content', async () => {
  let publishes = 0;
  let waits = 0;
  await assert.rejects(publishNpm(info, () => publishes++, {
    request: () => new Response('', { status: 404 }), wait: async () => { waits++; },
  }), /not exposed/);
  assert.equal(publishes, 1);
  assert.equal(waits, 120);
  let requests = 0;
  await assert.rejects(publishNpm(info, () => {}, {
    request: () => ++requests < 3 ? new Response('', { status: 404 })
      : Response.json({ dist: { integrity: 'different' } }),
    wait: async () => {},
  }), /different content/);
});

function githubFixture(initial) {
  let release = initial && { id: 42, tag_name: metadata.tag, ...structuredClone(initial) };
  const commands = [];
  const requests = [];
  return { commands, requests,
    api: async path => {
      requests.push(path);
      if (path.startsWith('releases/assets/')) return archive;
      if (path.startsWith('releases/tags/')) return release?.draft ? null : structuredClone(release);
      if (path.startsWith('releases?')) return release ? [structuredClone(release)] : [];
      if (path === 'releases/42') return structuredClone(release);
      throw new Error(`Unexpected GitHub API path: ${path}`);
    },
    run: args => {
      commands.push(args);
      if (args[1] === 'create') release = { id: 42, tag_name: metadata.tag, draft: true, prerelease: false, assets: [] };
      if (args[1] === 'upload') {
        const asset = assets.find(asset => `dist/${asset.name}` === args[3]);
        release.assets.push({ id: release.assets.length + 1, name: asset.name, digest: `sha256:${sha256(asset.bytes)}` });
      }
      if (args[1] === 'edit') release.draft = false;
    },
  };
}

test('GitHub creates a draft, uploads reviewed files, verifies them and publishes last', async () => {
  const fixture = githubFixture(null);
  assert.equal(await publishGithub(metadata, assets, fixture), 'published');
  assert.deepEqual(fixture.commands.map(command => command[1]), ['create', 'upload', 'upload', 'edit']);
  assert(fixture.commands[0].includes('--verify-tag'));
  assert(fixture.commands[0].includes('--draft'));
  assert(fixture.requests.includes('releases?per_page=100&page=1'));
  assert.equal(fixture.requests.at(-1), 'releases/42');
});

test('GitHub reruns complete a partial draft and do not replace verified assets', async () => {
  const fixture = githubFixture({ draft: true, prerelease: false,
    assets: [{ id: 1, name: assets[0].name, digest: null }] });
  assert.equal(await publishGithub(metadata, assets, fixture), 'published');
  assert.deepEqual(fixture.commands.map(command => command[1]), ['upload', 'edit']);
  assert.equal(fixture.commands[0][3], 'dist/SHA256SUMS');
});

test('GitHub waits for a newly created draft without creating it twice', async () => {
  const fixture = githubFixture(null);
  let waits = 0;
  assert.equal(await publishGithub(metadata, assets, {
    ...fixture,
    api: async path => {
      if (path.startsWith('releases?') && waits < 2) return [];
      return fixture.api(path);
    },
    wait: async () => { waits++; },
  }), 'published');
  assert.equal(waits, 2);
  assert.deepEqual(fixture.commands.map(command => command[1]), ['create', 'upload', 'upload', 'edit']);
});

test('GitHub stops when a created draft never becomes visible', async () => {
  const fixture = githubFixture(null);
  let waits = 0;
  await assert.rejects(publishGithub(metadata, assets, {
    ...fixture,
    api: async path => path.startsWith('releases?') ? [] : fixture.api(path),
    wait: async () => { waits++; },
  }), /did not create a draft/);
  assert.equal(waits, 12);
  assert.deepEqual(fixture.commands.map(command => command[1]), ['create']);
});

test('GitHub finds an older draft on subsequent release pages without creating a duplicate', async () => {
  const fixture = githubFixture({ draft: true, prerelease: false, assets: [] });
  const pages = [];
  assert.equal(await publishGithub(metadata, assets, { ...fixture, api: async path => {
    if (path.startsWith('releases?')) pages.push(path);
    if (path === 'releases?per_page=100&page=1') {
      return Array.from({ length: 100 }, (_, i) => ({ tag_name: `unrelated-${i}` }));
    }
    return fixture.api(path);
  } }), 'published');
  assert.deepEqual(pages, ['releases?per_page=100&page=1', 'releases?per_page=100&page=2']);
  assert.deepEqual(fixture.commands.map(command => command[1]), ['upload', 'upload', 'edit']);
});

test('GitHub public releases are checked without modification; missing or different files stop the run', async () => {
  const complete = { draft: false, prerelease: false,
    assets: assets.map((asset, i) => ({ id: i + 1, name: asset.name, digest: `sha256:${sha256(asset.bytes)}` })) };
  const fixture = githubFixture(complete);
  assert.equal(await publishGithub(metadata, assets, fixture), 'already-published');
  assert.deepEqual(fixture.commands, []);
  await assert.rejects(publishGithub(metadata, assets, githubFixture({ ...complete, assets: [] })), /missing/);
  await assert.rejects(publishGithub(metadata, assets, githubFixture({ ...complete,
    assets: [{ id: 1, name: assets[0].name, digest: 'sha256:wrong' }] })), /differs/);
});

test('GitHub never publishes a draft if uploaded files cannot be verified', async () => {
  const fixture = githubFixture({ draft: true, prerelease: false, assets: [] });
  const commands = [];
  await assert.rejects(publishGithub(metadata, assets, { ...fixture, run: args => commands.push(args) }), /upload missing/);
  assert(!commands.some(command => command[1] === 'edit'));
});
