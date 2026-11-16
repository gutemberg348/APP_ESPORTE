import { randomBytes, createHash } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';

export const socialHash = value => createHash('sha256').update(value).digest('base64url');
const random = () => randomBytes(32).toString('base64url');
export const socialProviderSchema = z.enum(['google', 'apple']);
export const socialStartSchema = z.object({ provider: socialProviderSchema, challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();
export const socialExchangeSchema = z.object({ ticket: z.string().regex(/^[A-Za-z0-9_-]{43}$/), verifier: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/) }).strict();
const definitions = {
  google: { authorization: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', keys: 'https://www.googleapis.com/oauth2/v3/certs', issuer: ['https://accounts.google.com', 'accounts.google.com'] },
  apple: { authorization: 'https://appleid.apple.com/auth/authorize', token: 'https://appleid.apple.com/auth/token', keys: 'https://appleid.apple.com/auth/keys', issuer: 'https://appleid.apple.com' },
};
export function validateSocialClaims(claims, nonce) {
  if (claims.nonce !== nonce || !['true', true].includes(claims.email_verified)) throw new AppError(401, 'SOCIAL_IDENTITY_INVALID', 'Não foi possível confirmar sua identidade.');
  const parsed = z.object({ sub: z.string().min(1).max(255), email: z.email().max(254), name: z.string().max(200).optional() }).safeParse(claims);
  if (!parsed.success) throw new AppError(401, 'SOCIAL_IDENTITY_INVALID', 'O provedor não enviou um e-mail verificado.');
  return { subject: parsed.data.sub, email: parsed.data.email.toLowerCase(), name: parsed.data.name?.trim().slice(0, 100) || 'Torcedor' };
}
export function createSocialAuth({ store, settings, fetcher = fetch, verify, now = () => new Date() }) {
  const keys = Object.fromEntries(Object.entries(definitions).map(([name, definition]) => [name, createRemoteJWKSet(new URL(definition.keys), { timeoutDuration: 8000 })]));
  const enabled = provider => Boolean(settings.publicApiUrl && settings[provider]?.clientId && settings[provider]?.clientSecret);
  function callback(provider) { return `${settings.publicApiUrl.replace(/\/$/, '')}/v1/auth/social/${provider}/callback`; }
  const appReturn = (id, values) => {
    const url = new URL('nacional://auth/social');
    url.searchParams.set('attempt', id);
    for (const [name, value] of Object.entries(values)) url.searchParams.set(name, value);
    return url.toString();
  };
  return {
    providers: () => ({ google: enabled('google'), apple: enabled('apple') }),
    async start(input) {
      const { provider, challenge } = socialStartSchema.parse(input);
      if (!enabled(provider)) throw new AppError(503, 'SOCIAL_NOT_CONFIGURED', `O login com ${provider === 'google' ? 'Google' : 'Apple'} ainda não foi ativado. Entre com e-mail por enquanto.`);
      const state = random(), nonce = random(), verifier = random();
      const attempt = await store.create({ provider, stateHash: socialHash(state), nonce, providerVerifier: verifier, challenge, expiresAt: new Date(now().getTime() + 10 * 60000) });
      const url = new URL(definitions[provider].authorization);
      const params = { client_id: settings[provider].clientId, redirect_uri: callback(provider), response_type: 'code', scope: provider === 'google' ? 'openid email profile' : 'name email', state, nonce };
      if (provider === 'google') Object.assign(params, { code_challenge: socialHash(verifier), code_challenge_method: 'S256', prompt: 'select_account' });
      else params.response_mode = 'form_post';
      for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
      return { authorizationUrl: url.toString(), attempt: attempt.id };
    },
    async callback(provider, input) {
      socialProviderSchema.parse(provider);
      if (!input || typeof input.state !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(input.state)) throw new AppError(400, 'SOCIAL_STATE_INVALID', 'Solicitação de login inválida. Volte ao aplicativo.');
      const attempt = await store.claim(provider, socialHash(input.state), now());
      if (!attempt) throw new AppError(400, 'SOCIAL_STATE_EXPIRED', 'Essa tentativa expirou ou já foi utilizada. Volte ao aplicativo.');
      try {
        if (input.error === 'access_denied') return appReturn(attempt.id, { error: 'canceled' });
        if (!enabled(provider) || typeof input.code !== 'string' || !input.code || input.code.length > 4096) throw new Error('Invalid authorization');
        const body = new URLSearchParams({ grant_type: 'authorization_code', code: input.code, redirect_uri: callback(provider), client_id: settings[provider].clientId, client_secret: settings[provider].clientSecret });
        if (provider === 'google') body.set('code_verifier', attempt.providerVerifier);
        const response = await fetcher(definitions[provider].token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(10000), redirect: 'error' });
        if (!response.ok) throw new Error('Provider rejected');
        const result = await response.json();
        if (typeof result.id_token !== 'string' || result.id_token.length > 16384) throw new Error('Missing identity');
        const options = { issuer: definitions[provider].issuer, audience: settings[provider].clientId, algorithms: ['RS256'], requiredClaims: ['sub', 'exp', 'iat', 'nonce'], maxTokenAge: '15m', clockTolerance: 30 };
        const { payload } = await (verify ? verify(result.id_token, provider, options) : jwtVerify(result.id_token, keys[provider], options));
        const profile = validateSocialClaims(payload, attempt.nonce);
        // Apple's first-login name is display-only; email/subject always come from the verified token.
        if (provider === 'apple' && typeof input.user === 'string') {
          try { const first = JSON.parse(input.user)?.name; const name = [first?.firstName, first?.lastName].filter(x => typeof x === 'string').join(' ').trim().slice(0, 100); if (name) profile.name = name; } catch { /* name is optional */ }
        }
        const ticket = random();
        await store.complete(attempt.id, { profile, ticketHash: socialHash(ticket), expiresAt: new Date(now().getTime() + 60000) });
        return appReturn(attempt.id, { ticket });
      } catch { return appReturn(attempt.id, { error: 'failed' }); }
    },
  };
}
