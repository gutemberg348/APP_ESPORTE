import { db } from '../src/config/database.js';
// Only temporary quotes are removed. Orders, payments, movements and audit remain.
try {
  const result = await db.shopShippingQuote.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 86400000) } } });
  console.log(`${result.count} cotações de frete vencidas há mais de 24 horas removidas.`);
} finally { await db.$disconnect(); }
