import { randomBytes } from 'node:crypto';
import { AppError } from '../../lib/errors.js';

const fail = (code, message) => new AppError(503, code, message);

export function sicrediWebhookAddress(settings) {
  let target;
  try { target = new URL(settings.SICREDI_PIX_WEBHOOK_URL); }
  catch { throw fail('SICREDI_WEBHOOK_URL_INVALID', 'Configure a URL pública HTTPS do webhook.'); }
  if (target.protocol !== 'https:' || target.username || target.password || target.search || target.hash ||
      target.pathname.replace(/\/$/, '') !== '/v1/payments/webhooks/sicredi') {
    throw fail('SICREDI_WEBHOOK_URL_INVALID', 'SICREDI_PIX_WEBHOOK_URL deve terminar em /v1/payments/webhooks/sicredi, via HTTPS e sem token ou query.');
  }
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(settings.SICREDI_PIX_WEBHOOK_TOKEN || '')) {
    throw fail('SICREDI_WEBHOOK_TOKEN_INVALID', 'Configure o token privado do webhook no ambiente da API.');
  }
  const base = target.href.replace(/\/$/, '');
  return { base, url: `${base}/${settings.SICREDI_PIX_WEBHOOK_TOKEN}` };
}

async function postEmpty(fetcher, url) {
  try {
    const response = await fetcher(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"pix":[]}',
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
    return { status: response.status, data: await response.json() };
  } catch {
    throw fail('SICREDI_WEBHOOK_UNREACHABLE', 'O endereço público não respondeu com JSON via HTTPS. Confira domínio, certificado e proxy da API.');
  }
}

export async function checkPublicWebhook(settings, fetcher = fetch) {
  const { base, url } = sicrediWebhookAddress(settings);
  const invalid = randomBytes(32).toString('hex');
  const rejected = await postEmpty(fetcher, `${base}/${invalid}/pix`);
  if (rejected.data?.error?.code === 'SICREDI_DISABLED') {
    throw fail('SICREDI_DISABLED', 'A API pública está com o Pix desligado. Configure PAYMENT_MODE=sicredi e recrie o container api.');
  }
  if (rejected.status !== 401 || rejected.data?.error?.code !== 'SICREDI_WEBHOOK_UNAUTHORIZED') {
    throw fail('SICREDI_WEBHOOK_UNEXPECTED', 'O callback público não confirmou a rejeição de um token inválido. Confira o encaminhamento do Nginx.');
  }
  for (const suffix of ['', '/pix']) {
    const accepted = await postEmpty(fetcher, `${url}${suffix}`);
    if (accepted.status !== 200 || accepted.data?.data?.received !== true) {
      throw fail('SICREDI_WEBHOOK_PROBE_FAILED', 'O callback público não aceitou o token configurado. Confira se o container em execução recebeu o .env atual.');
    }
  }
  return { publicCallback: 'ok' };
}

export async function registerSicrediWebhook(settings, api, fetcher = fetch) {
  const { url } = sicrediWebhookAddress(settings);
  await checkPublicWebhook(settings, fetcher);
  const previous = await api.webhook();
  const registeredUrl = previous?.webhookUrl?.replace(/\/$/, '');
  if (registeredUrl && registeredUrl !== url) {
    throw fail('SICREDI_WEBHOOK_CONFLICT', 'A chave Pix já está vinculada a outro webhook. O cadastro existente foi preservado.');
  }
  if (registeredUrl) return { webhookRegistered: true, changed: false, publicCallback: 'ok' };
  await api.configureWebhook(url);
  const confirmed = await api.webhook();
  if (confirmed?.webhookUrl?.replace(/\/$/, '') !== url) {
    throw fail('SICREDI_WEBHOOK_UNCONFIRMED', 'O Sicredi ainda não confirmou o cadastro do webhook. Consulte o registro antes de tentar novamente.');
  }
  return { webhookRegistered: true, changed: true, publicCallback: 'ok' };
}
