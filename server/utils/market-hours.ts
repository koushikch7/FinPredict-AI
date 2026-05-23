/**
 * NSE Market Holidays — updated yearly.
 * Source: https://www.nseindia.com/resources/exchange-communication-holidays
 *
 * Format: 'YYYY-MM-DD'
 * These can also be fetched from Kite's /instruments/holidays endpoint if a
 * valid session exists; the static list acts as a reliable offline fallback.
 */
const NSE_HOLIDAYS: Set<string> = new Set([
  // 2025
  '2025-02-26', // Mahashivratri
  '2025-03-14', // Holi
  '2025-03-31', // Id-Ul-Fitr (Ramadan)
  '2025-04-10', // Shri Mahavir Jayanti
  '2025-04-14', // Dr. Baba Saheb Ambedkar Jayanti
  '2025-04-18', // Good Friday
  '2025-05-01', // Maharashtra Day
  '2025-06-07', // Bakri Id
  '2025-08-15', // Independence Day
  '2025-08-16', // Ashura
  '2025-08-27', // Janmashtami
  '2025-10-02', // Mahatma Gandhi Jayanti
  '2025-10-21', // Diwali (Laxmi Pujan)
  '2025-10-22', // Diwali (Balipratipada)
  '2025-11-05', // Guru Nanak Jayanti (Prakash Utsav)
  '2025-12-25', // Christmas
  // 2026
  '2026-01-26', // Republic Day
  '2026-02-17', // Mahashivratri
  '2026-03-03', // Holi
  '2026-03-20', // Id-Ul-Fitr (Ramadan)
  '2026-03-30', // Shri Ram Navami
  '2026-04-03', // Good Friday
  '2026-04-14', // Dr. Baba Saheb Ambedkar Jayanti
  '2026-05-01', // Maharashtra Day
  '2026-05-27', // Bakri Id
  '2026-06-25', // Muharram
  '2026-08-15', // Independence Day
  '2026-08-18', // Janmashtami
  '2026-08-25', // Milad-un-Nabi
  '2026-10-02', // Mahatma Gandhi Jayanti
  '2026-10-09', // Dussehra
  '2026-10-29', // Diwali (Laxmi Pujan)
  '2026-10-30', // Diwali (Balipratipada)
  '2026-11-25', // Guru Nanak Jayanti (Prakash Utsav)
  '2026-12-25', // Christmas
]);

/**
 * Returns true if the given date (IST) is an NSE market holiday.
 */
export function isMarketHoliday(date: Date = new Date()): boolean {
  const ist = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const dateStr = ist.toISOString().slice(0, 10);
  return NSE_HOLIDAYS.has(dateStr);
}

/**
 * Returns true if NSE is currently open (Mon-Fri, 09:15-15:30 IST, excluding holidays).
 */
export function isNseOpen(now: Date = new Date()): boolean {
  // Convert to IST regardless of server TZ
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const day = ist.getDay(); // 0 Sun .. 6 Sat
  if (day === 0 || day === 6) return false;
  if (isMarketHoliday(now)) return false;
  const minutes = ist.getHours() * 60 + ist.getMinutes();
  return minutes >= 9 * 60 + 15 && minutes <= 15 * 60 + 30;
}

/**
 * Returns true if today is a trading day (weekday + not a holiday).
 * Useful for deciding whether to fetch quotes.
 */
export function isTradingDay(date: Date = new Date()): boolean {
  const ist = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const day = ist.getDay();
  if (day === 0 || day === 6) return false;
  return !isMarketHoliday(date);
}

/**
 * Returns upcoming holidays for display in the UI.
 */
export function getUpcomingHolidays(limit = 5): Array<{ date: string; name: string }> {
  const ist = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const today = ist.toISOString().slice(0, 10);

  const holidayNames: Record<string, string> = {};
  // Build name map from the comments above — keep in sync
  const nameList = [
    ['2025-02-26', 'Mahashivratri'], ['2025-03-14', 'Holi'], ['2025-03-31', 'Id-Ul-Fitr'],
    ['2025-04-10', 'Mahavir Jayanti'], ['2025-04-14', 'Ambedkar Jayanti'], ['2025-04-18', 'Good Friday'],
    ['2025-05-01', 'Maharashtra Day'], ['2025-06-07', 'Bakri Id'], ['2025-08-15', 'Independence Day'],
    ['2025-08-16', 'Ashura'], ['2025-08-27', 'Janmashtami'], ['2025-10-02', 'Gandhi Jayanti'],
    ['2025-10-21', 'Diwali (Laxmi Pujan)'], ['2025-10-22', 'Diwali (Balipratipada)'],
    ['2025-11-05', 'Guru Nanak Jayanti'], ['2025-12-25', 'Christmas'],
    ['2026-01-26', 'Republic Day'], ['2026-02-17', 'Mahashivratri'], ['2026-03-03', 'Holi'],
    ['2026-03-20', 'Id-Ul-Fitr'], ['2026-03-30', 'Shri Ram Navami'], ['2026-04-03', 'Good Friday'],
    ['2026-04-14', 'Ambedkar Jayanti'], ['2026-05-01', 'Maharashtra Day'],
    ['2026-05-27', 'Bakri Id'], ['2026-06-25', 'Muharram'], ['2026-08-15', 'Independence Day'],
    ['2026-08-18', 'Janmashtami'], ['2026-08-25', 'Milad-un-Nabi'], ['2026-10-02', 'Gandhi Jayanti'],
    ['2026-10-09', 'Dussehra'], ['2026-10-29', 'Diwali (Laxmi Pujan)'], ['2026-10-30', 'Diwali (Balipratipada)'],
    ['2026-11-25', 'Guru Nanak Jayanti'], ['2026-12-25', 'Christmas'],
  ] as const;
  for (const [d, n] of nameList) holidayNames[d] = n;

  return Array.from(NSE_HOLIDAYS)
    .filter((d) => d >= today)
    .sort()
    .slice(0, limit)
    .map((date) => ({ date, name: holidayNames[date] ?? 'Market Holiday' }));
}

export function nowIstISO(): string {
  return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}
