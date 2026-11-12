import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveBuildSettings, buildChildEnv, parseRequirements, prepareSigning } from '../../../scripts/local-app.mjs';

const brands = { esporte: { appName: 'Sócio Esporte' }, nacional: { appName: 'Sócio Canário' } };
const defaults = { EXPO_PUBLIC_API_URL: 'https://api-esporte.testes-techcode.shop/v1', EXPO_PUBLIC_CLUB: 'esporte', EXPO_PUBLIC_TENANT_SLUG: 'nacional-patos' };

test('installed app resolves public build settings with explicit precedence and blocks localhost/credentials', () => {
  const build = resolveBuildSettings([defaults, { EXPO_PUBLIC_API_URL: 'https://api.example.com/v1/' }, { EXPO_PUBLIC_CLUB: 'nacional', DATABASE_URL: 'private-database', EXPO_PUBLIC_DEMO_MODE: 'true' }], brands);
  assert.equal(build.publicEnv.EXPO_PUBLIC_API_URL, 'https://api.example.com/v1');
  assert.equal(build.publicEnv.EXPO_PUBLIC_CLUB, 'nacional');
  assert.equal(build.publicEnv.EXPO_PUBLIC_API_HOST_MODE, 'configured');
  assert.equal(build.publicEnv.EXPO_PUBLIC_DEMO_MODE, 'false');
  assert.equal(build.settings.DATABASE_URL, undefined);
  for (const url of ['http://api.example.com/v1', 'https://localhost/v1', 'https://127.0.0.1/v1', 'https://[::1]/v1', 'https://user:password@example.com/v1', 'https://api.example.com/v1?key=secret', 'https://api.example.com/v1#secret', 'https://api.example.com']) {
    assert.throws(() => resolveBuildSettings([defaults, { EXPO_PUBLIC_API_URL: url }], brands), /HTTPS/);
  }
  assert.throws(() => resolveBuildSettings([defaults, { EXPO_PUBLIC_CLUB: 'unknown' }], brands), /clube/);
});

test('build environment removes old public flags and prevents automatic development dotenv loading', () => {
  const config = resolveBuildSettings([defaults], brands);
  const result = buildChildEnv({ PATH: 'keep-path', EXPO_PUBLIC_API_URL: 'http://localhost:3333/v1', EXPO_PUBLIC_UNKNOWN: 'do-not-inline', EXPO_PUBLIC_DEMO_MODE: 'true' }, config.publicEnv);
  assert.equal(result.PATH, 'keep-path');
  assert.equal(result.EXPO_PUBLIC_UNKNOWN, undefined);
  assert.equal(result.EXPO_PUBLIC_DEMO_MODE, 'false');
  assert.equal(result.EXPO_NO_DOTENV, '1');
  assert.equal(result.NODE_ENV, 'production');
});

test('custom signing requires the complete existing identity and preserves exact passwords', () => {
  assert.throws(() => resolveBuildSettings([defaults, { ANDROID_KEYSTORE_PATH: 'release.jks' }], brands), /quatro/);
  const build = resolveBuildSettings([defaults, { ANDROID_KEYSTORE_PATH: 'release.jks', ANDROID_KEY_ALIAS: 'original', ANDROID_KEYSTORE_PASSWORD: ' password ', ANDROID_KEY_PASSWORD: ' key password ' }], brands);
  assert.equal(build.settings.ANDROID_KEYSTORE_PASSWORD, ' password ');
  assert.equal(build.settings.ANDROID_KEY_PASSWORD, ' key password ');
  assert.equal(build.publicEnv.ANDROID_KEYSTORE_PASSWORD, undefined);
});

test('Android requirements follow installed React Native rather than global Gradle versions', () => {
  assert.deepEqual(parseRequirements('compileSdk = "37"\nbuildTools = "37.0.0"\nndkVersion = "27.1.12297006"'), { compileSdk: '37', buildTools: '37.0.0', ndk: '27.1.12297006' });
  assert.throws(() => parseRequirements('compileSdk = "37"'), /buildTools/);
});

test('local signing is generated once, survives future builds and refuses partial/mismatched identities', async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), 'nacional-android-signing-'));
  t.after(async () => { const target = resolve(temporary); assert.ok(!relative(resolve(tmpdir()), target).startsWith('..') && basename(target).startsWith('nacional-android-signing-')); await rm(target, { recursive: true, force: true }); });
  let generated = 0;
  const options = { directory: temporary, settings: {}, packageId: 'br.com.nacional.sociocanario', generate: async (key) => { generated++; await writeFile(key.storeFile, 'test-fixture-no-real-certificate'); } };
  const first = await prepareSigning(options);
  const credentials = await readFile(join(temporary, 'credentials.json'), 'utf8');
  const second = await prepareSigning(options);
  assert.deepEqual(second, first); assert.equal(generated, 1);
  assert.equal(await readFile(join(temporary, 'credentials.json'), 'utf8'), credentials);
  await assert.rejects(prepareSigning({ ...options, packageId: 'another.app' }), /outro aplicativo/);
  await rm(first.storeFile);
  await assert.rejects(prepareSigning(options), /incompleta/);
  assert.equal(generated, 1, 'missing old keys must never be replaced silently');
});

test('plan mode performs no key generation, native prebuild or Gradle invocation', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../../../scripts/local-app.mjs', import.meta.url)), '--plan'], { encoding: 'utf8', env: { ...process.env, EXPO_PUBLIC_API_URL: defaults.EXPO_PUBLIC_API_URL, EXPO_PUBLIC_CLUB: 'esporte', EXPO_PUBLIC_TENANT_SLUG: 'nacional-patos', ANDROID_SDK_ROOT: join(tmpdir(), 'missing-local-app-sdk'), ANDROID_JAVA_HOME: join(tmpdir(), 'missing-local-app-jdk') } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Nenhuma etapa de geração foi executada/);
  assert.match(result.stdout, /:app:assembleRelease/);
  assert.doesNotMatch(result.stdout, /BUILD SUCCESSFUL|Chave Android criada/);
});
