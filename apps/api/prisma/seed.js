import { db } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import { hashPassword } from '../src/lib/crypto.js';
import { randomBytes } from 'node:crypto';
import demo from '@nacional/shared/demo.json' with { type: 'json' };

try {
  if (env.NODE_ENV === 'production') throw new Error('Seed demonstrativo desabilitado em produção.');
  const password = process.env.SEED_DEMO_PASSWORD;
  if (!password || password.length < 10) throw new Error('Defina SEED_DEMO_PASSWORD com pelo menos 10 caracteres.');
  const plan = await db.plan.upsert({ where: { name: demo.member.membership.plan.name }, update: {}, create: demo.member.membership.plan });
  const user = await db.user.upsert({ where: { email: demo.member.email }, update: {}, create: { name: demo.member.name, email: demo.member.email, city: demo.member.city, preferences: demo.member.preferences, avatar: demo.member.avatar, points: demo.member.points, passwordHash: await hashPassword(password) } });
  await db.pointEntry.upsert({ where: { userId_sourceKey: { userId: user.id, sourceKey: 'seed:opening' } }, update: {}, create: { userId: user.id, sourceKey: 'seed:opening', amount: user.points, reason: 'Saldo inicial de demonstração' } });
  await db.membership.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id, planId: plan.id, memberId: demo.member.membership.memberId, status: 'ACTIVE', validUntil: new Date(demo.member.membership.validUntil) } });
  const { id, sectors, ...matchData } = demo.match;
  const match = await db.match.upsert({ where: { slug: id }, update: {}, create: { ...matchData, published: true, slug: id, startsAt: new Date(matchData.startsAt) } });
  for (const { name, priceCents } of sectors) {
    await db.sector.upsert({ where: { matchId_name: { matchId: match.id, name } }, update: {}, create: { matchId: match.id, name, priceCents } });
  }
  for (const { id: slug, ...data } of demo.partners) await db.partner.upsert({ where: { slug }, update: {}, create: { slug, ...data } });
  for (const { id: slug, ...data } of demo.engagement.rewards) await db.reward.upsert({ where: { slug }, update: {}, create: { slug, ...data } });
  const tenant = await db.tenant.upsert({ where: { slug: 'nacional-patos' }, update: {}, create: { slug: 'nacional-patos', name: 'Nacional de Patos' } });
  const partner = await db.partner.findUnique({ where: { slug: 'farmacia' } });
  const merchant = await db.merchant.upsert({ where: { slug: 'farmacia-demo' }, update: {}, create: { slug: 'farmacia-demo', name: 'Farmácia Bem-Estar · demo', partnerId: partner?.id } });
  await db.merchantOffer.upsert({ where: { tenantId_merchantId: { tenantId: tenant.id, merchantId: merchant.id } }, update: {}, create: { tenantId: tenant.id, merchantId: merchant.id, cashbackBps: 1000, commissionBps: 200 } });
  await db.cashWallet.upsert({ where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } }, update: {}, create: { tenantId: tenant.id, userId: user.id, customerCode: `NC-${randomBytes(16).toString('hex').toUpperCase()}` } });
  // The consumer account does not get merchant permissions. Cashier has its own login.
  const cashier = await db.user.upsert({ where: { email: 'caixa@demo.nacional.local' }, update: {}, create: { name: 'Caixa demonstração', email: 'caixa@demo.nacional.local', passwordHash: await hashPassword(password) } });
  await db.merchantOperator.upsert({ where: { userId_merchantId: { userId: cashier.id, merchantId: merchant.id } }, update: {}, create: { userId: cashier.id, merchantId: merchant.id } });
  console.log(`Dados de demonstração criados. Login: ${demo.member.email} (senha no .env da API).`);
} finally { await db.$disconnect(); }
