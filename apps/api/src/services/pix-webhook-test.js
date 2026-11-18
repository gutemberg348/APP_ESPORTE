import { randomUUID } from 'node:crypto';
import { AppError } from '../lib/errors.js';
import { serializable } from '../lib/business-rules.js';
import { createSicrediStore } from '../models/sicredi.store.js';
import { pixDecimal } from '../payments/sicredi/client.js';
import { checkPublicWebhook, sicrediWebhookAddress } from '../payments/sicredi/webhook-registration.js';

// Only this exception represents a completed test. All other failures propagate.
class SimulationComplete extends Error {
  constructor(state) { super('Pix simulation complete'); this.state = state; }
}

export async function testPixWebhook(db, settings, id, { readRegistration, fetcher = fetch, now = () => new Date() }) {
  if (settings.PAYMENT_MODE !== 'sicredi') throw new AppError(409, 'SICREDI_DISABLED', 'Ative o Pix Sicredi para testar o webhook.');
  const payable = () => ({
    id, provider: 'sicredi', environment: settings.SICREDI_PIX_ENV, state: 'PENDING',
    expiresAt: { gt: now() }, pixEndToEndId: null, refundRequestedAt: null, cancelRequestedAt: null,
    pixPayload: { not: null }, failureCode: null,
  });
  const unavailable = () => new AppError(409, 'PIX_TEST_UNAVAILABLE', 'Escolha um Pix gerado, pendente e dentro do prazo.');
  if (!await db.gatewayIntent.findFirst({ where: payable(), select: { id: true } })) throw unavailable();
  // Exercise HTTPS and the real public handler with empty notifications before taking a database lock.
  await checkPublicWebhook(settings, fetcher);
  let registration;
  try {
    const registered = await readRegistration();
    registration = !registered?.webhookUrl ? 'missing' :
      registered.webhookUrl.replace(/\/$/, '') === sicrediWebhookAddress(settings).url ? 'matched' : 'different';
  } catch { registration = 'unknown'; }
  try {
    await serializable(db, async tx => {
      const intent = await tx.gatewayIntent.findFirst({ where: payable() });
      if (!intent || !intent.providerReference) throw unavailable();
      if (intent.lockedUntil && intent.lockedUntil >= now()) throw new AppError(409, 'PIX_TEST_BUSY', 'A conciliação está em andamento. Tente novamente em instantes.');
      const receipt = {
        txid: intent.providerReference, endToEndId: 'E' + randomUUID().replaceAll('-', '').slice(0, 31),
        valor: pixDecimal(intent.amountCents), horario: now().toISOString(),
      };
      // The simulated worker can only read these two fixtures. It has no banking transport.
      const api = {
        charge: async txid => txid === receipt.txid ? {
          txid, chave: settings.SICREDI_PIX_RECEIVING_KEY, valor: { original: receipt.valor },
          status: 'CONCLUIDA', pix: [receipt],
        } : null,
        pix: async e2e => e2e === receipt.endToEndId ? receipt : null,
      };
      const simulation = createSicrediStore(tx, { settings, api, now, transaction: work => work(tx) });
      await simulation.webhook(settings.SICREDI_PIX_WEBHOOK_TOKEN, { pix: [receipt] });
      const notified = await tx.gatewayIntent.findUniqueOrThrow({ where: { id } });
      if (notified.wakeVersion !== intent.wakeVersion + 1) throw new AppError(409, 'PIX_TEST_NOTIFICATION_IGNORED', 'O webhook não reconheceu a cobrança.');
      await simulation.process(id);
      const after = await tx.gatewayIntent.findUniqueOrThrow({ where: { id } });
      if (after.state !== 'RECEIVED' || after.pixEndToEndId !== receipt.endToEndId || after.failureCode) {
        throw new AppError(409, 'PIX_TEST_NOT_SETTLED', 'O webhook recebeu o evento, mas as regras do pedido impediram a aprovação simulada.');
      }
      throw new SimulationComplete(after.state);
    });
  } catch (error) {
    if (!(error instanceof SimulationComplete)) throw error;
    return { publicCallback: 'ok', registration, simulatedState: error.state, orderChanged: false };
  }
}
