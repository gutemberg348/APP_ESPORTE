export function readPasswordRecoveryLink(
  raw: string | null | undefined,
): { token: string; portal: "APP" | "ADMIN" } | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!["https:", "http:", "nacional:"].includes(url.protocol)) return null;
    const path =
      url.protocol === "nacional:"
        ? `/${url.host}${url.pathname}`
        : url.pathname;
    if (!/^\/reset-password\/?$/.test(path)) return null;
    const params = new URLSearchParams(url.hash.slice(1)),
      token = params.get("token");
    if (!token || token.length > 256) return null;
    return {
      token,
      portal: params.get("portal") === "admin" ? "ADMIN" : "APP",
    };
  } catch {
    return null;
  }
}
