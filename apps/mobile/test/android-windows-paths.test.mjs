import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resetNativePathCache, withWindowsShortRoot } from '../../../scripts/android-windows-paths.mjs';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'nacional-android-paths-'));
  t.after(async () => {
    const target = resolve(directory);
    assert.ok(!relative(resolve(tmpdir()), target).startsWith('..') && basename(target).startsWith('nacional-android-paths-'));
    await rm(target, { recursive: true, force: true });
  });
  return directory;
}
async function file(root, path, value = 'generated fixture') {
  const target = join(root, path); await mkdir(resolve(target, '..'), { recursive: true }); await writeFile(target, value); return target;
}

test('short build mapping leaves occupied drives alone and releases its own alias on failure', async () => {
  const calls = [];
  const failure = new Error('build fixture failed');
  await assert.rejects(withWindowsShortRoot(process.cwd(), async (root) => { assert.equal(root, 'S:\\'); throw failure; }, {
    platform: 'win32', letters: 'RS', occupied: async (root) => root === 'R:\\',
    invoke: (command, args) => { calls.push({ command, args }); return { status: 0 }; },
  }), error => error === failure);
  assert.deepEqual(calls, [{ command: 'subst.exe', args: ['S:', resolve(process.cwd())] }, { command: 'subst.exe', args: ['S:', '/D'] }]);
});

test('short build mapping handles drive allocation races and does not change other platforms', async () => {
  const calls = [];
  const value = await withWindowsShortRoot(process.cwd(), async (root) => root, {
    platform: 'win32', letters: 'RS', occupied: async () => false,
    invoke: (command, args) => { calls.push(args); return { status: args[0] === 'R:' ? 1 : 0 }; },
  });
  assert.equal(value, 'S:\\'); assert.deepEqual(calls.map(args => args[0]), ['R:', 'S:', 'S:']);
  assert.equal(await withWindowsShortRoot('/repo', async root => root, { platform: 'linux', invoke: () => { throw new Error('must not execute'); } }), '/repo');
});

test('path migration clears only generated outputs, preserves signing/sources and is incremental', async (t) => {
  const directory = await fixture(t);
  const source = await file(directory, 'apps/mobile/android/app/src/main/MainApplication.kt', 'source');
  const signing = await file(directory, '.secrets/android/credentials.json', 'private fixture');
  const env = await file(directory, 'apps/mobile/.env', 'keep fixture');
  const outputs = ['apps/mobile/android/app/.cxx/old/CMakeCache.txt', 'apps/mobile/android/app/build/generated/autolinking/old.json', 'apps/mobile/android/build/generated/autolinking/autolinking.json', 'node_modules/@scope/native/android/.cxx/old/CMakeCache.txt', 'node_modules/native/android/.cxx/old/CMakeCache.txt'];
  for (const output of outputs) await file(directory, output);
  const removed = await resetNativePathCache(directory, 'R:\\');
  assert.equal(removed.length, 5);
  for (const output of outputs) await assert.rejects(readFile(join(directory, output)), { code: 'ENOENT' });
  assert.equal(await readFile(source, 'utf8'), 'source');
  assert.equal(await readFile(signing, 'utf8'), 'private fixture');
  assert.equal(await readFile(env, 'utf8'), 'keep fixture');
  const newOutput = await file(directory, outputs[0], 'new build');
  assert.deepEqual(await resetNativePathCache(directory, 'R:\\'), []);
  assert.equal(await readFile(newOutput, 'utf8'), 'new build');
  await resetNativePathCache(directory, 'S:\\');
  await assert.rejects(readFile(newOutput), { code: 'ENOENT' });
  await file(directory, outputs[0], 'old CMake cached configuration');
  await writeFile(join(directory, 'apps/mobile/android/.local-app-build-root.json'), JSON.stringify({ root: 'S:\\', version: 1 }));
  await resetNativePathCache(directory, 'S:\\');
  await assert.rejects(readFile(newOutput), { code: 'ENOENT' }, 'old native toolchain cache must be regenerated even when the drive letter is unchanged');
});

test('path migration validates junctions before clearing any output outside the workspace', async (t) => {
  const directory = await fixture(t), outside = await fixture(t);
  const output = await file(directory, 'apps/mobile/android/app/.cxx/cache.txt');
  const foreign = await file(outside, 'cache.txt', 'outside must survive');
  const link = join(directory, 'apps/mobile/android/app/build');
  await symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(resetNativePathCache(directory, 'R:\\'), /fora da pasta|vinculado/);
  assert.equal(await readFile(foreign, 'utf8'), 'outside must survive');
  assert.equal(await readFile(output, 'utf8'), 'generated fixture', 'preflight rejects all cleanup before first deletion');
  await rm(link); // Remove only the fixture link before cleaning its directories.
});

test('Windows SUBST shortens Node paths and Metro can follow the physical npm workspace junction', { skip: process.platform !== 'win32' }, async () => {
  const project = fileURLToPath(new URL('../../../', import.meta.url));
  let alias;
  await withWindowsShortRoot(project, async (shortRoot) => {
    alias = shortRoot;
    assert.equal(await realpath(shortRoot), await realpath(project));
    const result = spawnSync(process.execPath, [join(shortRoot, 'scripts/local-app.mjs'), '--plan'], { cwd: shortRoot, encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes('Nenhuma etapa de geração foi executada'));
    const resolved = spawnSync(process.execPath, ['-e', "console.log(require.resolve('expo/bin/cli'))"], { cwd: join(shortRoot, 'apps/mobile'), encoding: 'utf8', windowsHide: true });
    assert.equal(resolved.status, 0, resolved.stderr); assert.ok(resolved.stdout.startsWith(shortRoot));
    const metro = spawnSync(process.execPath, ['-e', `
      const { realpathSync } = require('node:fs');
      const config = require('./metro.config');
      const target = realpathSync.native('../../node_modules/@nacional/shared');
      console.log(JSON.stringify({ projectRoot: config.projectRoot, target, watchFolders: config.watchFolders }));
    `], { cwd: join(shortRoot, 'apps/mobile'), encoding: 'utf8', windowsHide: true });
    assert.equal(metro.status, 0, metro.stderr);
    const config = JSON.parse(metro.stdout.trim());
    assert.ok(config.projectRoot.startsWith(shortRoot));
    assert.ok(config.watchFolders.includes(config.target), 'Metro must watch the physical junction target even when the app uses a SUBST drive');
    assert.ok(config.watchFolders.includes(join(shortRoot, 'packages/shared')), 'Expo automatic monorepo folders must remain configured');
  });
  await assert.rejects(realpath(alias), { code: 'ENOENT' });
});
