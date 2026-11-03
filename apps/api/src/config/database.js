import { PrismaClient } from '../../generated/client/index.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from './env.js';

export const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL, max: 10, connectionTimeoutMillis: 5000 }),
});
