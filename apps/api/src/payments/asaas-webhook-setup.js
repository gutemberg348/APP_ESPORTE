import { z } from 'zod';
export const asaasEvents = [
  'PAYMENT_CREATED', 'PAYMENT_UPDATED', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAYMENT_OVERDUE',
  'PAYMENT_DELETED', 'PAYMENT_RESTORED', 'PAYMENT_REFUNDED', 'PAYMENT_PARTIALLY_REFUNDED',
  'PAYMENT_REFUND_IN_PROGRESS', 'PAYMENT_REFUND_DENIED', 'PAYMENT_SPLIT_DONE', 'PAYMENT_SPLIT_CANCELLED',
  'PAYMENT_SPLIT_DIVERGENCE_BLOCK', 'PAYMENT_SPLIT_DIVERGENCE_BLOCK_FINISHED',
  'PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_CHARGEBACK_DISPUTE', 'PAYMENT_AWAITING_CHARGEBACK_REVERSAL',
];
export async function configureAsaasWebhook(api, settings) {
  if (settings.PAYMENT_MODE !== 'asaas') throw new Error('Habilite PAYMENT_MODE=asaas antes de configurar o webhook.');
  const url = z.url().parse(settings.ASAAS_WEBHOOK_URL), email = z.email().parse(settings.ASAAS_WEBHOOK_EMAIL);
  if (new URL(url).protocol !== 'https:' || new URL(url).pathname !== '/v1/payments/webhook') throw new Error('ASAAS_WEBHOOK_URL deve ser HTTPS e terminar em /v1/payments/webhook.');
  const name = `SocioEsporte-${settings.ASAAS_ENVIRONMENT}`;
  const list = await api.request('/webhooks?limit=100');
  if (list.hasMore) throw new Error('Consulte os webhooks existentes antes de provisionar outra configuração.');
  const matches = (list.data || []).filter((row) => row.name === name || row.url === url);
  if (matches.length > 1) throw new Error('Há mais de um webhook do app. Resolva a duplicidade no painel Asaas.');
  const body = { name, url, email, enabled: true, authToken: settings.ASAAS_WEBHOOK_TOKEN, sendType: 'SEQUENTIALLY', apiVersion: 3, events: asaasEvents };
  const previous = matches[0];
  // Updating a configuration does not silently reactivate a queue paused by errors.
  if (previous) {
    const id = z.uuid().parse(previous.id);
    await api.request(`/webhooks/${id}`, { method: 'PUT', body });
    return { id, created: false, interrupted: Boolean(previous.interrupted), environment: settings.ASAAS_ENVIRONMENT };
  }
  const result = await api.request('/webhooks', { method: 'POST', body: { ...body, interrupted: false } });
  return { id: result.id, created: true, interrupted: false, environment: settings.ASAAS_ENVIRONMENT };
}
