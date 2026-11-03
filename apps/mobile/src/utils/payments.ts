export const requestKey = () => `${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
export function parseAmount(value: string, allowZero = false) {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(normalized)) throw new Error('Informe um valor como 100,00.');
  const cents = Math.round(Number(normalized) * 100);
  if (cents < (allowZero ? 0 : 1) || cents > 100000000) throw new Error('Valor fora do limite permitido.');
  return cents;
}
export function parsePaymentQr(value: string): { type: 'sale' | 'merchant'; code: string } {
  const match = value.trim().match(/^nacional:\/\/(sale|merchant)\/([A-Za-z0-9_-]{20,100})$/);
  if (!match?.[1] || !match[2]) throw new Error('Leia o QR da venda do clube. O QR Pix é lido no aplicativo do seu banco.');
  if (match[1] === 'merchant' && !/^[a-f0-9-]{36}$/i.test(match[2])) throw new Error('QR da loja inválido.');
  return { type: match[1] as 'sale' | 'merchant', code: match[2] };
}
export const cashStatus = { PENDING: 'Aguardando pagamento', PAID: 'Pagamento confirmado', REFUNDED: 'Estornado', CANCELED: 'Cancelado', EXPIRED: 'Cobrança expirada' };
