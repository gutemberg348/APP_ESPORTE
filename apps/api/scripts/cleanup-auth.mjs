import { db } from '../src/config/database.js';
try {
  const result = await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  console.log(`${result.count} sessões vencidas removidas, com seus históricos de refresh.`);
  const codes = await db.ticketAccessCode.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  console.log(`${codes.count} códigos de entrada vencidos removidos.`);
} finally { await db.$disconnect(); }
