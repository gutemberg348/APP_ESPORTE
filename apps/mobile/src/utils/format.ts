export const money = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
export const matchDate = (value: string) => {
  const date = new Date(value);
  const day = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'America/Fortaleza' }).format(date).replaceAll('.', '');
  const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Fortaleza' }).format(date);
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} - ${time}`;
};
export const messageOf = (error: unknown) => error instanceof Error ? error.message : 'Não foi possível concluir a operação.';
