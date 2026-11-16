import { randomBytes } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { createSicrediClient, e2ePattern, pixCents, pixDecimal } from '../src/payments/sicredi/client.js';
import { loadSicrediCertificate } from '../src/payments/sicredi/transport.js';

const testTxid = /^TST[a-f0-9]{32}$/;
const scopes = new Set(['cob.read', 'cob.write', 'pix.read', 'pix.write', 'webhook.read', 'webhook.write']);
const states = new Set(['ATIVA', 'CONCLUIDA', 'REMOVIDA_PELO_USUARIO_RECEBEDOR', 'REMOVIDA_PELO_PSP']);
export class SicrediTestError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const fail = (code, message) => { throw new SicrediTestError(code, message); };
export const newTestTxid = () => `TST${randomBytes(16).toString('hex')}`;
export function checkedTestTxid(txid) {
  if (!testTxid.test(txid || '')) fail('TEST_TXID_INVALID', 'Use um TXID gerado pelo comando referencia (TST + 32 caracteres hexadecimais). Referências de vendas do app não são aceitas.');
  return txid;
}
export function testAmount(value) {
  if (typeof value !== 'string' || !/^\d{1,8}[.,]\d{2}$/.test(value)) fail('TEST_AMOUNT_INVALID', 'Informe --valor com duas casas, por exemplo 1,00 ou 1.00.');
  const cents = pixCents(value.replace(',', '.'));
  pixDecimal(cents);
  return cents;
}
export function testSettings(input, { certificateOnly = false } = {}) {
  const settings = Object.fromEntries(Object.entries(input).filter(([key]) => key.startsWith('SICREDI_PIX_')));
  if (!['production', 'sandbox'].includes(settings.SICREDI_PIX_ENV)) fail('TEST_CONFIGURATION', 'Defina SICREDI_PIX_ENV como production ou sandbox.');
  for (const name of ['SICREDI_PIX_CERT_PATH', 'SICREDI_PIX_KEY_PATH']) if (!settings[name]?.trim()) fail('TEST_CONFIGURATION', `Configure ${name}.`);
  settings.SICREDI_PIX_CHAIN_PATH ||= '';
  settings.SICREDI_PIX_CERT_PASSPHRASE ||= '';
  settings.SICREDI_PIX_TIMEOUT_MS = Number(settings.SICREDI_PIX_TIMEOUT_MS || 10000);
  if (!Number.isInteger(settings.SICREDI_PIX_TIMEOUT_MS) || settings.SICREDI_PIX_TIMEOUT_MS < 1000 || settings.SICREDI_PIX_TIMEOUT_MS > 30000) fail('TEST_CONFIGURATION', 'SICREDI_PIX_TIMEOUT_MS deve estar entre 1000 e 30000.');
  if (certificateOnly) return settings;
  for (const name of ['SICREDI_PIX_CLIENT_ID', 'SICREDI_PIX_CLIENT_SECRET', 'SICREDI_PIX_RECEIVING_KEY']) if (!settings[name]?.trim()) fail('TEST_CONFIGURATION', `Configure ${name}.`);
  if (settings.SICREDI_PIX_ENV === 'production') {
    settings.SICREDI_PIX_API_URL ||= 'https://api-pix.sicredi.com.br/api/v2';
    settings.SICREDI_PIX_AUTH_URL ||= 'https://api-pix.sicredi.com.br/oauth/token';
  }
  for (const name of ['SICREDI_PIX_API_URL', 'SICREDI_PIX_AUTH_URL']) {
    let url; try { url = new URL(settings[name]); } catch { fail('TEST_CONFIGURATION', `Configure ${name}; use as URLs de homologação fornecidas pelo Sicredi para sandbox.`); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) fail('TEST_CONFIGURATION', `${name} deve ser HTTPS sem credenciais, query ou fragmento.`);
    if (settings.SICREDI_PIX_ENV === 'sandbox' && url.hostname === 'api-pix.sicredi.com.br') fail('TEST_CONFIGURATION', 'Sandbox não pode usar o host de produção. Configure as duas URLs de homologação liberadas pelo Sicredi.');
  }
  return settings;
}

function verifiedCharge(charge, txid, settings, cents) {
  if (!charge || charge.txid !== txid || charge.chave !== settings.SICREDI_PIX_RECEIVING_KEY || !states.has(charge.status) || charge.valor?.modalidadeAlteracao !== 0) fail('TEST_CHARGE_MISMATCH', 'A cobrança retornada diverge de TXID, chave, modalidade ou situação esperada.');
  const amount = pixCents(charge.valor.original);
  pixDecimal(amount);
  if (cents !== undefined && cents !== amount) fail('TEST_CHARGE_MISMATCH', 'O valor bancário diverge do valor informado; nenhuma nova cobrança foi criada.');
  return amount;
}
function webhookReport(current, settings) {
  let matchesConfigured = null;
  if (current?.webhookUrl && settings.SICREDI_PIX_WEBHOOK_URL && settings.SICREDI_PIX_WEBHOOK_TOKEN) matchesConfigured = current.webhookUrl.replace(/\/$/, '') === `${settings.SICREDI_PIX_WEBHOOK_URL.replace(/\/$/, '')}/${settings.SICREDI_PIX_WEBHOOK_TOKEN}`;
  return { webhookRegistered: Boolean(current?.webhookUrl), matchesConfigured, changedWebhook: false };
}
export async function inspectTestCharge(api, settings, txid, expectedCents) {
  checkedTestTxid(txid);
  const charge = await api.charge(txid);
  if (!charge) return { txid, exists: false, paymentConfirmed: false };
  const amountCents = verifiedCharge(charge, txid, settings, expectedCents);
  const result = { txid, exists: true, status: charge.status, amountCents, amount: pixDecimal(amountCents), paymentConfirmed: false };
  if (charge.status !== 'CONCLUIDA') return result;
  if (!Array.isArray(charge.pix) || charge.pix.length !== 1) fail('TEST_RECEIPT_MISMATCH', 'A cobrança concluída exige conferência: não há um recebimento único para verificar.');
  const hint = charge.pix[0];
  if (!e2ePattern.test(hint.endToEndId || '') || hint.txid !== txid || pixCents(hint.valor) !== amountCents) fail('TEST_RECEIPT_MISMATCH', 'O recebimento da cobrança diverge de TXID, E2E ou valor.');
  const receipt = await api.pix(hint.endToEndId);
  if (!receipt || receipt.endToEndId !== hint.endToEndId || receipt.txid !== txid || pixCents(receipt.valor) !== amountCents || !Number.isFinite(Date.parse(receipt.horario))) fail('TEST_RECEIPT_MISMATCH', 'A consulta Pix não confirmou TXID, E2E, valor e horário.');
  let refundedCents = 0;
  if (receipt.devolucoes !== undefined && !Array.isArray(receipt.devolucoes)) fail('TEST_RECEIPT_MISMATCH', 'A lista bancária de devoluções exige conferência.');
  for (const refund of receipt.devolucoes || []) {
    if (!['EM_PROCESSAMENTO', 'DEVOLVIDO', 'NAO_REALIZADO'].includes(refund.status)) fail('TEST_RECEIPT_MISMATCH', 'A situação bancária da devolução exige conferência.');
    if (refund.status === 'DEVOLVIDO') refundedCents += pixCents(refund.valor);
  }
  if (refundedCents > amountCents) fail('TEST_RECEIPT_MISMATCH', 'O total devolvido supera o recebimento e exige conferência.');
  return { ...result, paymentConfirmed: true, endToEndId: receipt.endToEndId, receivedAt: receipt.horario, refundedCents, refundPending: (receipt.devolucoes || []).some(refund => refund.status === 'EM_PROCESSAMENTO') };
}

export async function runSicrediTest(command, options, settings, { createClient = createSicrediClient, certificate = loadSicrediCertificate, pause = sleep, report = () => {} } = {}) {
  const txid = ['criar', 'consultar', 'acompanhar', 'cancelar'].includes(command) ? checkedTestTxid(options.txid) : undefined;
  const amountCents = command === 'criar' || options.valor !== undefined ? testAmount(options.valor) : undefined;
  const expiration = Number(options.expiracao || 300);
  if (command === 'criar' && (!Number.isInteger(expiration) || expiration < 60 || expiration > 86400)) fail('TEST_CONFIGURATION', '--expiracao deve ser um número inteiro entre 60 e 86400 segundos.');
  const attempts = Number(options.tentativas || 12), interval = Number(options.intervalo || 5);
  if (command === 'acompanhar' && (!Number.isInteger(attempts) || attempts < 1 || attempts > 120 || !Number.isInteger(interval) || interval < 1 || interval > 30)) fail('TEST_CONFIGURATION', 'Use 1–120 tentativas e intervalo de 1–30 segundos.');
  if (command === 'auth' && !scopes.has(options.scope || 'cob.read')) fail('TEST_CONFIGURATION', 'Escopo OAuth não suportado pelo teste.');
  // Check mTLS before any bank request. No database, worker or application startup.
  const material = await certificate(settings);
  report({ step: 'certificate', ok: true, environment: settings.SICREDI_PIX_ENV, validTo: material.validTo });
  if (command === 'certificado') return { ok: true, certificateValid: true };
  const api = createClient(settings);
  try {
    if (command === 'diagnostico') {
      const checks = [];
      async function check(step, work) {
        let result;
        try { result = { step, ok: true, ...await work() }; }
        catch (error) { result = { step, ...safeTestFailure(error) }; }
        checks.push(result); report(result);
        return result;
      }
      // OAuth grants alone do not prove a bank operation or webhook delivery works.
      // Isolate failures: a missing webhook scope must not hide working charge credentials.
      for (const scope of ['cob.read', 'cob.write', 'pix.read', 'webhook.read', 'webhook.write']) {
        await check(`oauth:${scope}`, async () => { await api.authenticate(scope); return { scope, authenticated: true }; });
      }
      const webhook = await check('webhook:read', async () => webhookReport(await api.webhook(), settings));
      const warnings = [];
      if (webhook.ok && !webhook.webhookRegistered) warnings.push('WEBHOOK_NOT_REGISTERED');
      if (webhook.ok && webhook.matchesConfigured === false) warnings.push('WEBHOOK_DIFFERENT_URL');
      if (webhook.ok && webhook.matchesConfigured === null) warnings.push('WEBHOOK_NOT_COMPARED');
      return {
        ok: checks.every(row => row.ok), checks,
        readyForPaymentTest: ['cob.read', 'cob.write', 'pix.read'].every(scope => checks.some(row => row.step === `oauth:${scope}` && row.ok)),
        webhookConfigured: webhook.ok && webhook.matchesConfigured === true,
        paymentTested: false, webhookDeliveryTested: false, changesBank: false, databaseUsed: false, warnings,
      };
    }
    if (command === 'conexao') {
      for (const scope of ['cob.read', 'pix.read', 'webhook.read']) { await api.authenticate(scope); report({ step: 'authentication', ok: true, scope }); }
    }
    if (command === 'auth') { const scope = options.scope || 'cob.read'; await api.authenticate(scope); return { ok: true, scope, authenticated: true }; }
    if (command === 'conexao' || command === 'webhook') {
      const current = await api.webhook();
      return { ok: true, ...webhookReport(current, settings) };
    }
    if (command === 'criar') {
      const existing = await api.charge(txid);
      if (existing) { verifiedCharge(existing, txid, settings, amountCents); return { ok: true, txid, reused: true, status: existing.status, amount: pixDecimal(amountCents), ...(existing.status === 'ATIVA' ? { pixCopiaECola: existing.pixCopiaECola || null } : {}) }; }
      report({ step: 'creating', txid, amount: pixDecimal(amountCents), environment: settings.SICREDI_PIX_ENV });
      const charge = await api.create(txid, amountCents, expiration, 'Teste tecnico Pix Esporte - sem ingresso ou pedido');
      verifiedCharge(charge, txid, settings, amountCents);
      return { ok: true, txid, reused: false, status: charge.status, amount: pixDecimal(amountCents), expiresSeconds: expiration, pixCopiaECola: charge.status === 'ATIVA' ? charge.pixCopiaECola || null : null };
    }
    if (command === 'consultar') return { ok: true, ...await inspectTestCharge(api, settings, txid, amountCents) };
    if (command === 'acompanhar') {
      for (let attempt = 1; attempt <= attempts; attempt++) {
        const result = await inspectTestCharge(api, settings, txid, amountCents);
        report({ step: 'poll', attempt, ...result });
        if (result.paymentConfirmed || !result.exists || result.status !== 'ATIVA') return { ok: true, ...result };
        if (attempt < attempts) await pause(interval * 1000);
      }
      return { ok: true, txid, paymentConfirmed: false, pending: true, attemptsExhausted: true };
    }
    if (command === 'cancelar') {
      const existing = await api.charge(txid);
      if (!existing) return { ok: true, txid, exists: false, cancelled: false };
      verifiedCharge(existing, txid, settings);
      if (existing.status === 'CONCLUIDA' || (existing.pix?.length || 0) > 0) fail('TEST_ALREADY_PAID', 'Cobrança com recebimento não será cancelada. O teste não realiza devolução nem transferência.');
      if (existing.status === 'ATIVA') await api.cancel(txid);
      const result = await inspectTestCharge(api, settings, txid);
      if (!result.exists || result.paymentConfirmed || !['REMOVIDA_PELO_USUARIO_RECEBEDOR', 'REMOVIDA_PELO_PSP'].includes(result.status)) fail('TEST_CANCELLATION_PENDING', 'O banco ainda não confirmou a remoção; consulte o mesmo TXID novamente.');
      return { ok: true, ...result, cancelled: true };
    }
    fail('TEST_COMMAND', 'Comando de teste inválido. Use --help.');
  } finally { api.close(); }
}

const messages = {
  SICREDI_AMOUNT_INVALID: 'Valor inválido. Informe um valor positivo com duas casas decimais.',
  SICREDI_CERTIFICATE_INVALID: 'Confira certificado assinado, chave, cadeia, senha, validade e permissão de leitura no container.',
  SICREDI_ACCESS_DENIED: 'Sicredi negou o acesso. Confira Client ID/Secret, ambiente, certificado vinculado e escopos liberados para API Pix.',
  SICREDI_TOKEN_INVALID: 'A autenticação não retornou um token válido.',
  SICREDI_TIMEOUT: 'O banco não respondeu no prazo. Consulte o mesmo TXID antes de qualquer nova tentativa.',
  SICREDI_UNAVAILABLE: 'A conexão segura com Sicredi não concluiu. Confira DNS, TLS, cadeia e liberação de acesso na cooperativa.',
  SICREDI_REJECTED: 'O banco rejeitou a operação. Confira chave Pix, dados e permissões; consulte o mesmo TXID.',
  SICREDI_INVALID_RESPONSE: 'A resposta do banco não pôde ser validada.',
};
export function safeTestFailure(error) {
  if (error instanceof SicrediTestError) return { ok: false, code: error.code, message: error.message };
  const code = Object.hasOwn(messages, error?.code || '') ? error.code : 'TEST_FAILURE';
  return { ok: false, code, message: messages[code] || 'O teste não concluiu. Confira configuração, argumentos e permissões; não compartilhe tokens, credenciais ou respostas bancárias completas.' };
}
