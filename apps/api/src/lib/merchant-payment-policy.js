import { AppError } from './errors.js';
// Null identifies a legacy merchant configured in the environment. An empty
// admin value explicitly disables that destination, even if the legacy key exists.
export function captureMerchantPolicy(offer, settings) {
  const environment = settings.ASAAS_ENVIRONMENT;
  const configured = environment === 'production' ? offer.merchant.asaasProductionWalletId : offer.merchant.asaasSandboxWalletId;
  return {
    environment,
    merchantWallet: configured ?? settings.asaasMerchantWallets?.[offer.merchantId] ?? null,
    cashbackBps: offer.cashbackBps,
    commissionBps: offer.commissionBps,
  };
}
export function paymentDestination(charge, prior, settings) {
  const environment = settings.ASAAS_ENVIRONMENT;
  if ((prior && prior.environment !== environment) || (charge.paymentPolicy && charge.paymentPolicy.environment !== environment))
    throw new AppError(409, 'ASAAS_ENVIRONMENT_MISMATCH', 'Esta venda pertence a outro ambiente de pagamento.');
  // An already issued intent always keeps its original beneficiary. For old
  // charges without a snapshot, only the original legacy environment map applies.
  const wallet = prior ? prior.snapshot.merchantWallet : charge.paymentPolicy ? charge.paymentPolicy.merchantWallet : settings.asaasMerchantWallets?.[charge.offer.merchantId];
  if (!wallet) throw new AppError(409, 'ASAAS_MERCHANT_NOT_CONFIGURED', 'O recebedor não estava configurado nesta venda. Configure o parceiro e gere uma nova venda.');
  return wallet;
}
