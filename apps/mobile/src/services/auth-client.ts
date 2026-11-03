import type { AuthResponse } from '@nacional/shared/types';
import { send, ApiError } from './api-transport';
import { sessionStorage } from './session-storage';
import { createSessionManager } from './auth-session';
export const authClient = createSessionManager({
  storage: sessionStorage,
  exchange: (refreshToken) => send<AuthResponse>('/auth/refresh', { method: 'POST', body: { refreshToken } }),
  unauthorized: () => new ApiError(401, 'Sua sessão foi encerrada. Entre novamente.', 'SESSION_REVOKED'),
  isRejected: (error) => error instanceof ApiError && error.status === 401,
});
