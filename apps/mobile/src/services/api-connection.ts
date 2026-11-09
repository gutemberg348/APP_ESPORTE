export interface ApiConnectionStatus { ready: boolean; message: string; apiOrigin: string }
// Public diagnostics only: never sends a password, JWT, cookie or session body.
export async function checkApiConnection(apiUrl: string, fetcher: typeof fetch = fetch, timeoutMs = 4000): Promise<ApiConnectionStatus> {
  const base = new URL(apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`);
  const checks = await Promise.all(['health', 'ready'].map(async (path) => {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(new URL(`../${path}`, base).toString(), { method: 'GET', credentials: 'omit', cache: 'no-store', signal: controller.signal, headers: { Accept: 'application/json' } });
      const result = await response.json();
      return response.ok && result?.data?.status === (path === 'health' ? 'ok' : 'ready') && (path !== 'health' || result.data.service === 'nacional-api');
    } catch { return false; }
    finally { clearTimeout(timer); }
  }));
  const [alive, ready] = checks;
  return {
    apiOrigin: base.origin, ready: Boolean(alive && ready),
    message: alive && ready ? 'API e banco disponíveis. Tente entrar novamente.' : alive ? 'A API respondeu, mas o banco está indisponível ou precisa de atualização. Confira o terminal da API.' : `Não houve resposta da API em ${base.origin}. Confira se o servidor está iniciado e se o endereço está correto.`,
  };
}
