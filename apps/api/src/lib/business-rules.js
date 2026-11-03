import { AppError } from './errors.js';

export const clubDay = (now = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(now);

export function ticketPrice(unitPriceCents, discountPercent, quantity) {
  if (!Number.isSafeInteger(unitPriceCents) || unitPriceCents < 0 || !Number.isInteger(discountPercent) || discountPercent < 0 || discountPercent > 100 || !Number.isInteger(quantity) || quantity < 1 || quantity > 4) {
    throw new AppError(422, 'INVALID_PRICE', 'Valor, desconto ou quantidade inválida.');
  }
  const total = Math.round(unitPriceCents * (100 - discountPercent) / 100) * quantity;
  if (!Number.isSafeInteger(total) || total > 2147483647) throw new AppError(422, 'INVALID_PRICE', 'Valor total fora do limite permitido.');
  return total;
}

export function assertAvailability(capacity, reserved, quantity) {
  if (!Number.isInteger(capacity) || capacity < 0 || reserved + quantity > capacity) {
    throw new AppError(409, 'SECTOR_SOLD_OUT', 'Não há lugares suficientes neste setor.');
  }
}

// Retry the entire transaction after a serialization failure, never just one write.
export async function serializable(client, work) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await client.$transaction(work, { isolationLevel: 'Serializable' }); }
    catch (error) { if (error.code !== 'P2034' || attempt === 2) throw error; }
  }
}
