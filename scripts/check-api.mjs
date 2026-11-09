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
const results = await Promise.all(['health', 'ready'].map(async (path) => {
  const started = performance.now();
  try { const response = await fetch(`http://127.0.0.1:${port}/${path}`, { signal: AbortSignal.timeout(4500) }); const body = await response.json(); const valid = response.ok && body.data?.status === (path === 'health' ? 'ok' : 'ready'); console.log(`/${path}: HTTP ${response.status}, ${Math.round(performance.now() - started)} ms${valid ? ' — OK' : ' — confira a API/banco'}`); return valid; }
  catch (error) { console.log(`/${path}: sem resposta (${error.cause?.code || error.name}).`); return false; }
}));
if (results.every(Boolean)) console.log('API e banco responderam. Se a tela ainda mostra um IP antigo, recarregue com Ctrl+F5; para limpar o cache do Expo web, use npm run web:clear.');
else if (results[0]) console.log('A API respondeu, mas o banco não está pronto. Confira o PostgreSQL e DATABASE_URL.');
else console.log('Confira o terminal da API (npm run dev:api). Este diagnóstico não inicia nem reinicia serviços.');
process.exitCode = results.every(Boolean) ? 0 : 1;
