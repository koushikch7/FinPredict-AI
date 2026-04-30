export const fmtINR = (n: number | null | undefined, opts: { decimals?: number } = {}) => {
  if (n == null || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: opts.decimals ?? 2,
  }).format(n);
};

export const fmtPct = (n: number | null | undefined, decimals = 2) => {
  if (n == null || Number.isNaN(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(decimals)}%`;
};

export const fmtNum = (n: number | null | undefined, decimals = 2) => {
  if (n == null || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: decimals }).format(n);
};

/**
 * SQLite stores `CURRENT_TIMESTAMP` as a UTC string with no timezone marker
 * (e.g. `"2026-04-30 12:32:02"`). When passed straight to `new Date()`, most
 * browsers parse such strings as **local time**, which produces an off-by-TZ
 * display. Normalise here: if the string looks like a SQL timestamp without
 * an explicit zone or offset, treat it as UTC by inserting the `T` separator
 * and appending `Z`.
 */
export const parseServerDate = (s: string | Date | null | undefined): Date | null => {
  if (s == null) return null;
  if (s instanceof Date) return s;
  const str = String(s);
  // Already has a timezone designator (Z or ±HH:MM) → trust it.
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(str)) return new Date(str);
  // SQL-style "YYYY-MM-DD HH:MM:SS[.fff]" → UTC.
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)$/.exec(str);
  if (m) return new Date(`${m[1]}T${m[2]}Z`);
  return new Date(str);
};

export const fmtDate = (s: string | Date | null | undefined) => {
  if (!s) return '—';
  const d = parseServerDate(s);
  if (!d || Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/** Short IST-only formatter for compact cells (e.g. trade tape "When" column). */
export const fmtDateTimeIST = (s: string | Date | null | undefined) => {
  if (!s) return '—';
  const d = parseServerDate(s);
  if (!d || Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }) + ' IST';
};
