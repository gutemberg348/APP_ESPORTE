import { readFile } from 'node:fs/promises';
import { db } from '../src/config/database.js';
import { seedAppDemo } from './app-demo-core.js';
import { env } from '../src/config/env.js';
const args = process.argv.slice(2);
try {
  if (!args.includes('--confirm-test-data') || args.some(arg => !['--confirm-test-data', '--enable-shop'].includes(arg)))
    throw new Error('Uso: node prisma/seed-app-demo.js --confirm-test-data [--enable-shop]. Publica dados TESTE; pagamentos no Sicredi de produção movimentam dinheiro real.');
  const images = JSON.parse(await readFile(new URL('./shop-demo-images.json', import.meta.url), 'utf8'));
  console.log(JSON.stringify(await seedAppDemo(db, { images, enableShop: args.includes('--enable-shop'), tenantSlug: env.TENANT_SLUG })));
} catch (error) { console.error(error.code || error.message); process.exitCode = 1; }
finally { await db.$disconnect(); }
