import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../src/services/invitation-core.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { invitationFromUrl, storedInvitation, invitationLifetime } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`);
const code = '447be516-0f30-41a9-8129-c017a9c4fe31';
test('invitation accepts app route and dedicated deep link, rejects unrelated and ambiguous URLs', () => {
  for (const url of [`https://esporte.testes-techcode.shop/app?ref=${code}`, `nacional://invite?ref=${code}`, `http://localhost:8081/app?ref=${code}`]) assert.equal(invitationFromUrl(url), code);
  for (const url of [null, '', `https://host/admin?ref=${code}`, `nacional://auth/social?ref=${code}`, `javascript:alert(1)?ref=${code}`, 'https://host/app?ref=phone-or-email', `https://host/app?ref=${code}&ref=${code}`, `https://user:pass@host/app?ref=${code}`]) assert.equal(invitationFromUrl(url), null);
});
test('pending invitation expires after thirty days and rejects corrupt or future storage', () => {
  const now = Date.now();
  assert.equal(storedInvitation(JSON.stringify({ code, at: now - 1000 }), now), code);
  for (const value of ['broken', null, JSON.stringify({ code, at: now - invitationLifetime }), JSON.stringify({ code, at: now + 1000 }), JSON.stringify({ code: 'bad', at: now }), JSON.stringify({ code, at: 'yesterday' })]) assert.equal(storedInvitation(value, now), null);
});
