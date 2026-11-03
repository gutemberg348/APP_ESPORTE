import { paymentModel } from '../models/payment.model.js';
import { paymentGateway } from '../payments/gateway.js';
import { toCashWallet, toCharge } from '../lib/payment-serializers.js';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';

export const paymentService = {
  wallet: async (user, tenant = env.TENANT_SLUG) => ({ ...toCashWallet(await paymentModel.wallet(user.id, tenant)), demo: env.PAYMENT_MODE === 'demo' }),
  async merchantSetup(user) {
    const operators = await paymentModel.merchantSetup(user.id);
    return { demo: env.PAYMENT_MODE === 'demo', enabled: env.PAYMENT_MODE !== 'disabled', merchants: operators.map(({ merchant }) => ({ id: merchant.id, name: merchant.name, fixedQr: `nacional://merchant/${merchant.publicCode}`, offers: merchant.offers.map((offer) => ({ id: offer.id, tenant: { slug: offer.tenant.slug, name: offer.tenant.name }, cashbackBps: offer.cashbackBps, commissionBps: offer.commissionBps, customerQrEnabled: offer.customerQrEnabled })) })) };
  },
  merchantCharges: async (user) => (await paymentModel.merchantCharges(user.id)).map(toCharge),
  merchantCreate: async (user, input) => toCharge(await paymentModel.createCharge(user.id, input, 'CASHIER_QR')),
  customerCreate: async (user, input, tenant = env.TENANT_SLUG) => toCharge(await paymentModel.createCharge(user.id, input, 'CUSTOMER_QR', tenant)),
  resolve: async (user, code) => toCharge(await paymentModel.resolveSale(user.id, code)),
  claim: async (user, code) => toCharge(await paymentModel.claimSale(user.id, code)),
  ownCharge: async (user, id) => toCharge(await paymentModel.ownCharge(user.id, id)),
  async simulate(user, input) {
    if (env.NODE_ENV === 'production' || env.PAYMENT_MODE !== 'demo') throw new AppError(403, 'SIMULATION_DISABLED', 'Simulação de pagamentos desabilitada.');
    return paymentModel.simulateEvent(user.id, input);
  },
  async webhook(req, body) {
    const verified = await paymentGateway.verifyAndReconcileWebhook(req, body);
    return paymentModel.applyVerifiedEvent(verified);
  },
};
