import { z } from 'zod';
import { validTaxId } from '@nacional/shared/forms';
import { AppError } from '../lib/errors.js';
import { serializable } from '../lib/business-rules.js';

export const cpfSchema = z.string().regex(/^(?:\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2})$/, 'Informe um CPF válido.')
  .transform(value => value.replace(/\D/g, '')).refine(validTaxId, 'Informe um CPF válido.');
export const purchaseDocumentSchema = z.object({ cpf: cpfSchema }).strict();

export async function savePurchaseDocument(client, userId, cpf) {
  return serializable(client, async tx => {
    await tx.purchaseDocument.createMany({ data: [{ userId, cpf }], skipDuplicates: true });
    const saved = await tx.purchaseDocument.findUniqueOrThrow({ where: { userId } });
    if (saved.cpf !== cpf) throw new AppError(409, 'PURCHASE_CPF_EXISTS', 'Esta conta já tem outro CPF cadastrado.');
    return { hasPurchaseCpf: true };
  });
}

export async function requirePurchaseDocument(tx, userId) {
  const document = await tx.purchaseDocument.findUnique({ where: { userId }, select: { userId: true } });
  if (!document) throw new AppError(422, 'PURCHASE_CPF_REQUIRED', 'Informe seu CPF no app atualizado para continuar a compra.');
  return document.userId;
}
