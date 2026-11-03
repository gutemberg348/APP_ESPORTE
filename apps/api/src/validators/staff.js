import { z } from 'zod';
export const employeeCreateSchema = z.object({ name: z.string().trim().min(2).max(100), email: z.string().trim().toLowerCase().email().max(254), password: z.string().min(12).max(128) }).strict();
export const employeeUpdateSchema = z.object({ userId: z.uuid(), name: z.string().trim().min(2).max(100).optional(), active: z.boolean().optional() }).strict();
export const employeePasswordSchema = z.object({ userId: z.uuid(), password: z.string().min(12).max(128) }).strict();
export const employeeAssignmentsSchema = z.object({ userId: z.uuid(), sectorIds: z.array(z.uuid()).max(100).refine((values) => new Set(values).size === values.length, 'Não repita setores.') }).strict();
