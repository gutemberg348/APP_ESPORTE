import { env } from '../src/config/env.js';
import { loadSicrediCertificate } from '../src/payments/sicredi/transport.js';
import { createSicrediClient } from '../src/payments/sicredi/client.js';
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
    } else if (command === 'webhook') {
      const target = new URL(env.SICREDI_PIX_WEBHOOK_URL);
      if (target.protocol !== 'https:' || target.username || target.password || target.search || target.hash || !target.pathname.replace(/\/$/, '').endsWith('/v1/payments/webhooks/sicredi')) throw new Error('SICREDI_PIX_WEBHOOK_URL deve terminar em /v1/payments/webhooks/sicredi, via HTTPS e sem token/query.');
      const webhookUrl = `${target.href.replace(/\/$/, '')}/${env.SICREDI_PIX_WEBHOOK_TOKEN}`;
      const previous = await api.webhook();
      if (previous?.webhookUrl && previous.webhookUrl.replace(/\/$/, '') !== webhookUrl) throw new Error('Esta chave Pix já tem outro webhook. Ele foi preservado. Use receptor central compartilhado ou conciliação por consultas periódicas.');
      if (!previous?.webhookUrl) await api.configureWebhook(webhookUrl);
      const confirmed = await api.webhook();
      if (confirmed?.webhookUrl?.replace(/\/$/, '') !== webhookUrl) throw new Error('O banco ainda não confirmou a configuração do webhook.');
      console.log('Webhook Sicredi conferido. O endereço privado e o token não serão exibidos.');
    } else throw new Error('Use diagnostico, token [escopo] ou webhook. Nenhum desses comandos cria cobrança ou envia Pix.');
  }
} catch (err) { console.error(`${err.code || 'SICREDI_CONFIGURATION'}: ${err.message}`); process.exitCode = 1; }
finally { api?.close(); }
