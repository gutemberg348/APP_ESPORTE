import { userModel } from '../models/user.model.js';
import { authModel } from '../models/auth.model.js';
import { createAccessTokens } from '../lib/jwt.js';
import { createAuthService } from './auth-core.js';
import { env } from '../config/env.js';

const accessTokens = createAccessTokens({ secret: env.JWT_SECRET, issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE, ttlSeconds: env.JWT_ACCESS_TTL_SECONDS });
export const authService = await createAuthService({ users: userModel, sessions: authModel, accessTokens, ttlDays: env.SESSION_TTL_DAYS });
