import type { RequestOptions, ApiError as ApiErrorType } from './api-transport-core';
import type { createSessionManager } from './auth-session';

type Client = ReturnType<typeof createSessionManager>;
type Send = <T>(path: string, options?: RequestOptions) => Promise<T>;
type ApiErrorClass = new (status: number, message: string, code?: string) => ApiErrorType;

export function createAuthenticatedRequest(send: Send, authClient: Client, ApiError: ApiErrorClass, now = () => Date.now()) {
  return async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    if (!options.token) return send<T>(path, options);
    const ensureSession = () => {
      if (!authClient.current()) throw new ApiError(401, 'Entre novamente para continuar.', 'SESSION_REVOKED');
      if (!authClient.owns(options.token!)) throw new ApiError(409, 'A conta conectada mudou. Repita a operação nesta sessão.', 'SESSION_CHANGED');
    };
    ensureSession();
    let tokens = authClient.current();
    if (tokens && Date.parse(tokens.accessTokenExpiresAt) <= now() + 30000) {
      await authClient.refresh(); ensureSession(); tokens = authClient.current();
    }
    const accessToken = tokens?.accessToken || options.token;
    try { return await send<T>(path, { ...options, token: accessToken }); }
    catch (error) {
      if (error instanceof ApiError && ['SESSION_REVOKED', 'ACCESS_TOKEN_INVALID'].includes(error.code) && authClient.current()?.accessToken === accessToken) await authClient.clear();
      // Retry only an expired JWT rejected before the route handler runs.
      if (!(error instanceof ApiError && error.code === 'ACCESS_TOKEN_EXPIRED') || !authClient.current()) throw error;
      ensureSession();
      if (authClient.current()?.accessToken === accessToken) await authClient.refresh();
      ensureSession();
      return send<T>(path, { ...options, token: authClient.current()?.accessToken });
    }
  };
}
