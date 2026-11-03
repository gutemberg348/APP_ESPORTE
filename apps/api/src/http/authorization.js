export function bearerToken(header) {
  if (typeof header !== 'string' || header.length > 4103) return undefined;
  return header.match(/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i)?.[1];
}
