// Fetch layer: pulls all remote sources, with a timestamped localStorage cache.
import { ENDPOINTS, LOCATION, CACHE } from './config.js';
import { localToday } from './normalize.js';

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.json();
}

// --- Individual source fetchers, each returning a normalized-ish shape ------

// IPMA city daily → [{ date, tMin, tMax }]
async function fetchIpmaAir() {
  const d = await getJSON(ENDPOINTS.ipmaCityDaily);
  return d.data.map((r) => ({
    date: r.forecastDate,
    tMin: parseFloat(r.tMin),
    tMax: parseFloat(r.tMax),
  }));
}

// IPMA oceanography (3 day-files) → [{ date, sstMin, sstMax }]
async function fetchIpmaWater() {
  const out = [];
  for (let n = 0; n < 3; n++) {
    try {
      const d = await getJSON(ENDPOINTS.ipmaSeaDay(n));
      const p = d.data.find((x) => x.globalIdLocal === LOCATION.ipmaSeaId);
      if (p) {
        out.push({
          date: d.forecastDate.slice(0, 10),
          sstMin: parseFloat(p.sstMin),
          sstMax: parseFloat(p.sstMax),
        });
      }
    } catch (e) {
      console.warn('ocean day', n, 'failed:', e.message);
    }
  }
  return out;
}

// Open-Meteo marine → [lowTideMs, …] absolute UTC epoch-ms of each low tide.
// Detects local minima of the hourly sea-level curve and refines each to
// sub-hourly precision via parabolic interpolation of its three points.
async function fetchTide() {
  const d = await getJSON(ENDPOINTS.openMeteoMarine);
  const { time, sea_level_height_msl: h } = d.hourly; // time = unix seconds (UTC)
  const lows = [];
  for (let i = 1; i < time.length - 1; i++) {
    const a = h[i - 1], b = h[i], c = h[i + 1];
    if (a == null || b == null || c == null) continue;
    if (b <= a && b <= c && (b < a || b < c)) {
      const denom = a - 2 * b + c; // parabola curvature
      let offHours = denom > 0 ? (0.5 * (a - c)) / denom : 0; // vertex within [-0.5, 0.5]
      if (!isFinite(offHours) || Math.abs(offHours) > 1) offHours = 0;
      const ms = time[i] * 1000 + offHours * 3600000;
      // Collapse flat-trough duplicates: real low tides are ~12.4 h apart, so any
      // detected minimum within 6 h of the last one is the same trough.
      if (lows.length && ms - lows[lows.length - 1] < 6 * 3600000) continue;
      lows.push(ms);
    }
  }
  return lows;
}

// Open-Meteo forecast → [{ date, windMaxKmh, weatherCode }]
async function fetchWind() {
  const d = await getJSON(ENDPOINTS.openMeteoWind);
  const { time, wind_speed_10m_max, weather_code } = d.daily;
  return time.map((date, i) => ({
    date,
    windMaxKmh: wind_speed_10m_max[i],
    weatherCode: weather_code[i],
  }));
}

// Open-Meteo hourly → { t: [epoch-ms…], temp: [°C…], wind: [km/h…] } for the chart.
async function fetchHourly() {
  const d = await getJSON(ENDPOINTS.openMeteoHourly);
  const { time, temperature_2m, wind_speed_10m } = d.hourly;
  return {
    t: time.map((s) => s * 1000),
    temp: temperature_2m,
    wind: wind_speed_10m,
  };
}

// --- Orchestration + cache --------------------------------------------------

async function fetchAllFresh() {
  const [air, water, tide, wind, hourly] = await Promise.all([
    fetchIpmaAir(),
    fetchIpmaWater(),
    fetchTide(),
    fetchWind(),
    fetchHourly(),
  ]);
  return { air, water, tide, wind, hourly };
}

// Returns { sources, fetchedAt, fromCache }.
export async function loadSources({ force = false } = {}) {
  if (!force) {
    const cached = readCache();
    if (cached) return { ...cached, fromCache: true };
  }
  const sources = await fetchAllFresh();
  const fetchedAt = Date.now();
  writeCache({ sources, fetchedAt, day: localToday() });
  return { sources, fetchedAt, fromCache: false };
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE.key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Bust across a local day boundary so we never show yesterday's horizon,
    // even if still within the TTL window.
    if (parsed.day !== localToday()) return null;
    if (Date.now() - parsed.fetchedAt > CACHE.ttlMs) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(payload) {
  try {
    localStorage.setItem(CACHE.key, JSON.stringify(payload));
  } catch {
    /* quota / private mode — ignore, app still works without cache */
  }
}
