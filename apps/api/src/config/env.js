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
  PAYMENT_MODE: z.enum(['disabled', 'demo', 'asaas', 'sicredi']).default('disabled'),
  SICREDI_PIX_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  SICREDI_PIX_API_URL: z.string().default(''),
  SICREDI_PIX_AUTH_URL: z.string().default(''),
  SICREDI_PIX_CLIENT_ID: z.string().default(''),
  SICREDI_PIX_CLIENT_SECRET: z.string().default(''),
  SICREDI_PIX_RECEIVING_KEY: z.string().max(140).default(''),
  SICREDI_PIX_CERT_PATH: z.string().default(''),
  SICREDI_PIX_KEY_PATH: z.string().default(''),
  SICREDI_PIX_CHAIN_PATH: z.string().default(''),
  SICREDI_PIX_CERT_PASSPHRASE: z.string().default(''),
  SICREDI_PIX_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(10000),
  SICREDI_PIX_TXID_PREFIX: z.string().regex(/^[A-Za-z0-9]{1,3}$/).default('ESP'),
  SICREDI_PIX_WEBHOOK_TOKEN: z.string().default(''),
  SICREDI_PIX_WEBHOOK_URL: z.string().default(''),
  ASAAS_ENVIRONMENT: z.enum(['sandbox', 'production']).default('sandbox'),
  ASAAS_API_KEY: z.string().default(''),
  ASAAS_WEBHOOK_TOKEN: z.string().default(''),
  ASAAS_WEBHOOK_URL: z.string().default(''),
  ASAAS_WEBHOOK_EMAIL: z.string().default(''),
  ASAAS_DATA_SECRET: z.string().default(''),
  ASAAS_MERCHANT_WALLETS: z.string().default('{}'),
  ASAAS_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(10000),
  PAYMENT_WORKER_INTERVAL_MS: z.coerce.number().int().min(1000).max(60000).default(3000),
  MELHOR_ENVIO_ENVIRONMENT: z.enum(['sandbox', 'production']).default('sandbox'),
  MELHOR_ENVIO_TOKEN: z.string().max(6000).default(''),
  MELHOR_ENVIO_CONTACT_EMAIL: z.union([z.literal(''), z.email()]).default(''),
  MELHOR_ENVIO_SERVICES: z.string().regex(/^(\d+(,\d+)*)?$/).max(100).default('1,2'),
  TENANT_SLUG: z.string().regex(/^[a-z0-9-]{2,60}$/).default('nacional-patos'),
  SMTP_ENABLED: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  SMTP_USER: z.string().default(''),
  SMTP_PASSWORD: z.string().default(''),
  SMTP_FROM_EMAIL: z.union([z.literal(''), z.email()]).default(''),
  SMTP_FROM_NAME: z.string().max(100).default('Sócio Esporte'),
  MAIL_DATA_SECRET: z.string().default(''),
  PASSWORD_RESET_PUBLIC_URL: z.url().default('http://localhost:8081/reset-password'),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(30).default(15),
  MAIL_WORKER_INTERVAL_MS: z.coerce.number().int().min(1000).max(60000).default(3000),
  TICKET_PAYMENT_INSTRUCTIONS: z.string().min(10).max(1000).default('Após reservar, apresente o número da reserva no atendimento do clube. O ingresso é emitido quando o administrador confirmar o pagamento recebido.'),
});
export function parseEnv(input) {
  const result = schema.parse(input);
  const resetUrl = new URL(result.PASSWORD_RESET_PUBLIC_URL);
  if (!['http:', 'https:'].includes(resetUrl.protocol) || resetUrl.username || resetUrl.password || resetUrl.search || resetUrl.hash) throw new Error('PASSWORD_RESET_PUBLIC_URL deve ser uma URL web sem credenciais, query ou fragmento.');
  if (result.NODE_ENV === 'production' && result.SMTP_ENABLED && resetUrl.protocol !== 'https:') throw new Error('Recuperação de senha exige HTTPS em produção.');
  if (result.SMTP_ENABLED && (!result.SMTP_HOST || !result.SMTP_USER || !result.SMTP_PASSWORD || !result.SMTP_FROM_EMAIL || result.MAIL_DATA_SECRET.length < 64)) throw new Error('Configure SMTP_HOST, SMTP_USER, SMTP_PASSWORD, SMTP_FROM_EMAIL e MAIL_DATA_SECRET (64+ caracteres).');
  if (result.SMTP_ENABLED && [result.JWT_SECRET, result.CARD_TOKEN_SECRET, result.TICKET_QR_SECRET, result.ASAAS_DATA_SECRET].includes(result.MAIL_DATA_SECRET)) throw new Error('MAIL_DATA_SECRET deve ser exclusivo dos emails.');
  if (result.JWT_SECRET === result.CARD_TOKEN_SECRET) throw new Error('JWT_SECRET deve ser diferente do segredo da carteirinha.');
  if ([result.JWT_SECRET, result.CARD_TOKEN_SECRET].includes(result.TICKET_QR_SECRET)) throw new Error('TICKET_QR_SECRET deve ser exclusivo dos ingressos.');
  if (/development|change.?me|replace|exemplo/i.test(result.JWT_SECRET)) throw new Error('Configure JWT_SECRET com um segredo aleatório; execute npm run setup para gerar um.');
  if (result.NODE_ENV === 'production' && result.PAYMENT_MODE === 'demo') {
    throw new Error('O simulador de pagamentos não pode ser habilitado em produção.');
  }
  let asaasMerchantWallets = {};
  try { asaasMerchantWallets = z.record(z.uuid(), z.uuid()).parse(JSON.parse(result.ASAAS_MERCHANT_WALLETS.trim() || '{}')); }
  catch { throw new Error('ASAAS_MERCHANT_WALLETS deve ser um JSON de merchantId para walletId Asaas.'); }
  if (result.PAYMENT_MODE === 'sicredi') {
    for (const name of ['SICREDI_PIX_CLIENT_ID', 'SICREDI_PIX_CLIENT_SECRET', 'SICREDI_PIX_RECEIVING_KEY', 'SICREDI_PIX_CERT_PATH', 'SICREDI_PIX_KEY_PATH']) if (!result[name].trim()) throw new Error(`Configure ${name} para habilitar o Pix Sicredi.`);
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(result.SICREDI_PIX_WEBHOOK_TOKEN)) throw new Error('Configure SICREDI_PIX_WEBHOOK_TOKEN aleatório (32–128 caracteres alfanuméricos, _ ou -).');
    if ([result.JWT_SECRET, result.TICKET_QR_SECRET, result.CARD_TOKEN_SECRET, result.SICREDI_PIX_CLIENT_SECRET].includes(result.SICREDI_PIX_WEBHOOK_TOKEN)) throw new Error('O token do webhook Sicredi deve ser exclusivo.');
    if (result.SICREDI_PIX_ENV === 'production') {
      result.SICREDI_PIX_API_URL ||= 'https://api-pix.sicredi.com.br/api/v2';
      result.SICREDI_PIX_AUTH_URL ||= 'https://api-pix.sicredi.com.br/oauth/token';
    }
    for (const name of ['SICREDI_PIX_API_URL', 'SICREDI_PIX_AUTH_URL']) {
      let target; try { target = new URL(result[name]); } catch { throw new Error(`Configure ${name}; URLs de homologação devem ser fornecidas pelo Sicredi.`); }
      if (target.protocol !== 'https:' || target.username || target.password || target.hash || target.search) throw new Error(`${name} deve ser HTTPS, sem credenciais, query ou fragmento.`);
    }
  }
  if (result.PAYMENT_MODE === 'asaas') {
    if (result.ASAAS_API_KEY.length < 20 || !/^[^\s]{32,255}$/.test(result.ASAAS_WEBHOOK_TOKEN) || result.ASAAS_DATA_SECRET.length < 64) throw new Error('Configure ASAAS_API_KEY, ASAAS_WEBHOOK_TOKEN (32–255 caracteres sem espaços) e ASAAS_DATA_SECRET (64+ caracteres).');
    if ([result.ASAAS_API_KEY, result.JWT_SECRET, result.TICKET_QR_SECRET].includes(result.ASAAS_WEBHOOK_TOKEN) || [result.JWT_SECRET, result.TICKET_QR_SECRET, result.CARD_TOKEN_SECRET].includes(result.ASAAS_DATA_SECRET)) throw new Error('Os segredos do Asaas devem ser exclusivos.');
  }
  if (result.NODE_ENV === 'production' && result.CARD_TOKEN_SECRET.includes('development')) {
    throw new Error('Configure um CARD_TOKEN_SECRET próprio em produção.');
  }
  return { ...result, asaasMerchantWallets, corsOrigins: result.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean) };
}
export const env = parseEnv(process.env);
