import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, basename } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parse } from 'dotenv';
import { parseEnv } from '../src/config/env.js';

test('setup explains denied access/copy and stops without creating environment files', async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), 'nacional-setup-'));
  t.after(async () => { const target = resolve(temporary); assert.ok(!relative(resolve(tmpdir()), target).startsWith('..') && basename(target).startsWith('nacional-setup-')); await rm(target, { recursive: true, force: true }); });
  await mkdir(join(temporary, 'scripts'));
  await copyFile(resolve(import.meta.dirname, '../../../scripts/setup.mjs'), join(temporary, 'scripts/setup.mjs'));
  for (const operation of ['access', 'copyFile']) {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import fs from 'node:fs/promises';
      import { syncBuiltinESMExports } from 'node:module';
      fs.access = async () => { throw Object.assign(new Error('denied'), { code: ${JSON.stringify(operation === 'access' ? 'EACCES' : 'ENOENT')} }); };
      fs.copyFile = async () => { throw Object.assign(new Error('denied'), { code: 'EACCES' }); };
      syncBuiltinESMExports();
      await import(${JSON.stringify(pathToFileURL(join(temporary, 'scripts/setup.mjs')).href)});
    `], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Sem permissão para preparar/);
    assert.doesNotMatch(result.stderr, /node:internal|at async/);
    await assert.rejects(readFile(join(temporary, '.env')), { code: 'ENOENT' });
  }
});

test('fresh container setup prepares database/admin/UID secrets and preserves them on repeated setup', async (t) => {
  const root = resolve(import.meta.dirname, '../../..');
  const temporary = await mkdtemp(join(tmpdir(), 'nacional-setup-'));
  t.after(async () => { const target = resolve(temporary); assert.ok(!relative(resolve(tmpdir()), target).startsWith('..') && basename(target).startsWith('nacional-setup-')); await rm(target, { recursive: true, force: true }); });
  for (const directory of ['scripts', 'apps/api', 'apps/mobile']) await mkdir(join(temporary, directory), { recursive: true });
  for (const file of ['scripts/setup.mjs', '.env.example', 'apps/api/.env.example', 'apps/mobile/.env.example']) await copyFile(join(root, file), join(temporary, file));
  const run = () => execFileSync(process.execPath, [join(temporary, 'scripts/setup.mjs')], { cwd: temporary, stdio: 'pipe' });
  run();
  const first = parse(await readFile(join(temporary, '.env'), 'utf8'));
  const api = parse(await readFile(join(temporary, 'apps/api/.env'), 'utf8'));
  assert.match(first.POSTGRES_PASSWORD, /^[a-f0-9]{64}$/);
  for (const key of ['CARD_TOKEN_SECRET', 'JWT_SECRET', 'TICKET_QR_SECRET', 'SICREDI_PIX_WEBHOOK_TOKEN', 'MAIL_DATA_SECRET']) assert.ok(first[key].length >= 64);
  assert.equal(first.ADMIN_PASSWORD, api.ADMIN_PASSWORD); assert.equal(first.ADMIN_EMAIL, api.ADMIN_EMAIL);
  assert.equal(first.API_UID, String(process.getuid?.() ?? 1000)); assert.equal(first.API_GID, String(process.getgid?.() ?? 1000));
  const certPath = '/run/sicredi/sicredi-multipag';
  parseEnv({ ...first, NODE_ENV: 'production', HOST: '0.0.0.0', PORT: '3333', DATABASE_URL: `postgresql://nacional:${first.POSTGRES_PASSWORD}@postgres:5432/nacional`, TRUST_PROXY: first.DOCKER_NETWORK_GATEWAY, SICREDI_PIX_CERT_PATH: certPath + '.cer', SICREDI_PIX_KEY_PATH: certPath + '.key', SICREDI_PIX_CHAIN_PATH: certPath + '-chain.cer' });
  assert.ok(!Object.keys(first).some((key) => key.startsWith('ASAAS_')));
  await writeFile(join(temporary, '.env'), (await readFile(join(temporary, '.env'), 'utf8')) + '\nCUSTOM_OPERATOR_VALUE=keep-me\n');
  run(); const second = parse(await readFile(join(temporary, '.env'), 'utf8'));
  for (const key of ['POSTGRES_PASSWORD', 'ADMIN_PASSWORD', 'CARD_TOKEN_SECRET', 'JWT_SECRET', 'TICKET_QR_SECRET', 'SICREDI_PIX_WEBHOOK_TOKEN', 'MAIL_DATA_SECRET', 'API_UID', 'API_GID']) assert.equal(second[key], first[key], `${key} must not rotate`);
  assert.equal(second.CUSTOM_OPERATOR_VALUE, 'keep-me');
});
