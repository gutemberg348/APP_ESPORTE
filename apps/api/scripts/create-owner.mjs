import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { db } from '../src/config/database.js';
import { hashPassword } from '../src/lib/crypto.js';

const identity = z.object({ email: z.string().trim().toLowerCase().email().max(254), name: z.string().trim().min(2).max(100) });
try {
  const account = identity.safeParse({ email: process.argv[2], name: process.argv[3] });
  if (!account.success) throw new Error('Informe e-mail e nome. Envie a senha pelo terminal na entrada padrão.');
  const existing = await db.user.findUnique({ where: { email: account.data.email } });
  if (existing) {
    if (existing.role !== 'OWNER' || !existing.active) throw new Error('Este e-mail já pertence a outra conta ou está desativado. Use um e-mail exclusivo da empresa.');
    console.log('O administrador geral já existe.');
  } else {
    const password = readFileSync(0, 'utf8').replace(/\r?\n$/, '');
    if (password.length < 14 || password.length > 128) throw new Error('Use uma senha de 14 a 128 caracteres.');
    const passwordHash = await hashPassword(password);
    await db.$transaction(async (tx) => {
      const owner = await tx.user.create({ data: { ...account.data, passwordHash, role: 'OWNER' } });
      await tx.auditLog.create({ data: { actorId: owner.id, entityId: owner.id, action: 'PLATFORM_OWNER_CREATED', details: {} } });
    });
    console.log('Administrador geral criado.');
  }
} catch (error) {
  console.error(error.code || error.message);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
