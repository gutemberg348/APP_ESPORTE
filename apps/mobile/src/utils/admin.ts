export function formDate(value: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
  const part = (name: string) => parts.find((item) => item.type === name)?.value;
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`;
}
export function parseClubDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value.trim())) throw new Error('Use a data no formato AAAA-MM-DD HH:mm, no horário de Patos.');
  const date = new Date(`${value.trim().replace(' ', 'T')}:00-03:00`);
  if (!Number.isFinite(date.getTime()) || formDate(date.toISOString()) !== value.trim()) throw new Error('Data ou horário inválido.');
  return date.toISOString();
}
export function appliedReportFilters(draft: Record<string, string>): Record<string, string> {
  const result = Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, value.trim()]));
  if (result.from) result.from = parseClubDate(result.from);
  // The minute entered in the inclusive end field includes its last second.
  if (result.to) result.to = new Date(Date.parse(parseClubDate(result.to)) + 59999).toISOString();
  if (result.from && result.to && result.from > result.to) throw new Error('O fim do período deve ser posterior ao início.');
  return { ...result, limit: '25', offset: '0' };
}
