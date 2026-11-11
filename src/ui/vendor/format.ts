// Vendored from betterfanslink lib/format.ts (main d4138f9): formatNumber, formatDate, plural and the times RelativeTime shows.

const num = new Intl.NumberFormat('en-US');
const numCompact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

export function formatNumber(value: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (value === null || value === undefined) return '';
  return opts.compact && Math.abs(value) >= 10_000 ? numCompact.format(value) : num.format(value);
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' });

/** "just now", "4 min ago", "in 3 hr", "Sep 12". Past dates older than a week show the date. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const diff = t - now;
  const abs = Math.abs(diff);
  // A few seconds ahead is the server's clock running ahead of this one, not the future.
  if (abs < 45_000) return diff <= 5_000 ? 'just now' : 'in a moment';
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), 'minute');
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), 'hour');
  if (abs < 7 * 86_400_000) return rtf.format(Math.round(diff / 86_400_000), 'day');
  return formatDate(iso);
}

const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const dateYearFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const absoluteFmt = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  timeZoneName: 'short',
});

/** "Sep 12", or "Sep 12, 2025" outside the current year. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.getFullYear() === new Date().getFullYear() ? dateFmt.format(d) : dateYearFmt.format(d);
}

/** "Sep 12, 2026, 2:03:12 PM EDT", the local absolute time for hovers. */
export function absoluteTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : absoluteFmt.format(d);
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${formatNumber(count)} ${count === 1 ? one : many}`;
}
