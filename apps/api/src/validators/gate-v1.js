import { z } from 'zod';
const context = { partidaId: z.uuid(), alocacaoId: z.uuid() };
export const gateV1InspectSchema = z.object({ ...context, chaveQr: z.string().trim().min(4).max(1024) }).strict();
export const gateV1AdmitSchema = gateV1InspectSchema.extend({ catracaId: z.string().trim().min(1).max(50), requestKey: z.string().regex(/^[A-Za-z0-9_-]{16,80}$/) }).strict();
export const gateV1ReceiptSchema = z.object({ ...context, requestKey: z.string().regex(/^[A-Za-z0-9_-]{16,80}$/) }).strict();
export const gateV1AssignmentsSchema = z.object({ userId: z.uuid(), allocationIds: z.array(z.uuid()).max(200).refine((v) => new Set(v).size === v.length) }).strict();
export const gateV1HistorySchema = z.object({ kind: z.enum(['ALLOW', 'DENIED']).default('ALLOW'), protocol: z.uuid().optional(), search: z.string().trim().min(1).max(100).optional(), partidaId: z.uuid().optional(), alocacaoId: z.uuid().optional(), actorId: z.uuid().optional(), from: z.iso.datetime().optional(), to: z.iso.datetime().optional(), limit: z.coerce.number().int().min(1).max(100).default(30), offset: z.coerce.number().int().min(0).max(1000000).default(0) }).strict().refine((v) => !v.from || !v.to || v.from <= v.to, { message: 'O período final deve ser posterior ao inicial.', path: ['to'] });
