import { z } from 'zod';
import { validTaxId } from '@nacional/shared/forms';

export const counterSaleSchema = z.object({
  key: z.string().regex(/^[a-zA-Z0-9_-]{16,80}$/),
  cpf: z.string().regex(/^[\d.-]{11,14}$/).transform(s => s.replace(/\D/g, '')).refine(s => s.length === 11 && validTaxId(s), 'Informe um CPF válido.'),
  lotId: z.uuid(), unitCents: z.number().int().nonnegative(), quantity: z.number().int().min(1).max(10),
  method: z.enum(['CASH','CARD','PIX','PAGBANK']),
  seat: z.object({ block: z.number().int().positive(), row: z.string().trim().toUpperCase().regex(/^[A-Z]{1,10}$/), first: z.number().int().positive() }).strict().optional(),
}).strict();

export const counterResolutionSchema = z.object({ key: counterSaleSchema.shape.key, pay: z.boolean() }).strict();

const terminalAttempt = z.object({ key: counterSaleSchema.shape.key, attempt: z.uuid() }).strict();
export const terminalCommand = z.discriminatedUnion('action', [
  terminalAttempt.extend({ action: z.literal('begin') }),
  terminalAttempt.extend({ action: z.literal('approved'), reference: z.string().regex(/^[0-9A-F]{10}$/),
    amountCents: z.number().int().positive(), transaction: z.string().regex(/^[a-zA-Z0-9._-]{1,100}$/) }),
  terminalAttempt.extend({ action: z.literal('declined'), reason: z.enum(['A001','A004','A202','A209','A242','S99','S899','REVIEWED_UNPAID','NOT_SUBMITTED']) }),
]);
