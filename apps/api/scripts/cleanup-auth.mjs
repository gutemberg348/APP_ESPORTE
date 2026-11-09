import { db } from '../src/config/database.js';
try {
  const result = await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  console.log(`${result.count} sessões vencidas removidas, com seus históricos de refresh.`);
  const codes = await db.ticketAccessCode.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  console.log(`${codes.count} códigos de entrada vencidos removidos.`);
  const resets = await db.passwordResetToken.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 30 * 86400000) } } });
  console.log(`${resets.count} recuperações vencidas há mais de 30 dias removidas, com suas entregas de email.`);
} finally { await db.$disconnect(); }
