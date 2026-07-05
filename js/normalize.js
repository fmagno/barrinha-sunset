// Normalize/merge layer: align all sources by forecast date into per-day records.
import { astronomyFor } from './astronomy.js';
import { CHART, weatherInfo } from './config.js';

function indexByDate(arr) {
  const m = new Map();
  for (const r of arr) m.set(r.date, r);
  return m;
}

// Local calendar date as YYYY-MM-DD (matches IPMA / Open-Meteo Europe/Lisbon dates).
export function localToday() {
  const n = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
}

// Given a sunset Date and the low-tide instants (epoch-ms), find the nearest low
// tide and the gap to sunset in minutes. Returns { lowTide: Date|null, gapMin }.
function nearestLowTide(sunset, lowTidesMs) {
  if (!(sunset instanceof Date) || isNaN(sunset) || !lowTidesMs?.length) {
    return { lowTide: null, gapMin: null };
  }
  const s = sunset.getTime();
  const best = lowTidesMs.reduce((a, b) => (Math.abs(b - s) < Math.abs(a - s) ? b : a));
  return { lowTide: new Date(best), gapMin: Math.abs(best - s) / 60000 };
}

// Merge sources into per-day records, from today onward (IPMA feeds lag a cycle
// and still carry yesterday, which we must not display). A day is only included
// when air temp, water temp and wind all exist for it — water temp (IPMA
// oceanography, ~3 days) is the binding constraint on the horizon. Tide is scored
// as the sunset↔nearest-low-tide gap, computable for every day the marine
// forecast covers (7 days), so it never limits the horizon. Astronomy is always
// computable. Returns records sorted by date, with the current day leading.
// Local noon of a YYYY-MM-DD date, as epoch-ms (fallback centre if sunset is
// somehow unavailable). The chart window is centred on sunset (see below).
function localNoonMs(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0).getTime();
}

// Slice the global hourly series to [start, end] → { t, temp, wind }.
function sliceHourly(hourly, start, end) {
  const out = { t: [], temp: [], wind: [] };
  if (!hourly?.t) return out;
  for (let i = 0; i < hourly.t.length; i++) {
    const ts = hourly.t[i];
    if (ts >= start && ts <= end) {
      out.t.push(ts);
      out.temp.push(hourly.temp[i]);
      out.wind.push(hourly.wind[i]);
    }
  }
  return out;
}

export function mergeSources({ air, water, tide, wind, hourly }) {
  const airM = indexByDate(air);
  const waterM = indexByDate(water);
  const windM = indexByDate(wind);
  const lowTidesMs = tide; // flat list of low-tide epoch-ms
  const today = localToday();

  // Intersection of the per-day sources (air, water, wind), today onward.
  const dates = [...airM.keys()]
    .filter((d) => d >= today && waterM.has(d) && windM.has(d))
    .sort();

  return dates.map((date) => {
    const a = airM.get(date);
    const w = waterM.get(date);
    const wd = windM.get(date);
    const astro = astronomyFor(date);
    const { lowTide, gapMin: tideGapMin } = nearestLowTide(astro.sunset, lowTidesMs);
    const weather = weatherInfo(wd.weatherCode);

    // Window is CHART.spanHours wide, centred on sunset (fallback: local 20:00).
    const centerMs =
      astro.sunset instanceof Date && !isNaN(astro.sunset)
        ? astro.sunset.getTime()
        : localNoonMs(date) + 8 * 3600000;
    const halfMs = (CHART.spanHours / 2) * 3600000;
    const winStartMs = centerMs - halfMs;
    const winEndMs = centerMs + halfMs;

    return {
      date,
      raw: {
        tide: tideGapMin, // minutes from sunset to nearest low tide
        airTemp: (a.tMin + a.tMax) / 2,
        waterTemp: (w.sstMin + w.sstMax) / 2,
        wind: wd.windMaxKmh,
        sunMoonGap: astro.gapMin, // may be null
        moonFullness: astro.moonFraction, // 0 new … 1 full
        weather: weather.score, // pre-scored [0,1] from weather code
      },
      astro,     // sunset/moonrise Dates for display
      lowTide,   // nearest low-tide Date for display
      weatherIcon: weather.icon,
      weatherLabel: weather.label,
      winStartMs,
      winEndMs,
      series: sliceHourly(hourly, winStartMs, winEndMs), // hourly temp/wind for the chart
    };
  });
}
