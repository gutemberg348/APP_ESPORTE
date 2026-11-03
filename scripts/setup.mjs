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
  } catch {
    await copyFile(new URL(`${path}.example`, root), target);
    console.log(`Criado: ${fileURLToPath(target)}`);
  }
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
}
