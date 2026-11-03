import { send, ApiError, type RequestOptions } from './api-transport';
import { authClient } from './auth-client';
export { ApiError } from './api-transport';
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!options.token) return send<T>(path, options);
  const ensureSession = () => {
    if (!authClient.current()) throw new ApiError(401, 'Entre novamente para continuar.', 'SESSION_REVOKED');
    if (!authClient.owns(options.token!)) throw new ApiError(409, 'A conta conectada mudou. Repita a operação nesta sessão.', 'SESSION_CHANGED');
  };
  ensureSession();
  let tokens = authClient.current();
  if (tokens && Date.parse(tokens.accessTokenExpiresAt) <= Date.now() + 30000) {
    await authClient.refresh(); ensureSession(); tokens = authClient.current();
  }
  const accessToken = tokens?.accessToken || options.token;
  try { return await send<T>(path, { ...options, token: accessToken }); }
  catch (error) {
    if (error instanceof ApiError && ['SESSION_REVOKED', 'ACCESS_TOKEN_INVALID'].includes(error.code) && authClient.current()?.accessToken === accessToken) await authClient.clear();
    // Expiry is the only rejected access token that can trigger a retry.
    // Authentication precedes the route handler, so the rejected request did
    // not perform a mutation. Other failures are never retried automatically.
    if (!(error instanceof ApiError && error.code === 'ACCESS_TOKEN_EXPIRED') || !authClient.current()) throw error;
    ensureSession();
    if (authClient.current()?.accessToken === accessToken) await authClient.refresh();
    ensureSession();
    return send<T>(path, { ...options, token: authClient.current()?.accessToken });
  }
}
