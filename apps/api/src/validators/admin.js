import { z } from 'zod';
import { paginationSchema } from './index.js';
const label = z.string().trim().min(2).max(100);
const money = z.number().int().min(0).max(100000000);
const date = z.iso.datetime({ offset: true }).transform((value) => new Date(value));
const matchFields = {
  homeTeam: label, awayTeam: label, startsAt: date, stadium: label, competition: label,
  isHome: z.boolean(), published: z.boolean(), salesEnabled: z.boolean(),
  salesOpenAt: date.nullable().optional(), salesCloseAt: date.nullable().optional(),
  entryEnabled: z.boolean(), gateOpenAt: date.nullable().optional(), gateCloseAt: date.nullable().optional(),
};
export const matchCreateSchema = z.object({ ...matchFields, entryEnabled: z.boolean().default(false), isHome: z.boolean().default(true), published: z.literal(false).default(false), salesEnabled: z.boolean().default(true) }).strict();
export const matchUpdateSchema = z.union([
  z.object({ id: z.uuid(), openGateNow: z.literal(true) }).strict(),
  z.object({ id: z.uuid(), ...Object.fromEntries(Object.entries(matchFields).map(([key, value]) => [key, value.optional()])) }).strict(),
]);
export const sectorCreateSchema = z.object({ matchId: z.uuid(), name: label, priceCents: money, capacity: z.number().int().min(0).max(1000000), salesEnabled: z.boolean().default(true) }).strict();
export const sectorUpdateSchema = z.object({ id: z.uuid(), name: label.optional(), priceCents: money.optional(), capacity: z.number().int().min(0).max(1000000).optional(), salesEnabled: z.boolean().optional() }).strict();
export const planCreateSchema = z.object({ name: label, priceCents: money, active: z.boolean().default(true), description: z.string().trim().max(1000).default(''), durationDays: z.number().int().min(1).max(3660).default(30), discountPercent: z.number().int().min(0).max(100) }).strict();
export const planUpdateSchema = planCreateSchema.extend({ id: z.uuid() }).strict();
export const membershipSchema = z.object({ userId: z.uuid(), planId: z.uuid(), status: z.enum(['ACTIVE', 'PENDING', 'EXPIRED']), validUntil: date }).strict();
export const accountStatusSchema = z.object({ userId: z.uuid(), active: z.boolean() }).strict();
export const manualPaymentSchema = z.object({ ticketId: z.uuid(), receivedCents: money, reference: z.string().trim().min(5).max(100), gatewayFeeCents: money.default(0), paymentVerified: z.literal(true) }).strict();
export const idSchema = z.object({ ticketId: z.uuid() }).strict();
const saleIdentity = { ticketId: z.uuid(), revision: z.string().regex(/^[a-f0-9]{64}$/) };
export const saleQuoteSchema = z.object({ ...saleIdentity, sectorId: z.uuid(), quantity: z.number().int().min(1).max(4) }).strict();
export const saleUpdateSchema = saleQuoteSchema.extend({ expectedTotalCents: money, reason: z.string().trim().min(5).max(500) }).strict();
export const saleDeleteSchema = z.object({ ...saleIdentity, reason: z.string().trim().min(5).max(500) }).strict();
const entryFields = {
  token: z.string().min(40).max(2048).regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/).optional(),
  code: z.string().min(10).max(20).transform((value) => value.replace(/[\s-]/g, '').toUpperCase()).pipe(z.string().regex(/^[2-9A-HJ-NP-Z]{10}$/)).optional(),
  matchId: z.uuid(), sectorId: z.uuid(),
};
const oneCredential = (value) => Boolean(value.token) !== Boolean(value.code);
export const ticketCodeSchema = z.object(entryFields).strict().refine(oneCredential, 'Informe somente o QR ou o código digitável.');
export const admissionSchema = z.object({ ...entryFields, quantity: z.number().int().min(1).max(4), requestKey: z.string().regex(/^[A-Za-z0-9_-]{16,80}$/) }).strict().refine(oneCredential, 'Informe somente o QR ou o código digitável.');
export const admissionReceiptSchema = z.object({ ticketId: z.uuid(), matchId: z.uuid(), sectorId: z.uuid(), requestKey: z.string().regex(/^[A-Za-z0-9_-]{16,80}$/) }).strict();
export const adminQuerySchema = paginationSchema.extend({ search: z.string().trim().max(100).optional(), matchId: z.uuid().optional(), status: z.enum(['PENDING', 'ISSUED', 'USED', 'CANCELED', 'EXPIRED']).optional(), deleted: z.enum(['exclude', 'only', 'all']).default('exclude') }).strict();
export const ticketDirectorySchema = z.object({
  search: z.string().trim().max(100).optional(), matchId: z.uuid().optional(),
  channel: z.enum(['app', 'counter']).optional(), limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(100).refine(value => {
    const parts = value.split('|');
    return parts.length === 3 && z.iso.datetime().safeParse(parts[0]).success && z.uuid().safeParse(parts[1]).success && ['app', 'counter'].includes(parts[2]);
  }).optional(),
}).strict();
const reportFields = {
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(1000000000).default(0),
  matchId: z.uuid().optional(), sectorId: z.uuid().optional(),
  from: date.optional(), to: date.optional(),
};
const validPeriod = (value) => !value.from || !value.to || value.from <= value.to;
export const salesReportSchema = z.object({ ...reportFields, search: z.string().trim().max(100).optional(), status: z.enum(['PENDING', 'ISSUED', 'USED', 'CANCELED', 'EXPIRED']).optional(), deleted: z.enum(['exclude', 'only', 'all']).default('all'), payment: z.enum(['PAID', 'FREE', 'UNPAID']).optional() }).strict().refine(validPeriod, { message: 'O fim do período deve ser posterior ao início.', path: ['to'] });
const historyFields = { ...reportFields, actorId: z.uuid().optional(), protocol: z.uuid().optional() };
export const admissionHistorySchema = z.object({ ...historyFields, search: z.string().trim().max(100).optional() }).strict().refine(validPeriod, { message: 'O fim do período deve ser posterior ao início.', path: ['to'] });
export const denialHistorySchema = z.object(historyFields).strict().refine(validPeriod, { message: 'O fim do período deve ser posterior ao início.', path: ['to'] });
export const protocolSchema = z.object({ protocol: z.uuid() }).strict();
