import { copyFile, access, readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
for (const path of ['.env', 'apps/api/.env', 'apps/mobile/.env']) {
  const target = new URL(path, root);
  try {
    await access(target, constants.F_OK);
    console.log(`Mantido: ${path}`);
  } catch (error) {
    try {
      if (error.code !== 'ENOENT') throw error;
      await copyFile(new URL(`${path}.example`, root), target, constants.COPYFILE_EXCL);
      console.log(`Criado: ${fileURLToPath(target)}`);
    } catch (failure) {
      if (!['EACCES', 'EPERM'].includes(failure.code)) throw failure;
      console.error(`Sem permissão para preparar ${fileURLToPath(target)}. Confira o dono e as permissões da pasta do projeto e deste arquivo. Execute o setup como o usuário da aplicação (server na VPS), sem sudo node.`);
      process.exit(1);
    }
  }
}
// Prepare host ownership and a fresh database password without rotating existing values.
{
  const target = new URL('.env', root);
  let source = await readFile(target, 'utf8');
  for (const [key, value] of Object.entries({ POSTGRES_PASSWORD: randomBytes(32).toString('hex'), API_UID: String(process.getuid?.() ?? 1000), API_GID: String(process.getgid?.() ?? 1000) })) {
    const pattern = new RegExp(`^${key}=(.*)$`, 'm');
    if (!pattern.test(source)) source += `\n${key}=${value}\n`;
    else if (new RegExp(`^${key}=$`, 'm').test(source)) source = source.replace(new RegExp(`^${key}=$`, 'm'), `${key}=${value}`);
  }
  await writeFile(target, source);
}
const rootEnv = new URL('.env', root);
const content = await readFile(rootEnv, 'utf8');
if (!/^CARD_TOKEN_SECRET=.+$/m.test(content)) {
  const entry = `CARD_TOKEN_SECRET=${randomBytes(32).toString('hex')}`;
  await writeFile(rootEnv, /^CARD_TOKEN_SECRET=$/m.test(content) ? content.replace(/^CARD_TOKEN_SECRET=$/m, entry) : `${content.trimEnd()}\n${entry}\n`);
  console.log('Segredo local do Docker configurado.');
}
const apiEnv = new URL('apps/api/.env', root);
const apiContent = await readFile(apiEnv, 'utf8');
if (!/^ADMIN_PASSWORD=.+$/m.test(apiContent)) {
  const entry = `ADMIN_PASSWORD=${randomBytes(18).toString('base64url')}`;
  await writeFile(apiEnv, /^ADMIN_PASSWORD=$/m.test(apiContent) ? apiContent.replace(/^ADMIN_PASSWORD=$/m, entry) : `${apiContent.trimEnd()}\nADMIN_EMAIL=admin@nacional.local\nADMIN_NAME=Administrador Nacional\n${entry}\n`);
  console.log('Senha administrativa local criada em apps/api/.env.');
}
for (const path of ['.env', 'apps/api/.env']) {
  const target = new URL(path, root);
  const cardSettings = await readFile(target, 'utf8');
  if (!/^CARD_TOKEN_SECRET=.+$/m.test(cardSettings)) {
    const entry = `CARD_TOKEN_SECRET=${randomBytes(32).toString('hex')}`;
    await writeFile(target, /^CARD_TOKEN_SECRET=$/m.test(cardSettings) ? cardSettings.replace(/^CARD_TOKEN_SECRET=$/m, entry) : `${cardSettings.trimEnd()}\n${entry}\n`);
    console.log(`Segredo da carteirinha configurado sem substituir valores existentes: ${path}`);
  }
  const source = await readFile(target, 'utf8');
  if (!/^JWT_SECRET=.+$/m.test(source)) {
    const entry = `JWT_SECRET=${randomBytes(64).toString('hex')}`;
    await writeFile(target, /^JWT_SECRET=$/m.test(source) ? source.replace(/^JWT_SECRET=$/m, entry) : `${source.trimEnd()}\n${entry}\n`);
    console.log(`Segredo JWT local configurado: ${path}`);
  }
  const updated = await readFile(target, 'utf8');
  if (!/^TICKET_QR_SECRET=.+$/m.test(updated)) {
    const entry = `TICKET_QR_SECRET=${randomBytes(64).toString('hex')}`;
    await writeFile(target, /^TICKET_QR_SECRET=$/m.test(updated) ? updated.replace(/^TICKET_QR_SECRET=$/m, entry) : `${updated.trimEnd()}\n${entry}\n`);
    console.log(`Segredo de QR dos ingressos configurado: ${path}`);
  }
  const paymentSettings = await readFile(target, 'utf8');
  const newSettings = { PAYMENT_MODE: 'disabled', SICREDI_PIX_ENV: 'production', SICREDI_PIX_API_URL: 'https://api-pix.sicredi.com.br/api/v2', SICREDI_PIX_AUTH_URL: 'https://api-pix.sicredi.com.br/oauth/token', SICREDI_PIX_CLIENT_ID: '', SICREDI_PIX_CLIENT_SECRET: '', SICREDI_PIX_RECEIVING_KEY: '', SICREDI_PIX_CERT_PASSPHRASE: '', SICREDI_PIX_TIMEOUT_MS: '10000', SICREDI_PIX_TXID_PREFIX: 'ESP', SICREDI_PIX_WEBHOOK_TOKEN: randomBytes(32).toString('hex'), SICREDI_PIX_WEBHOOK_URL: '', ...(path === '.env' ? { SICREDI_CERTS_DIRECTORY: '/etc/nacional/certificados' } : { SICREDI_PIX_CERT_PATH: '/etc/nacional/certificados/sicredi-multipag.cer', SICREDI_PIX_KEY_PATH: '/etc/nacional/certificados/sicredi-multipag.key', SICREDI_PIX_CHAIN_PATH: '/etc/nacional/certificados/sicredi-multipag-chain.cer' }) };
  let nextSettings = paymentSettings;
  for (const [name, value] of Object.entries(newSettings)) {
    const existing = new RegExp(`^${name}=(.*)$`, 'm');
    if (!existing.test(nextSettings)) nextSettings = `${nextSettings.trimEnd()}\n${name}=${value}\n`;
    else if (value && name === 'SICREDI_PIX_WEBHOOK_TOKEN' && new RegExp(`^${name}=$`, 'm').test(nextSettings)) nextSettings = nextSettings.replace(new RegExp(`^${name}=$`, 'm'), `${name}=${value}`);
  }
  for (const [name, value] of Object.entries({ MELHOR_ENVIO_ENVIRONMENT: 'sandbox', MELHOR_ENVIO_TOKEN: '', MELHOR_ENVIO_CONTACT_EMAIL: '', MELHOR_ENVIO_SERVICES: '1,2' })) {
    if (!new RegExp(`^${name}=`, 'm').test(nextSettings)) nextSettings = `${nextSettings.trimEnd()}\n${name}=${value}\n`;
  }
  if (nextSettings !== paymentSettings) { await writeFile(target, nextSettings); console.log(`Configurações de pagamento e frete preparadas sem ativar cobranças: ${path}`); }
}

// Prepare recovery settings without enabling SMTP or replacing existing credentials.
for (const path of ['.env', 'apps/api/.env']) {
  const target = new URL(path, root);
  let text = await readFile(target, 'utf8');
  const settings = { SMTP_ENABLED: 'false', SMTP_HOST: '', SMTP_PORT: '587', SMTP_SECURE: 'false', SMTP_USER: '', SMTP_PASSWORD: '', SMTP_FROM_EMAIL: '', SMTP_FROM_NAME: '"Sócio Esporte"', PASSWORD_RESET_PUBLIC_URL: 'http://localhost:8081/reset-password', PASSWORD_RESET_TTL_MINUTES: '15', MAIL_WORKER_INTERVAL_MS: '3000', MAIL_DATA_SECRET: randomBytes(32).toString('hex') };
  for (const [key, value] of Object.entries(settings)) {
    if (!new RegExp('^' + key + '=', 'm').test(text)) text = text.trimEnd() + '\n' + key + '=' + value + '\n';
    else if (key === 'MAIL_DATA_SECRET' && /^MAIL_DATA_SECRET=$/m.test(text)) text = text.replace(/^MAIL_DATA_SECRET=$/m, key + '=' + value);
  }
  await writeFile(target, text);
}

// The container reads the root environment. Preserve the local administrative
// identity when the root environment has not configured one yet.
{
  const target = new URL('.env', root);
  let source = await readFile(target, 'utf8');
  const local = await readFile(new URL('apps/api/.env', root), 'utf8');
  for (const [key, fallback] of Object.entries({ ADMIN_EMAIL: 'admin@nacional.local', ADMIN_NAME: 'Administrador Esporte', ADMIN_PASSWORD: randomBytes(18).toString('base64url') })) {
    const value = local.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1] || fallback;
    if (!new RegExp(`^${key}=`, 'm').test(source)) source += `\n${key}=${value}\n`;
    else if (new RegExp(`^${key}=$`, 'm').test(source)) source = source.replace(new RegExp(`^${key}=$`, 'm'), `${key}=${value}`);
  }
  await writeFile(target, source);
}
