import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../src/services/social-login-core.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { readSocialCallback } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`);

test('social callback is bound to this app, exact route and active login attempt', () => {
  const ticket = 't'.repeat(43);
  assert.equal(readSocialCallback(`nacional://auth/social?attempt=mine&ticket=${ticket}`, 'mine'), ticket);
  for (const url of [`https://auth/social?attempt=mine&ticket=${ticket}`, `other://auth/social?attempt=mine&ticket=${ticket}`, `nacional://auth/another?attempt=mine&ticket=${ticket}`, `nacional://auth/social?attempt=other&ticket=${ticket}`, 'nacional://auth/social?attempt=mine&ticket=short']) assert.throws(() => readSocialCallback(url, 'mine'));
  assert.equal(readSocialCallback('nacional://auth/social?attempt=mine&error=canceled', 'mine'), null);
  assert.throws(() => readSocialCallback('nacional://auth/social?attempt=mine&error=provider-private-message', 'mine'), error => !error.message.includes('provider-private-message'));
});
