import { timingSafeEqual, createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { AppError } from '../lib/errors.js';

export function cents(value) {
  const text = typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new AppError(409, 'ASAAS_INVALID_AMOUNT', 'O provedor retornou um valor monetário inválido.');
  const [whole, fraction = ''] = text.split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(result)) throw new AppError(409, 'ASAAS_INVALID_AMOUNT', 'Valor do provedor fora do limite.');
  return result;
}
export function validTaxId(value) {
  const digits = String(value).replace(/\D/g, '');
  if (!/^(\d{11}|\d{14})$/.test(digits) || /^(\d)\1+$/.test(digits)) return false;
  const check = (base, weights) => { const rest = [...base].reduce((sum, digit, index) => sum + Number(digit) * weights[index], 0) % 11; return rest < 2 ? '0' : String(11 - rest); };
  const firstWeights = digits.length === 11 ? [10, 9, 8, 7, 6, 5, 4, 3, 2] : [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const base = digits.slice(0, -2), first = check(base, firstWeights), second = check(base + first, [digits.length === 11 ? 11 : 6, ...firstWeights]);
  return digits === base + first + second;
}
export function protectDocument(secret) {
  const key = createHash('sha256').update(secret).digest();
  return {
    encrypt(value) { const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv); const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64'); },
    decrypt(value) { const bytes = Buffer.from(value, 'base64'), decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12)); decipher.setAuthTag(bytes.subarray(12, 28)); return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'); },
  };
}
export function authenticateAsaasWebhook(header, expected) {
  if (typeof header !== 'string' || !expected || header.length > 255) throw new AppError(401, 'INVALID_WEBHOOK_TOKEN', 'Webhook não autenticado.');
  const actualHash = createHash('sha256').update(header).digest(), expectedHash = createHash('sha256').update(expected).digest();
  if (!timingSafeEqual(actualHash, expectedHash)) throw new AppError(401, 'INVALID_WEBHOOK_TOKEN', 'Webhook não autenticado.');
}
export function createAsaasClient({ apiKey, environment, timeoutMs = 10000, fetch: fetchImpl = globalThis.fetch }) {
  const base = environment === 'production' ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3';
  async function request(path, { method = 'GET', body } = {}) {
    if (!apiKey) throw new AppError(503, 'ASAAS_NOT_CONFIGURED', 'Configure a integração Asaas no servidor.');
    let response;
    try { response = await fetchImpl(`${base}${path}`, { method, redirect: 'error', headers: { access_token: apiKey, 'User-Agent': 'SocioEsporte/0.1.0', Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(timeoutMs) }); }
    catch { throw new AppError(503, 'ASAAS_UNCERTAIN', 'O Asaas não respondeu. A conciliação verificará a operação antes de qualquer nova cobrança.'); }
    let result;
    try { result = await response.json(); } catch { throw new AppError(503, 'ASAAS_UNCERTAIN', 'Resposta inconclusiva do Asaas. Aguarde a conciliação.'); }
    if (!response.ok) {
      const status = response.status;
      throw new AppError(status === 429 || status >= 500 ? 503 : 422, status >= 500 || status === 429 ? 'ASAAS_UNCERTAIN' : status === 401 || status === 403 ? 'ASAAS_ACCESS_DENIED' : status === 404 ? 'ASAAS_NOT_FOUND' : 'ASAAS_REJECTED', status === 401 || status === 403 ? 'O Asaas recusou a credencial ou a permissão da conta.' : 'O Asaas recusou a operação. Confira o cadastro e a configuração da conta.');
    }
    return result;
  }
  const safeId = (id) => { if (!/^[A-Za-z0-9_-]{3,100}$/.test(id)) throw new AppError(422, 'INVALID_PROVIDER_ID', 'Identificador Asaas inválido.'); return encodeURIComponent(id); };
  return {
    request,
    findCustomer: (reference) => request(`/customers?externalReference=${encodeURIComponent(reference)}&limit=100`),
    createCustomer: (body) => request('/customers', { method: 'POST', body }),
    findPayments: (reference) => request(`/payments?externalReference=${encodeURIComponent(reference)}&limit=100`),
    createPayment: (body) => request('/payments', { method: 'POST', body }),
    payment: (id) => request(`/payments/${safeId(id)}`),
    updatePayment: (id, body) => request(`/payments/${safeId(id)}`, { method: 'PUT', body }),
    pix: (id) => request(`/payments/${safeId(id)}/pixQrCode`),
    cancel: (id) => request(`/payments/${safeId(id)}`, { method: 'DELETE' }),
    refund: (id, value) => request(`/payments/${safeId(id)}/refund`, { method: 'POST', body: { value, description: 'Devolução de pagamento pela plataforma Sócio Esporte' } }),
  };
}
