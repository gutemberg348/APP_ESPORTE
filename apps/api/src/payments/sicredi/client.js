import { AppError } from '../../lib/errors.js';
import { createSicrediTransport } from './transport.js';

export const txidPattern = /^[A-Za-z0-9]{26,35}$/;
export const e2ePattern = /^E[A-Za-z0-9]{31}$/;
export function pixCents(value) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,7})\.[0-9]{2}$/.test(value)) throw new AppError(409, 'SICREDI_AMOUNT_INVALID', 'Valor bancário inválido.');
  const [whole, fraction] = value.split('.');
  return Number(whole) * 100 + Number(fraction);
}
export const pixDecimal = (cents) => {
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 2147483647) throw new AppError(422, 'SICREDI_AMOUNT_INVALID', 'Valor do Pix inválido.');
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
};
const scopes = { create: 'cob.write', charge: 'cob.read', cancel: 'cob.write', pix: 'pix.read', refund: 'pix.write', refundStatus: 'pix.read', webhook: 'webhook.read', configureWebhook: 'webhook.write' };
export function createSicrediClient(settings, { transport = createSicrediTransport(settings), now = () => Date.now() } = {}) {
  const tokens = new Map(), pending = new Map();
  const base = settings.SICREDI_PIX_API_URL.replace(/\/$/, '');
  async function token(scope) {
    const cached = tokens.get(scope); if (cached?.until > now()) return cached.value;
    if (!pending.has(scope)) pending.set(scope, (async () => {
      const { data } = await transport.send({ url: settings.SICREDI_PIX_AUTH_URL, method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${settings.SICREDI_PIX_CLIENT_ID}:${settings.SICREDI_PIX_CLIENT_SECRET}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', scope }).toString() });
      if (!data || data.token_type?.toLowerCase() !== 'bearer' || typeof data.access_token !== 'string' || !/^[^\s]{10,12000}$/.test(data.access_token) || !Number.isFinite(Number(data.expires_in)) || Number(data.expires_in) <= 0) throw new AppError(503, 'SICREDI_TOKEN_INVALID', 'Token bancário inválido.');
      const seconds = Number(data.expires_in);
      tokens.set(scope, { value: data.access_token, until: now() + Math.max(0, seconds - Math.min(30, seconds / 10)) * 1000 });
      return data.access_token;
    })().catch((err) => { err.sicrediAuthenticationFailure = true; throw err; }).finally(() => pending.delete(scope)));
    return pending.get(scope);
  }
  async function call(operation, method, path, body) {
    const scope = scopes[operation];
    try { const result = await transport.send({ url: `${base}${path}`, method, headers: { Authorization: `Bearer ${await token(scope)}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body }); return result.data; }
    catch (err) { if (err.code === 'SICREDI_ACCESS_DENIED') tokens.delete(scope); throw err; } // Never blindly repeat monetary calls.
  }
  function checked(value, pattern) { if (!pattern.test(value || '')) throw new AppError(422, 'SICREDI_REFERENCE_INVALID', 'Referência Pix inválida.'); return value; }
  return {
    authenticate: (scope = 'cob.read') => token(scope).then(() => ({ authenticated: true, scope })),
    charge: (txid) => call('charge', 'GET', `/cob/${checked(txid, txidPattern)}`),
    create: (txid, amountCents, expiresSeconds, description) => call('create', 'PUT', `/cob/${checked(txid, txidPattern)}`, { calendario: { expiracao: Math.max(1, Math.min(86400, Math.floor(expiresSeconds))) }, valor: { original: pixDecimal(amountCents), modalidadeAlteracao: 0 }, chave: settings.SICREDI_PIX_RECEIVING_KEY, solicitacaoPagador: description.slice(0, 140) }),
    cancel: (txid) => call('cancel', 'PATCH', `/cob/${checked(txid, txidPattern)}`, { status: 'REMOVIDA_PELO_USUARIO_RECEBEDOR' }),
    pix: (e2e) => call('pix', 'GET', `/pix/${checked(e2e, e2ePattern)}`),
    refund: (e2e, id, amount) => call('refund', 'PUT', `/pix/${checked(e2e, e2ePattern)}/devolucao/${checked(id, txidPattern)}`, { valor: pixDecimal(amount) }),
    refundStatus: (e2e, id) => call('refundStatus', 'GET', `/pix/${checked(e2e, e2ePattern)}/devolucao/${checked(id, txidPattern)}`),
    webhook: () => call('webhook', 'GET', `/webhook/${encodeURIComponent(settings.SICREDI_PIX_RECEIVING_KEY)}`),
    configureWebhook: (webhookUrl) => call('configureWebhook', 'PUT', `/webhook/${encodeURIComponent(settings.SICREDI_PIX_RECEIVING_KEY)}`, { webhookUrl }),
    close: () => transport.close?.(),
  };
}
