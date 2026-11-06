import { env } from '../src/config/env.js';
import { createAsaasClient } from '../src/payments/asaas-client.js';
import { configureAsaasWebhook } from '../src/payments/asaas-webhook-setup.js';
try {
  const result = await configureAsaasWebhook(createAsaasClient({ apiKey: env.ASAAS_API_KEY, environment: env.ASAAS_ENVIRONMENT, timeoutMs: env.ASAAS_TIMEOUT_MS }), env);
  console.log(`Webhook ${result.created ? 'criado' : 'atualizado'} no ambiente ${result.environment}. ID: ${result.id}`);
  if (result.interrupted) console.log('A fila está interrompida. Confira os logs do Asaas e reative-a após corrigir a causa.');
} catch (err) { console.error(err.code || 'ASAAS_WEBHOOK_SETUP_FAILED', err.message); process.exitCode = 1; }
