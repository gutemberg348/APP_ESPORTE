import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
import jsQR from 'jsqr';
const source = await readFile(new URL('../src/utils/gate-v1-input.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { gateV1Input } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`);
const require = createRequire(import.meta.url);
// Use the same encoder dependency as the ticket's local SVG QR component.
const encoderRequire = createRequire(require.resolve('react-native-qrcode-svg/package.json'));
const QRCode = encoderRequire('qrcode');
test('manual typing and keyboard barcode scanners normalize to the same V1 credential', () => {
  assert.equal(gateV1Input('  abcd 1234 ef56 7890\r\n'), 'ABCD-1234-EF56-7890');
  assert.equal(gateV1Input('ABCD-1234-EF56-7890'), 'ABCD-1234-EF56-7890');
  for (const code of ['', '12345', 'ABCD1234EF5678901', 'ZZZZ1234EF567890', 'https://example.com', '<script/>', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A'.repeat(1025)]) assert.throws(() => gateV1Input(code));
});
test('signed QR text keeps case and rejects truncated signatures', () => {
  const token = `INGV1.${Buffer.from(JSON.stringify({ v: 1, m: 'aBcD', n: 'xyZ' })).toString('base64url')}.${'Abc_-09'.repeat(6)}Z`;
  assert.equal(gateV1Input(token + '\r\n'), token);
  assert.throws(() => gateV1Input(token.slice(0, -1)));
});
test('local QR encoder and image decoder preserve the ticket token without sending it externally', () => {
  const value = `INGV1.${Buffer.from(JSON.stringify({ v: 1, m: 'a'.repeat(22), a: 'b'.repeat(22), b: 101, r: 'A', s: 10, t: 1794412800, n: 'c'.repeat(16) })).toString('base64url')}.${'S'.repeat(43)}`;
  const qr = QRCode.create(value, { errorCorrectionLevel: 'M' }), scale = 5, quiet = 4;
  const width = (qr.modules.size + quiet * 2) * scale, pixels = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let row = 0; row < qr.modules.size; row++) for (let col = 0; col < qr.modules.size; col++) if (qr.modules.get(row, col)) {
    for (let y = 0; y < scale; y++) for (let x = 0; x < scale; x++) {
      const i = (((row + quiet) * scale + y) * width + (col + quiet) * scale + x) * 4;
      pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;
    }
  }
  const decoded = jsQR(pixels, width, width);
  assert.equal(decoded?.data, value); assert.equal(gateV1Input(decoded.data), value);
});
