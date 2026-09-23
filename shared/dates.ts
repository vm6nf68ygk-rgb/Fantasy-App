// Hockey days are calendar dates in US Eastern time, formatted YYYY-MM-DD.

export function todayEastern(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
}

export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function isValidDate(s: string | null | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`));
}

/** NHL season id for a date, e.g. 20262027. Seasons roll over in September. */
export function seasonForDate(date: string): number {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const start = month >= 9 ? year : year - 1;
  return start * 10000 + start + 1;
}

export function previousSeason(season: number): number {
  const start = Math.floor(season / 10000) - 1;
  return start * 10000 + start + 1;
}

export function formatSeason(season: number): string {
  const start = Math.floor(season / 10000);
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}
