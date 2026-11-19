export interface ApiConnectionStatus { ready: boolean; message: string; apiOrigin: string; code?: 'API_READY' | 'API_OFFLINE' | 'DATABASE_UNAVAILABLE' | 'API_POST_FAILED' }
// Public diagnostics only: never sends a password, JWT, cookie or session body.
export async function checkApiConnection(apiUrl: string, fetcher: typeof fetch = fetch, timeoutMs = 4000): Promise<ApiConnectionStatus> {
  const base = new URL(apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`);
  const checks = await Promise.all(['health', 'ready', 'connection-check'].map(async (path) => {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const post = path === 'connection-check';
      const response = await fetcher(new URL(`../${path}`, base).toString(), {
        method: post ? 'POST' : 'GET', credentials: 'omit', cache: 'no-store', signal: controller.signal,
        headers: { Accept: 'application/json', ...(post ? { 'Content-Type': 'application/json' } : {}) },
        ...(post ? { body: JSON.stringify({ probe: true }) } : {}),
      });
      const result = await response.json();
      return response.ok && result?.data?.status === (path === 'ready' ? 'ready' : 'ok')
        && (path === 'ready' || result.data.service === 'nacional-api')
        && (!post || result.data.method === 'POST');
    } catch { return false; }
    finally { clearTimeout(timer); }
  }));
  const [alive, ready, post] = checks;
  return {
    apiOrigin: base.origin, ready: Boolean(alive && ready && post),
    code: !alive ? 'API_OFFLINE' : !ready ? 'DATABASE_UNAVAILABLE' : !post ? 'API_POST_FAILED' : 'API_READY',
    message: !alive ? 'Não foi possível conectar. Confira sua internet e tente novamente.'
      : !ready ? 'O serviço está temporariamente indisponível. Tente novamente em instantes.'
      : !post ? 'Não foi possível enviar os dados. Tente novamente em instantes.'
      : 'Conexão restabelecida. Você já pode tentar entrar.',
  };
}
