import { AppError } from '../lib/errors.js';
const fail = (code, message) => new AppError(503, code, message);
export function createShippingProvider({ settings, fetch: fetchImpl = globalThis.fetch }) {
  const base = settings.MELHOR_ENVIO_ENVIRONMENT === 'production' ? 'https://melhorenvio.com.br' : 'https://sandbox.melhorenvio.com.br';
  return {
    async postalCode(cep) {
      if (!/^\d{8}$/.test(cep)) throw new AppError(422, 'INVALID_POSTAL_CODE', 'Informe um CEP válido.');
      let row;
      try { const response = await fetchImpl(`https://viacep.com.br/ws/${cep}/json/`, { redirect: 'error', signal: AbortSignal.timeout(5000) }); if (!response.ok) throw new Error(); row = await response.json(); }
      catch { throw fail('POSTAL_CODE_UNAVAILABLE', 'Não foi possível consultar o CEP. Preencha o endereço manualmente.'); }
      if (row.erro || typeof row.uf !== 'string' || !/^[A-Z]{2}$/.test(row.uf) || typeof row.localidade !== 'string') throw new AppError(404, 'POSTAL_CODE_NOT_FOUND', 'CEP não encontrado. Confira ou preencha o endereço.');
      return { postalCode: cep, street: String(row.logradouro || '').slice(0, 150), district: String(row.bairro || '').slice(0, 100), city: row.localidade.slice(0, 100), state: row.uf };
    },
    async quote(origin, destination, items) {
      if (!settings.MELHOR_ENVIO_TOKEN || !settings.MELHOR_ENVIO_CONTACT_EMAIL) throw fail('SHIPPING_NOT_CONFIGURED', 'O frete automático ainda não foi configurado pela loja.');
      const body = { from: { postal_code: origin }, to: { postal_code: destination }, products: items.map(({ variant, quantity }) => ({ id: variant.id, width: variant.product.widthCm, height: variant.product.heightCm, length: variant.product.lengthCm, weight: variant.product.weightGrams / 1000, insurance_value: variant.product.priceCents / 100, quantity })), ...(settings.MELHOR_ENVIO_SERVICES ? { services: settings.MELHOR_ENVIO_SERVICES } : {}), options: { receipt: false, own_hand: false } };
      let data;
      try {
        const response = await fetchImpl(`${base}/api/v2/me/shipment/calculate`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${settings.MELHOR_ENVIO_TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': `SocioEsporte (${settings.MELHOR_ENVIO_CONTACT_EMAIL})` }, body: JSON.stringify(body) });
        if (!response.ok) throw new Error(); data = await response.json();
      } catch { throw fail('SHIPPING_UNAVAILABLE', 'Não foi possível calcular o frete agora. Tente novamente ou escolha retirada.'); }
      if (!Array.isArray(data)) throw fail('SHIPPING_INVALID_RESPONSE', 'O serviço de frete retornou uma resposta inválida.');
      return data.slice(0, 60).flatMap((row) => {
        const price = row.custom_price ?? row.price, days = row.custom_delivery_time ?? row.delivery_time;
        if (row.error || !/^\d{1,9}$/.test(String(row.id)) || !/^\d+(\.\d{1,2})?$/.test(String(price)) || !Number.isInteger(days) || days < 0 || days > 365) return [];
        const [whole, fraction = ''] = String(price).split('.'), amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
        if (!Number.isSafeInteger(amount) || amount < 0 || amount > 100000000) return [];
        return [{ id: `melhorenvio:${row.id}`, name: `${String(row.company?.name || '').slice(0, 70)} · ${String(row.name || '').slice(0, 70)}`, amountCents: amount, minDays: days, maxDays: days, testMode: settings.MELHOR_ENVIO_ENVIRONMENT !== 'production', packages: Array.isArray(row.packages) ? row.packages.slice(0, 50) : [] }];
      });
    },
  };
}
