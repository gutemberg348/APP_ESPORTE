import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3333),
  DATABASE_URL: z.string().startsWith('postgresql://'),
  CORS_ORIGINS: z.string().default('http://localhost:8081,http://localhost:8082'),
  CARD_TOKEN_SECRET: z.string().min(32),
  JWT_SECRET: z.string().min(64).max(512),
  JWT_ISSUER: z.string().min(3).max(200).default('nacional-api'),
  JWT_AUDIENCE: z.string().min(3).max(200).default('nacional-app'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(1800).default(900),
  TICKET_QR_SECRET: z.string().min(64).max(512),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
  PAYMENT_MODE: z.enum(['disabled', 'demo']).default('disabled'),
  TENANT_SLUG: z.string().regex(/^[a-z0-9-]{2,60}$/).default('nacional-patos'),
  TICKET_PAYMENT_INSTRUCTIONS: z.string().min(10).max(1000).default('Após reservar, apresente o número da reserva no atendimento do clube. O ingresso é emitido quando o administrador confirmar o pagamento recebido.'),
});
export function parseEnv(input) {
  const result = schema.parse(input);
  if (result.JWT_SECRET === result.CARD_TOKEN_SECRET) throw new Error('JWT_SECRET deve ser diferente do segredo da carteirinha.');
  if ([result.JWT_SECRET, result.CARD_TOKEN_SECRET].includes(result.TICKET_QR_SECRET)) throw new Error('TICKET_QR_SECRET deve ser exclusivo dos ingressos.');
  if (/development|change.?me|replace|exemplo/i.test(result.JWT_SECRET)) throw new Error('Configure JWT_SECRET com um segredo aleatório; execute npm run setup para gerar um.');
  if (result.NODE_ENV === 'production' && result.PAYMENT_MODE !== 'disabled') {
    throw new Error('O simulador de pagamentos não pode ser habilitado em produção.');
  }
  if (result.NODE_ENV === 'production' && result.CARD_TOKEN_SECRET.includes('development')) {
    throw new Error('Configure um CARD_TOKEN_SECRET próprio em produção.');
  }
  return { ...result, corsOrigins: result.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean) };
}
export const env = parseEnv(process.env);
