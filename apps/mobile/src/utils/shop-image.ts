export function resolveShopImage(value: string, apiUrl: string) {
  if (/^\/media\/shop\/[a-z0-9-]+\.(png|jpg|webp)$/.test(value)) return `${new URL(apiUrl).origin}${value}`;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : undefined; } catch { return undefined; }
}
