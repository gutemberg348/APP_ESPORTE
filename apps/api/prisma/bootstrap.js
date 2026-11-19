import { z } from 'zod';
import { db } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import { hashPassword } from '../src/lib/crypto.js';
import { serializable } from '../src/lib/business-rules.js';
import { provisionOwner } from './bootstrap-owner.js';

try {
  const settings = z.object({
    ADMIN_EMAIL: z.string().trim().toLowerCase().email(),
    ADMIN_PASSWORD: z.string().min(12).max(128),
    ADMIN_NAME: z.string().trim().min(2).max(100).default('Administração geral'),
  }).parse(process.env);
  const passwordHash = await hashPassword(settings.ADMIN_PASSWORD);
  const admin = await serializable(db, async (tx) => {
    const user = await provisionOwner(tx, { email: settings.ADMIN_EMAIL, name: settings.ADMIN_NAME, passwordHash });
    await tx.tenant.upsert({ where: { slug: env.TENANT_SLUG }, update: {}, create: { slug: env.TENANT_SLUG, name: 'Nacional de Patos' } });
    await tx.plan.upsert({ where: { name: 'Sócio Canário' }, update: {}, create: { name: 'Sócio Canário', priceCents: 3990, discountPercent: 0 } });
    return user;
  });
  console.log(`Administrador geral (OWNER): ${admin.email}. Entre em /acesso/.`);
} finally { await db.$disconnect(); }
