/**
 * Returns true if NSE is currently open (Mon-Fri, 09:15-15:30 IST).
 * Holidays are not modelled here; production systems should plug in an NSE holiday list.
 */
export function isNseOpen(now: Date = new Date()): boolean {
  // Convert to IST regardless of server TZ
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const day = ist.getDay(); // 0 Sun .. 6 Sat
  if (day === 0 || day === 6) return false;
  const minutes = ist.getHours() * 60 + ist.getMinutes();
  return minutes >= 9 * 60 + 15 && minutes <= 15 * 60 + 30;
}

export function nowIstISO(): string {
  return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}
