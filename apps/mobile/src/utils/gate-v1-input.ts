export function gateV1Input(value: string) {
  const text = value.trim();
  if (text.length > 1024) throw new Error('Código muito longo. Leia somente o QR ou código do ingresso.');
  if (/^INGV1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(text)) return text;
  const code = text.replace(/[\s-]/g, '').toUpperCase();
  if (!/^[A-F0-9]{16}$/.test(code)) throw new Error('Digite os 16 caracteres do código impresso ou leia o QR do ingresso V1.');
  return code.match(/.{4}/g)!.join('-');
}
