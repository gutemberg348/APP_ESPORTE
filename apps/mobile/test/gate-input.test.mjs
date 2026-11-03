import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../src/utils/gate-input.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { gateCredential } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`);

test('typed code normalizes case and spacing without treating ticket IDs as credentials', () => {
  assert.deepEqual(gateCredential('abcde-fghjk'), { code: 'ABCDEFGHJK' });
  assert.deepEqual(gateCredential(' ABCDE FGHJK '), { code: 'ABCDEFGHJK' });
  for (const value of ['', 'ABCDE', '00000-00000', '00000000-0000-4000-8000-000000000000']) assert.throws(() => gateCredential(value));
});
test('camera and pasted ticket JWTs preserve their signed content', () => {
  const token = 'signedHeader.signedPayload.signedSignature';
  assert.deepEqual(gateCredential(`nacional://ticket/${token}`), { token });
  assert.deepEqual(gateCredential(` ${token} `), { token });
  assert.throws(() => gateCredential('https://example.com/foreign-qr'));
  assert.throws(() => gateCredential('a'.repeat(2049) + '.b.c'));
});
