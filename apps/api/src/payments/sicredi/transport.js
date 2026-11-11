import https from 'node:https';
import { readFile } from 'node:fs/promises';
import { createPrivateKey, X509Certificate } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppError } from '../../lib/errors.js';

const apiRoot = fileURLToPath(new URL('../../../', import.meta.url));
export async function loadSicrediCertificate(settings) {
  try {
    const [certBytes, key, chain] = await Promise.all([
      readFile(resolve(apiRoot, settings.SICREDI_PIX_CERT_PATH)),
      readFile(resolve(apiRoot, settings.SICREDI_PIX_KEY_PATH)),
      settings.SICREDI_PIX_CHAIN_PATH ? readFile(resolve(apiRoot, settings.SICREDI_PIX_CHAIN_PATH), 'utf8') : '',
    ]);
    const leaf = new X509Certificate(certBytes);
    const privateKey = createPrivateKey({ key, passphrase: settings.SICREDI_PIX_CERT_PASSPHRASE || undefined });
    if (!leaf.checkPrivateKey(privateKey)) throw new Error('key mismatch');
    if (Date.parse(leaf.validFrom) > Date.now() || Date.parse(leaf.validTo) <= Date.now()) throw new Error('certificate dates');
    if (chain && !/^\s*-----BEGIN CERTIFICATE-----/.test(chain)) throw new Error('chain must be PEM');
    return { cert: `${leaf.toString()}\n${chain}`, key, passphrase: settings.SICREDI_PIX_CERT_PASSPHRASE || undefined, validTo: leaf.validTo };
  } catch {
    throw new AppError(503, 'SICREDI_CERTIFICATE_INVALID', 'Confira certificado assinado, chave correspondente, cadeia, senha e validade nos arquivos privados da API.');
  }
}

// The receiving account's certificate chain is sent as the client chain, never
// substituted for the system's trusted roots used to authenticate the bank.
export function createSicrediTransport(settings, { request = https.request, certificate = () => loadSicrediCertificate(settings) } = {}) {
  let material, agent;
  return {
    async send({ url, method = 'GET', headers = {}, body }) {
      const target = new URL(url);
      if (target.protocol !== 'https:' || target.username || target.password || target.hash) throw new AppError(503, 'SICREDI_URL_INVALID', 'Endereço Sicredi inválido.');
      if (!material) material = certificate().catch((err) => { material = null; throw err; });
      const tls = await material;
      if (!agent) agent = new https.Agent({ ...tls, minVersion: 'TLSv1.2', rejectUnauthorized: true, keepAlive: true, maxSockets: 5 });
      const payload = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
      return new Promise((accept, reject) => {
        let settled = false;
        const fail = (code, message) => { if (!settled) { settled = true; reject(new AppError(503, code, message)); } };
        const deadline = setTimeout(() => { fail('SICREDI_TIMEOUT', 'O banco demorou para responder. A mesma referência será consultada novamente.'); req.destroy(); }, settings.SICREDI_PIX_TIMEOUT_MS);
        const req = request(target, { method, agent, headers: { Accept: 'application/json', ...headers, ...(payload === undefined ? {} : { 'Content-Length': Buffer.byteLength(payload) }) } }, (res) => {
          const parts = []; let bytes = 0;
          res.on('data', (chunk) => { bytes += chunk.length; if (bytes > 1024 * 1024) { fail('SICREDI_INVALID_RESPONSE', 'Resposta bancária acima do limite.'); res.destroy(); } else parts.push(chunk); });
          res.on('error', () => fail('SICREDI_UNAVAILABLE', 'A conexão bancária foi interrompida.'));
          res.on('aborted', () => fail('SICREDI_UNAVAILABLE', 'A conexão bancária foi interrompida.'));
          res.on('end', () => {
            clearTimeout(deadline); if (settled) return;
            const status = res.statusCode || 0;
            if (status === 404) { settled = true; accept({ status, data: null }); return; }
            if (status < 200 || status >= 300) { fail(status === 401 || status === 403 ? 'SICREDI_ACCESS_DENIED' : status === 400 || status === 422 ? 'SICREDI_REJECTED' : 'SICREDI_UNAVAILABLE', 'A operação não foi confirmada pelo Sicredi. Confira a configuração e consulte novamente a mesma referência.'); return; }
            try { const raw = Buffer.concat(parts).toString('utf8'); const data = raw ? JSON.parse(raw) : null; settled = true; accept({ status, data }); }
            catch { fail('SICREDI_INVALID_RESPONSE', 'Resposta bancária inválida.'); }
          });
        });
        req.on('error', () => { clearTimeout(deadline); fail('SICREDI_UNAVAILABLE', 'Não foi possível concluir a conexão segura com o Sicredi.'); });
        req.on('close', () => clearTimeout(deadline));
        req.end(payload);
      });
    },
    close() { agent?.destroy(); },
  };
}
