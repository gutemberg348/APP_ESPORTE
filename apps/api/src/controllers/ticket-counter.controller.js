import { ticketCounter as counter } from '../services/ticket-counter.js';
import { counterSaleSchema, counterResolutionSchema, terminalCommand } from '../validators/ticket-counter.js';
import { requireTerminalKey } from '../services/pagbank-counter.js';
import { env } from '../config/env.js';
import { counterTicketPdf } from '../lib/counter-ticket-pdf.js';
import { AppError } from '../lib/errors.js';

function publicOrder(order) {
  return { ...order, ingressos: order.ingressos.map(ticket => {
    if (order.statusPagamento === 'PAGO' && ticket.status === 'VENDIDO') return ticket;
    const { chaveQr, codigoPortaria, ...summary } = ticket;
    return summary;
  }) };
}
export const ticketCounterController = {
  terminalQueue: async ({ req, user, url }) => {
    requireTerminalKey(env.PAGBANK_TERMINAL_TOKEN, req.get('X-Terminal-Key'));
    return { data: await counter.terminalQueue(user.id, url.searchParams.get('includePix') === 'true') };
  },
  terminal: async ({ req, user, body }) => {
    requireTerminalKey(env.PAGBANK_TERMINAL_TOKEN, req.get('X-Terminal-Key'));
    return { data: await counter.terminal(user.id, terminalCommand.parse(body)) };
  },
  catalog: async () => ({ data: await counter.catalog() }),
  recent: async ({ user }) => ({ data: await counter.recent(user.id) }),
  receipt: async ({ user, url }) => ({ data: publicOrder(await counter.receipt(user.id, counterSaleSchema.shape.key.parse(url.searchParams.get('key')))) }),
  pix: async ({ user, url }) => ({ data: await counter.pix(user.id, counterSaleSchema.shape.key.parse(url.searchParams.get('key'))) }),
  sell: async ({ req, user, body }) => {
    const sale = counterSaleSchema.parse(body);
    if (sale.method === 'PAGBANK') requireTerminalKey(env.PAGBANK_TERMINAL_TOKEN, req.get('X-Terminal-Key'));
    return { data: publicOrder(await counter.sale(user.id, sale)) };
  },
  settle: async ({ user, body }) => {
    const { key, pay } = counterResolutionSchema.parse(body);
    return { data: publicOrder(await counter.settle(user.id, key, pay)) };
  },
  pdf: async ({ user, url }) => {
    const order = await counter.receipt(user.id, counterSaleSchema.shape.key.parse(url.searchParams.get('key')));
    if (order.statusPagamento !== 'PAGO') throw new AppError(409, 'COUNTER_UNPAID', 'Os bilhetes ficam disponíveis após confirmar o recebimento.');
    const file = await counterTicketPdf(order);
    return { data: { id: order.id, name: 'ingressos-' + order.id + '.pdf', mimeType: 'application/pdf', base64: file.toString('base64') } };
  },
};
