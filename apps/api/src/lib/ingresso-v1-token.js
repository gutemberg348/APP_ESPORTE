import crypto from 'node:crypto';
import { AppError } from './errors.js';
const uuidToB64 = (u) => Buffer.from(String(u).replace(/-/g, ''), 'hex').toString('base64url');
const b64ToUuid = (b) => {
  const hex = Buffer.from(String(b), 'base64url').toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

/**
 * Gera um token criptográfico assinado com HMAC-SHA256 usando TICKET_QR_SECRET (64+ bytes).
 * Estrutura compacta para leitura rápida em câmera/scanner:
 * INGV1.<payloadBase64Url>.<assinaturaHmacSha256Base64Url>
 */
export function signTicketV1Token({
  partidaId,
  alocacaoId,
  blocoEscolhido = null,
  fileiraEscolhida = null,
  assentoEscolhido = null,
  now = Date.now(),
}, secret) {
  const nonce = crypto.randomBytes(12).toString('base64url'); // 96 bits CSPRNG
  const payloadObj = {
    v: 1,
    m: uuidToB64(partidaId),
    a: uuidToB64(alocacaoId),
    b: blocoEscolhido,
    r: fileiraEscolhida,
    s: assentoEscolhido,
    t: Math.floor(now / 1000),
    n: nonce,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const mac = crypto
    .createHmac('sha256', secret)
    .update(`INGV1.${payloadB64}`)
    .digest('base64url');
  return `INGV1.${payloadB64}.${mac}`;
}

/**
 * Verifica em tempo constante (timingSafeEqual) a autenticidade e integridade
 * criptográfica do token antes de aceitar na portaria.
 */
export function verifyTicketV1TokenSignature(rawToken, secret) {
  const clean = (rawToken || '').trim();
  if (!clean.startsWith('INGV1.')) {
    return { isSignedFormat: false, valid: false, claims: null };
  }
  const parts = clean.split('.');
  if (parts.length !== 3) {
    throw new AppError(422, 'INVALID_TICKET_QR', 'Formato de token QR inválido ou adulterado.');
  }
  const [, payloadB64, providedMac] = parts;
  const expectedMac = crypto
    .createHmac('sha256', secret)
    .update(`INGV1.${payloadB64}`)
    .digest('base64url');

  const bufProvided = Buffer.from(providedMac, 'utf8');
  const bufExpected = Buffer.from(expectedMac, 'utf8');
  if (
    bufProvided.length !== bufExpected.length ||
    !crypto.timingSafeEqual(bufProvided, bufExpected)
  ) {
    throw new AppError(
      422,
      'INVALID_TICKET_QR',
      'Assinatura criptográfica do ingresso inválida (possível tentativa de falsificação).'
    );
  }

  try {
    const raw = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    return {
      isSignedFormat: true,
      valid: true,
      claims: {
        mid: raw.m ? b64ToUuid(raw.m) : raw.mid,
        alc: raw.a ? b64ToUuid(raw.a) : raw.alc,
        blk: raw.b ?? raw.blk ?? null,
        row: raw.r ?? raw.row ?? null,
        seat: raw.s ?? raw.seat ?? null,
        iat: raw.t ?? raw.iat,
        jti: raw.n ?? raw.jti,
      },
    };
  } catch {
    throw new AppError(422, 'INVALID_TICKET_QR', 'Payload do token QR corrompido.');
  }
}

