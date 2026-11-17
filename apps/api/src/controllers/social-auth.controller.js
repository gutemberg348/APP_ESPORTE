import { env } from '../config/env.js';
import { authService } from '../services/auth.service.js';
import { createSocialAuth, socialExchangeSchema, socialHash } from '../services/social-auth-core.js';
import { socialAuthModel } from '../models/social-auth.model.js';
const service = createSocialAuth({ store: socialAuthModel, settings: {
  publicApiUrl: env.SOCIAL_PUBLIC_API_URL,
  google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
  apple: { clientId: env.APPLE_SERVICE_ID, clientSecret: env.APPLE_CLIENT_SECRET },
} });
export const socialAuthController = {
  providers: async () => ({ data: service.providers() }),
  start: async ({ body }) => ({ data: await service.start(body) }),
  callback: async ({ req, url, body }) => ({ status: 303, headers: { Location: await service.callback(req.params.provider, body || Object.fromEntries(url.searchParams)) }, body: '' }),
  exchange: async ({ body }) => {
    const input = socialExchangeSchema.parse(body);
    return { data: await authService.socialLogin({ ticketHash: socialHash(input.ticket), challenge: socialHash(input.verifier), referralCode: input.referralCode }) };
  },
};
