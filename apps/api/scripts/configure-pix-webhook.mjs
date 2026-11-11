import { env } from '../src/config/env.js';
if (env.PAYMENT_MODE === 'sicredi') { process.argv[2] = 'webhook'; await import('./sicredi-pix.mjs'); }
else { console.error('Habilite e configure o provedor real em PAYMENT_MODE antes de cadastrar um webhook.'); process.exitCode = 1; }
