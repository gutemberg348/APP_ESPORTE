export class ApiError extends Error {
  constructor(public status: number, message: string, public code = 'API_ERROR', public requestId?: string) { super(message); }
}
export interface RequestOptions { method?: string; body?: unknown; token?: string | null }

export function createApiTransport(apiUrl: string, fetcher: typeof fetch = fetch, timeoutMs = 10000) {
  return async function send<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(`${apiUrl}${path}`, {
        method: options.method || 'GET', signal: controller.signal,
        headers: { Accept: 'application/json', ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) },
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      });
      if (response.status === 204) return undefined as T;
      const requestId = response.headers.get('x-request-id') || undefined;
      let result;
      try { result = await response.json(); }
      catch { throw new ApiError(response.ok ? 502 : response.status, 'O servidor respondeu em um formato inesperado. Confira a URL da API e tente novamente.', 'INVALID_API_RESPONSE', requestId); }
      if (!response.ok) {
        const details = Array.isArray(result?.error?.details) ? result.error.details.filter((item: unknown): item is { message: string } => typeof item === 'object' && item !== null && 'message' in item && typeof item.message === 'string').map((item: { message: string }) => item.message).join(' ') : '';
        throw new ApiError(response.status, [result?.error?.message || 'Não foi possível concluir a operação.', details].filter(Boolean).join(' '), result?.error?.code, result?.error?.requestId || requestId);
      }
      if (!result || typeof result !== 'object' || !Object.prototype.hasOwnProperty.call(result, 'data')) throw new ApiError(502, 'O servidor respondeu sem os dados esperados. Confira a URL da API.', 'INVALID_API_RESPONSE', requestId);
      return result.data as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      const host = new URL(apiUrl).origin;
      throw new ApiError(0, controller.signal.aborted ? `A API em ${host} demorou para responder. Confira o servidor e tente novamente.` : `Não foi possível conectar à API em ${host}. Confira se a API está iniciada e se o endereço e o acesso pela rede estão corretos.`, controller.signal.aborted ? 'API_TIMEOUT' : 'API_UNREACHABLE');
    } finally { clearTimeout(timeout); }
  };
}
