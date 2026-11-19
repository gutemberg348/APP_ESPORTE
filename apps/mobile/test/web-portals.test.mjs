import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/navigation/web-portals.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { webPortal, accountPortal, portalPaths } = await import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'));

test('canonical URLs, staff bookmarks and public invitation routes', () => {
  for (const [area, path] of Object.entries(portalPaths)) assert.equal(webPortal(path), area);
  for (const path of ['/portaria', '/bilheteria/', '/admin', '/acesso', '/administracao-geral/']) assert.equal(webPortal(path), 'staff');
  for (const path of ['/app', '/app/indicar', '/reset-password', '/unknown', '/acessos']) assert.equal(webPortal(path), 'app');
  assert.equal(webPortal('/app/parceiro/'), 'business');
});

test('restored sessions belong to their assigned area', () => {
  for (const role of ['ADMIN', 'GATE', 'TICKET_SELLER', 'CASHIER']) assert.equal(accountPortal(role), 'staff');
  assert.equal(accountPortal('OWNER'), 'staff');
  assert.equal(accountPortal('USER'), 'app');
  assert.equal(accountPortal('UNKNOWN'), null);
});
