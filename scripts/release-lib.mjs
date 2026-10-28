import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export const REGISTRY = 'https://registry.npmjs.org';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function releaseMetadata(pkg, lock, changelog, tag) {
  assert.equal(pkg.name, 'dsh-liang-says');
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(pkg.version);
  assert(match && match[0] === pkg.version && !match[4]?.split('.').some(part => /^0\d+$/.test(part)), 'Invalid release version.');
  assert.equal(lock.version, pkg.version, 'Lockfile version must match package.json.');
  assert.equal(lock.packages[''].version, pkg.version, 'Lockfile root version must match package.json.');
  if (tag !== undefined) assert.equal(tag, `v${pkg.version}`, 'Tag must match package.json.');
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex(line => line.trim() === `## ${pkg.version}`);
  assert(start >= 0, 'CHANGELOG.md must contain a heading for this version.');
  const end = lines.findIndex((line, index) => index > start && /^##\s/.test(line));
  const notes = lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim();
  assert(notes, 'Release notes must not be empty.');
  return { name: pkg.name, version: pkg.version, tag: `v${pkg.version}`,
    filename: `${pkg.name}-${pkg.version}.tgz`, prerelease: !!match[4],
    npmTag: match[4] ? 'next' : 'latest', notes: notes + '\n' };
}

export function verifyArchive(metadata, info, archive, sums) {
  for (const key of ['name', 'version', 'filename']) assert.equal(info[key], metadata[key]);
  assert.equal(info.sha256, sha256(archive), 'Archive SHA-256 mismatch.');
  assert.equal(info.integrity, `sha512-${createHash('sha512').update(archive).digest('base64')}`, 'Archive integrity mismatch.');
  assert.equal(sums.trim(), `${info.sha256}  ${info.filename}`, 'Checksum file mismatch.');
}

export async function npmReleaseState(info, request = fetch) {
  const response = await request(`${REGISTRY}/${encodeURIComponent(info.name)}/${encodeURIComponent(info.version)}`, {
    signal: AbortSignal.timeout(30_000), headers: { 'Cache-Control': 'no-cache' },
  });
  if (response.status === 404) return 'missing';
  assert(response.ok, `npm registry returned HTTP ${response.status}; publication stopped.`);
  const published = await response.json();
  assert.equal(published.dist?.integrity, info.integrity, 'npm already has different content for this version.');
  return 'published';
}

export async function publishNpm(info, publish, { request = fetch, wait = () => new Promise(resolve => setTimeout(resolve, 2000)) } = {}) {
  if (await npmReleaseState(info, request) === 'published') return 'already-published';
  await publish();
  for (let attempt = 0; attempt < 6; attempt++) {
    if (await npmReleaseState(info, request) === 'published') return 'published';
    if (attempt < 5) await wait();
  }
  throw new Error('npm publish returned success, but the registry has not exposed this version yet. Re-run to verify.');
}

/** Resume a partial draft, but never replace an existing asset or public release. */
export async function publishGithub(metadata, assets, { api, run }) {
  const releasePath = `releases/tags/${encodeURIComponent(metadata.tag)}`;
  let release = await api(releasePath);
  if (!release) {
    run(['release', 'create', metadata.tag, '--verify-tag', '--draft', '--title', metadata.tag,
      '--notes-file', 'dist/release-notes.md', ...(metadata.prerelease ? ['--prerelease'] : [])]);
    release = await api(releasePath);
    assert(release?.draft, 'GitHub did not create a draft release.');
  }
  assert.equal(release.prerelease, metadata.prerelease, 'GitHub prerelease flag mismatch.');
  for (const asset of assets) {
    const remote = release.assets.find(item => item.name === asset.name);
    if (remote) {
      const digest = remote.digest ?? `sha256:${sha256(await api(`releases/assets/${remote.id}`, true))}`;
      assert.equal(digest, `sha256:${sha256(asset.bytes)}`, `GitHub asset differs: ${asset.name}`);
    } else {
      assert(release.draft, `Published release is missing ${asset.name}; refusing to alter it.`);
      run(['release', 'upload', metadata.tag, `dist/${asset.name}`]);
    }
  }
  if (release.draft) {
    // Re-read and verify all uploads before making the release public.
    const uploaded = await api(releasePath);
    for (const asset of assets) {
      const remote = uploaded.assets.find(item => item.name === asset.name);
      assert(remote, `GitHub upload missing: ${asset.name}`);
      const digest = remote.digest ?? `sha256:${sha256(await api(`releases/assets/${remote.id}`, true))}`;
      assert.equal(digest, `sha256:${sha256(asset.bytes)}`, `GitHub upload differs: ${asset.name}`);
    }
    run(['release', 'edit', metadata.tag, '--draft=false']);
    assert.equal((await api(releasePath)).draft, false, 'GitHub release is still a draft.');
    return 'published';
  }
  return 'already-published';
}
