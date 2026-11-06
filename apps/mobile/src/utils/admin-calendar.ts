// Calendar values are wall-clock dates in Patos. Never convert via device timezone.
export interface CalendarDate { year: number; month: number; day: number }
export function readCalendarValue(value: string): (CalendarDate & { hour: string; minute: string }) | null {
  const parts = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(value);
  if (!parts) return null;
  const [, year, month, day, hour, minute] = parts;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day) || Number(hour) > 23 || Number(minute) > 59) return null;
  return { year: Number(year), month: Number(month) - 1, day: Number(day), hour: hour!, minute: minute! };
}
export function calendarValue(date: CalendarDate, hour: string, minute: string) {
  return `${date.year}-${String(date.month + 1).padStart(2, '0')}-${String(date.day).padStart(2, '0')} ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
}
export function calendarMonth(year: number, month: number) {
  const first = new Date(Date.UTC(year, month, 1, 12));
  const offset = (first.getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(Date.UTC(year, month, index - offset + 1, 12));
    return { year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate() };
  });
}
export function shiftCalendarMonth(year: number, month: number, delta: number) {
  const date = new Date(Date.UTC(year, month + delta, 1, 12));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() };
}
export function calendarToday() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value);
  return { year: part('year'), month: part('month') - 1, day: part('day') };
}
export function displayCalendarValue(value: string) {
  const parsed = readCalendarValue(value);
  return parsed ? `${String(parsed.day).padStart(2, '0')}/${String(parsed.month + 1).padStart(2, '0')}/${parsed.year} · ${parsed.hour}:${parsed.minute}` : value;
}
