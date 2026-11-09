export const digits = (value, max = 30) => String(value ?? '').replace(/\D/g, '').slice(0, max);
export function formatPostalCode(value) { return digits(value, 8).replace(/^(\d{5})(\d)/, '$1-$2'); }
export function formatDocument(value) {
  const text = digits(value, 14);
  return text.length <= 11 ? text.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2')
    : text.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
}
export function formatPhone(value) {
  let text = digits(value, 13);
  if (text.length > 11 && text.startsWith('55')) text = text.slice(2);
  text = text.slice(0, 11);
  if (text.length <= 2) return text;
  const body = text.slice(2), split = text.length === 11 ? 5 : 4;
  return `(${text.slice(0, 2)}) ${body.length > split ? `${body.slice(0, split)}-${body.slice(split)}` : body}`;
}
export function formatMoneyInput(value) {
  const raw = digits(value, 11);
  if (!raw) return '';
  const text = raw.padStart(3, '0');
  const whole = text.slice(0, -2).replace(/^0+(?=\d)/, '');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${text.slice(-2)}`;
}
export function centsInput(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Valor monetário inválido.');
  return formatMoneyInput(String(value));
}
export function moneyToCents(value, max = 100000000) {
  const text = String(value).trim().replace(/^R\$\s*/, '');
  if (!/^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/.test(text)) throw new Error('Informe um valor em reais, como 1.234,56.');
  const [whole, fraction = ''] = text.replaceAll('.', '').split(',');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(result) || result > max) throw new Error('Valor fora do limite permitido.');
  return result;
}
export function maskInput(value, kind) {
  if (kind === 'money') return formatMoneyInput(value);
  if (kind === 'document') return formatDocument(value);
  if (kind === 'phone') return formatPhone(value);
  if (kind === 'postalCode') return formatPostalCode(value);
  if (kind === 'integer') return digits(value, 9);
  if (kind === 'contact') return /[a-z@]/i.test(value) ? value : formatPhone(value);
  return value;
}
