import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { parse } from 'dotenv';
const root = new URL('../', import.meta.url);
async function readEnv(path) { try { return parse(await readFile(new URL(path, root), 'utf8')); } catch { return {}; } }
const [api, mobile] = await Promise.all([readEnv('apps/api/.env'), readEnv('apps/mobile/.env')]);
const port = Number(api.PORT || 3333);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT inválida em apps/api/.env.');
const addresses = Object.entries(networkInterfaces()).flatMap(([name, values]) => values.filter((v) => v.family === 'IPv4' && !v.internal).map((v) => ({ name, address: v.address })));
console.log(`API local: http://localhost:${port}`);
let appUrl = 'URL inválida; confira apps/mobile/.env';
try { const url = new URL(mobile.EXPO_PUBLIC_API_URL || 'http://localhost:3333/v1'); appUrl = url.origin + url.pathname; } catch {}
console.log(`URL base do app: ${appUrl}`);
for (const item of addresses) console.log(`Rede ${item.name}: http://${item.address}:${port}`);
const results = await Promise.all(['health', 'ready', 'connection-check'].map(async (path) => {
  const started = performance.now();
  try {
    const post = path === 'connection-check';
    const response = await fetch(`http://127.0.0.1:${port}/${path}`, { signal: AbortSignal.timeout(4500), ...(post ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ probe: true }) } : {}) });
    const body = await response.json();
    const valid = response.ok && body.data?.status === (path === 'ready' ? 'ready' : 'ok') && (path === 'ready' || body.data.service === 'nacional-api') && (!post || body.data.method === 'POST');
    console.log(`${post ? 'POST' : 'GET'} /${path}: HTTP ${response.status}, ${Math.round(performance.now() - started)} ms${valid ? ' — OK' : ' — confira a API/banco'}`);
    return valid;
  }
  catch (error) { console.log(`/${path}: sem resposta (${error.cause?.code || error.name}).`); return false; }
}));
if (results.every(Boolean)) console.log('API, banco e envio JSON responderam. Se falhar durante Restarting, use npm run dev:api no modo estável. O modo automático fica em npm run dev:api:watch.');
else if (results[0] && !results[1]) console.log('A API respondeu, mas o banco não está pronto. Confira o PostgreSQL e DATABASE_URL.');
else if (results[0]) console.log('API e banco responderam, mas o teste de envio JSON falhou. Confira o terminal da API e se a versão atual foi carregada.');
else console.log('Confira o terminal da API (npm run dev:api). Este diagnóstico não inicia nem reinicia serviços.');
process.exitCode = results.every(Boolean) ? 0 : 1;
