import { z } from 'zod';
import { db } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import { hashPassword } from '../src/lib/crypto.js';

try {
  const settings = z.object({
    ADMIN_EMAIL: z.string().trim().toLowerCase().email(),
    ADMIN_PASSWORD: z.string().min(12).max(128),
    ADMIN_NAME: z.string().trim().min(2).max(100).default('Administrador Nacional'),
  }).parse(process.env);
  const passwordHash = await hashPassword(settings.ADMIN_PASSWORD);
  const admin = await db.$transaction(async (tx) => {
    const current = await tx.user.findUnique({ where: { email: settings.ADMIN_EMAIL } });
    if (current && current.role !== 'ADMIN') throw new Error('Este e-mail pertence a uma conta de torcedor. Escolha um e-mail administrativo separado.');
    if (current && !current.active) throw new Error('A conta administrativa existente está desativada. Reative-a por outro administrador antes de usar este login.');
    const user = current || await tx.user.create({ data: { name: settings.ADMIN_NAME, email: settings.ADMIN_EMAIL, passwordHash, role: 'ADMIN', active: true } });
    await tx.tenant.upsert({ where: { slug: env.TENANT_SLUG }, update: {}, create: { slug: env.TENANT_SLUG, name: 'Nacional de Patos' } });
    await tx.plan.upsert({ where: { name: 'Sócio Canário' }, update: {}, create: { name: 'Sócio Canário', priceCents: 3990, discountPercent: 0 } });
    return user;
  });
  console.log(`Administrador configurado: ${admin.email}. Cadastre os jogos e setores no painel. Nenhuma conta ou partida fictícia foi criada.`);
} finally { await db.$disconnect(); }
