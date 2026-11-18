import { env } from '../src/config/env.js';
import { loadSicrediCertificate } from '../src/payments/sicredi/transport.js';
import { createSicrediClient } from '../src/payments/sicredi/client.js';
import { checkPublicWebhook, registerSicrediWebhook } from '../src/payments/sicredi/webhook-registration.js';
const command = process.argv[2] || 'diagnostico';
let api;
try {
  if (command === 'diagnostico') {
    const material = await loadSicrediCertificate(env);
    console.log(JSON.stringify({ certificate: 'valid', keyMatches: true, validTo: material.validTo, environment: env.SICREDI_PIX_ENV, enabled: env.PAYMENT_MODE === 'sicredi' }));
  } else {
    if (env.PAYMENT_MODE !== 'sicredi') throw new Error('Configure PAYMENT_MODE=sicredi e os dados privados antes de executar este comando.');
    api = createSicrediClient(env);
    if (command === 'token') {
      const scope = process.argv[3] || 'cob.read';
      if (!['cob.read', 'cob.write', 'pix.read', 'pix.write', 'webhook.read', 'webhook.write'].includes(scope)) throw new Error('Escopo não suportado por este diagnóstico.');
      console.log(JSON.stringify(await api.authenticate(scope))); // No token or credential is printed.
    } else if (command === 'verificar') {
      for (const scope of ['cob.read', 'cob.write', 'pix.read', 'pix.write', 'webhook.read', 'webhook.write']) {
        try { console.log(JSON.stringify(await api.authenticate(scope))); }
        catch (err) {
          console.error(JSON.stringify({ scope, authenticated: false, code: err.code || 'SICREDI_AUTH_FAILED' }));
          process.exitCode = 1;
        }
      }
      const { publicCallback } = await checkPublicWebhook(env);
      console.log(JSON.stringify({ environment: env.SICREDI_PIX_ENV, publicCallback, ok: !process.exitCode }));
    } else if (command === 'webhook') {
      console.log(JSON.stringify(await registerSicrediWebhook(env, api)));
    } else throw new Error('Use diagnostico, token [escopo], verificar ou webhook.');
  }
} catch (err) { console.error(`${err.code || 'SICREDI_CONFIGURATION'}: ${err.message}`); process.exitCode = 1; }
finally { api?.close(); }
