import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';

// A real adapter must create native splits, provide a valid Pix payload,
// verify signed/authenticated webhooks and reconcile the charge AND split.
// No bank details or keys are accepted from a customer or cashier request.
export const paymentGateway = {
  name: 'demo',
  async createCharge({ chargeId, expiresAt }) {
    if (env.PAYMENT_MODE !== 'demo' || env.NODE_ENV === 'production') {
      throw new AppError(503, 'GATEWAY_NOT_CONFIGURED', 'Cobrança Pix real ainda não habilitada.');
    }
    return { provider: 'demo', providerReference: `demo:${chargeId}`, pixPayload: null, expiresAt };
  },
  async verifyAndReconcileWebhook() {
    throw new AppError(503, 'GATEWAY_NOT_CONFIGURED', 'Nenhum gateway real está configurado.');
  },
};
