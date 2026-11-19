const unavailable = 'O serviço está temporariamente indisponível. Tente novamente em instantes.';
export function userFacingMessage(value: unknown, fallback = 'Não foi possível concluir a operação. Tente novamente.') {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  if (/(?:network request failed|failed to fetch|load failed|networkerror)/i.test(value)) return 'Falha de conexão. Confira sua internet e tente novamente.';
  if (/(?:[a-z][\w+.-]*:\/\/|\blocalhost\b|\b(?:\d{1,3}\.){3}\d{1,3}\b|\bHTTP\s*\d{3}|\b(?:Prisma|ECONN\w+|ENOTFOUND|SQLSTATE|TypeError|SyntaxError|NotReadableError|NotAllowedError)\b|<html|\n\s*at\s)/i.test(value)) return fallback;
  return value;
}
export class ApiError extends Error {
  constructor(public status: number, message: string, public code = 'API_ERROR', public requestId?: string) { super(userFacingMessage(message)); }
}
export interface RequestOptions { method?: string; body?: unknown; token?: string | null; timeoutMs?: number }

export function createApiTransport(apiUrl: string | (() => string), fetcher: typeof fetch = fetch, timeoutMs = 10000) {
  return async function send<T>(path: string, options: RequestOptions = {}): Promise<T> {
    // Resolve once per request. Never retry a POST against another destination.
    const baseUrl = typeof apiUrl === 'function' ? apiUrl() : apiUrl;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs === undefined ? timeoutMs : Math.max(1000, Math.min(90000, options.timeoutMs)));
    try {
      const response = await fetcher(`${baseUrl}${path}`, {
        method: options.method || 'GET', signal: controller.signal, credentials: 'omit', cache: 'no-store',
        headers: { Accept: 'application/json', ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) },
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      });
      if (response.status === 204) return undefined as T;
      const requestId = response.headers.get('x-request-id') || undefined;
      let result;
      try { result = await response.json(); }
      catch (error) {
        if (controller.signal.aborted) throw error;
        const isHtml = response.headers.get('content-type')?.includes('text/html');
        throw new ApiError(response.ok ? 502 : response.status, unavailable, isHtml ? 'API_PROXY_ERROR' : 'INVALID_API_RESPONSE', requestId);
      }
      if (!response.ok) {
        const details = Array.isArray(result?.error?.details) ? result.error.details.filter((item: unknown): item is { message: string } => typeof item === 'object' && item !== null && 'message' in item && typeof item.message === 'string').map((item: { message: string }) => item.message).join(' ') : '';
        const message = response.status >= 500 ? unavailable : response.status === 429 ? 'Muitas tentativas seguidas. Aguarde um instante e tente novamente.'
          : [userFacingMessage(result?.error?.message), userFacingMessage(details, '')].filter(Boolean).join(' ');
        throw new ApiError(response.status, message, result?.error?.code, result?.error?.requestId || requestId);
      }
      if (!result || typeof result !== 'object' || !Object.prototype.hasOwnProperty.call(result, 'data')) throw new ApiError(502, unavailable, 'INVALID_API_RESPONSE', requestId);
      return result.data as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(0, controller.signal.aborted ? 'A resposta está demorando. Confira sua conexão e tente novamente.' : 'Falha de conexão. Confira sua internet e tente novamente.', controller.signal.aborted ? 'API_TIMEOUT' : 'API_UNREACHABLE');
    } finally { clearTimeout(timeout); }
  };
}
