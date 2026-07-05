// Astronomy layer: sunset & moonrise per date, and the gap between them.
// Uses the vendored SunCalc UMD global (loaded via <script> before the module).
import { LOCATION } from './config.js';

const SunCalc = window.SunCalc;

// Local noon anchors the day so getTimes/getMoonTimes resolve the right date
// regardless of the browser's timezone.
function noonOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

const DAY_MS = 86400000;
const isDate = (d) => d instanceof Date && !isNaN(d);

// Emoji for the 8 lunar phases, in cycle order (new → waxing → full → waning).
const MOON_ICONS = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];

// Moon illumination for a date → { icon, fraction }. icon is the phase emoji
// (round(phase*8)%8: 0→🌑 new, 0.25→🌓 first qtr, 0.5→🌕 full, 0.75→🌗 last qtr);
// fraction is the illuminated portion (0 new … 1 full).
function moonInfoFor(date) {
  const { phase, fraction } = SunCalc.getMoonIllumination(date);
  return { icon: MOON_ICONS[Math.round(phase * 8) % 8], fraction };
}

// Returns { sunset: Date|null, moonrise: Date|null, gapMin: number|null }.
// The moonrise picked is the one CLOSEST to sunset, searched across the previous,
// current, and next local day. SunCalc.getMoonTimes only reports events within a
// single local-day window, so near midnight the same-day query can return the
// prior evening's rise; scanning ±1 day and minimizing |moonrise − sunset| gives
// the moonrise that actually matters for the evening around sunset.
export function astronomyFor(dateStr) {
  const base = noonOf(dateStr);
  const sunset = SunCalc.getTimes(base, LOCATION.lat, LOCATION.lon).sunset ?? null;

  const candidates = [];
  for (const offset of [-1, 0, 1]) {
    const day = new Date(base.getTime() + offset * DAY_MS);
    const rise = SunCalc.getMoonTimes(day, LOCATION.lat, LOCATION.lon).rise;
    if (isDate(rise)) candidates.push(rise);
  }

  let moonrise = null;
  let gapMin = null;
  if (isDate(sunset) && candidates.length) {
    moonrise = candidates.reduce((best, r) =>
      Math.abs(r - sunset) < Math.abs(best - sunset) ? r : best);
    gapMin = Math.abs(moonrise.getTime() - sunset.getTime()) / 60000;
  }
  const moon = moonInfoFor(base);
  return { sunset, moonrise, gapMin, moonIcon: moon.icon, moonFraction: moon.fraction };
}
