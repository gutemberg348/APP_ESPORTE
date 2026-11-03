import { randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { AppError } from './errors.js';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const TICKET_QR_TTL_SECONDS = 45;
export function createTicketQr({ secret, issuer, now = () => new Date() }) {
  if (Buffer.byteLength(secret, 'utf8') < 64) throw new Error('Configure um segredo de ingresso com pelo menos 64 bytes.');
  const key = new TextEncoder().encode(secret);
  return {
    async issue(ticket, gateCloseAt) {
      const iat = Math.floor(now().getTime() / 1000);
      const exp = Math.min(iat + TICKET_QR_TTL_SECONDS, Math.floor(gateCloseAt.getTime() / 1000));
      if (exp <= iat) throw new AppError(409, 'GATE_CLOSED', 'A portaria está fechada.');
      const scanId = randomUUID();
      const token = await new SignJWT({ mid: ticket.matchId, sec: ticket.sectorId, ver: ticket.entryVersion })
        .setProtectedHeader({ alg: 'HS256', typ: 'nacional-ticket+jwt' }).setIssuer(issuer).setAudience('nacional-ticket-gate')
        .setSubject(ticket.id).setJti(scanId).setIssuedAt(iat).setExpirationTime(exp).sign(key);
      return { token, qr: `nacional://ticket/${token}`, ticketId: ticket.id, scanId, expiresAt: new Date(exp * 1000).toISOString(), serverTime: now().toISOString() };
    },
    async verify(token) {
      if (typeof token !== 'string' || token.length > 2048) throw new AppError(422, 'INVALID_TICKET_QR', 'QR de ingresso inválido.');
      try {
        const { payload } = await jwtVerify(token, key, {
          algorithms: ['HS256'], issuer, audience: 'nacional-ticket-gate', typ: 'nacional-ticket+jwt',
          requiredClaims: ['sub', 'mid', 'sec', 'ver', 'jti', 'iat', 'exp'], currentDate: now(), clockTolerance: 0, maxTokenAge: TICKET_QR_TTL_SECONDS,
        });
        if (![payload.sub, payload.mid, payload.sec, payload.jti].every((value) => typeof value === 'string' && uuid.test(value)) || !Number.isSafeInteger(payload.ver) || payload.ver < 0 || payload.exp <= payload.iat || payload.exp - payload.iat > TICKET_QR_TTL_SECONDS) throw new Error('Invalid ticket claims');
        return { ticketId: payload.sub, matchId: payload.mid, sectorId: payload.sec, version: payload.ver, scanId: payload.jti, expiresAt: new Date(payload.exp * 1000) };
      } catch (error) {
        if (error.code === 'ERR_JWT_EXPIRED') throw new AppError(409, 'TICKET_QR_EXPIRED', 'QR expirado. Peça ao titular para atualizar no app.');
        throw new AppError(422, 'INVALID_TICKET_QR', 'QR de ingresso inválido ou adulterado.');
      }
    },
  };
}
