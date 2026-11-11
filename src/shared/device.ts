// Where a step was reported from, read from the request's user agent. Pure.
// Coarse on purpose: the table keeps phone, tablet or computer and never the
// user agent itself. The rule is @arvo/traffic's (src/shared/device.ts), so
// both pages call the same browser the same thing.

export type DeviceClass = 'phone' | 'tablet' | 'computer';

/**
 * Phone, tablet or computer. An iPad in desktop mode reports itself as a Mac,
 * so a "Macintosh" with touch points is a tablet. The funnel is given the
 * user agent alone, so there that iPad reads as a computer.
 */
export function deviceClass(userAgent: string, touchPoints: number | null = null): DeviceClass {
  if (/iPad|Tablet|PlayBook|Silk\/|Kindle|SM-T\d|Lenovo TB|Nexus (7|9|10)\b/i.test(userAgent)) return 'tablet';
  if (/Macintosh/i.test(userAgent) && (touchPoints ?? 0) > 1) return 'tablet';
  if (/Android/i.test(userAgent) && !/Mobile/i.test(userAgent)) return 'tablet';
  if (/Mobi|iPhone|iPod|Android|Windows Phone|BlackBerry|Opera Mini/i.test(userAgent)) return 'phone';
  return 'computer';
}
