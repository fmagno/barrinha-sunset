// Barrinha Experience — configuration & tunable constants.
// All bands and weights live here so scoring can be tuned without touching logic.

export const LOCATION = {
  name: 'Faro',
  lat: 37.0194,
  lon: -7.9304,
  ipmaCityId: 1080500,   // city daily forecast (air temp)
  ipmaSeaId: 1080526,    // nearest oceanography coastal point (water temp)
  timezone: 'Europe/Lisbon',
};

export const ENDPOINTS = {
  ipmaCityDaily: `https://api.ipma.pt/open-data/forecast/meteorology/cities/daily/${LOCATION.ipmaCityId}.json`,
  // oceanography is split across one file per forecast day (0, 1, 2)
  ipmaSeaDay: (n) =>
    `https://api.ipma.pt/open-data/forecast/oceanography/daily/hp-daily-sea-forecast-day${n}.json`,
  // timeformat=unixtime → hourly times are absolute UTC epochs, so low-tide
  // instants can be matched to sunset without any timezone ambiguity.
  openMeteoMarine:
    `https://marine-api.open-meteo.com/v1/marine?latitude=${LOCATION.lat}&longitude=${LOCATION.lon}` +
    `&hourly=sea_level_height_msl&timeformat=unixtime&timezone=${encodeURIComponent(LOCATION.timezone)}`,
  openMeteoWind:
    `https://api.open-meteo.com/v1/forecast?latitude=${LOCATION.lat}&longitude=${LOCATION.lon}` +
    `&daily=wind_speed_10m_max,wind_direction_10m_dominant&timezone=${encodeURIComponent(LOCATION.timezone)}`,
  // Hourly air temp + wind for the per-day timeline chart (unixtime = UTC epochs).
  openMeteoHourly:
    `https://api.open-meteo.com/v1/forecast?latitude=${LOCATION.lat}&longitude=${LOCATION.lon}` +
    `&hourly=temperature_2m,wind_speed_10m&timeformat=unixtime&timezone=${encodeURIComponent(LOCATION.timezone)}`,
};

// Normalization bands: [valueAt0, valueAt1]. Sub-score is linearly interpolated
// between them and clamped to [0,1]. Direction is encoded by the ordering.
export const BANDS = {
  // Tide: gap in minutes between sunset and the NEAREST low tide (smaller is
  // better). Discrete star bands, evaluated top-down; first match wins.
  tide: {
    steps: [
      { maxMin: 45, stars: 5 },   // < 45 min
      { maxMin: 60, stars: 4 },   // <= 1h
      { maxMin: 90, stars: 3 },   // <= 1h30
      { maxMin: 120, stars: 2 },  // <= 2h
      { maxMin: Infinity, stars: 1 }, // > 2h
    ],
  },
  airTemp: { at0: 10, at1: 30 },     // °C: higher is better
  waterTemp: { at0: 14, at1: 24 },   // °C: higher is better
  wind: { at0: 40, at1: 0 },         // km/h: lower is better
  // Sunset->moonrise gap: discrete star bands (smaller gap is better).
  // Each row = upper bound (inclusive) in minutes -> star rating. The star
  // rating maps to a [0,1] sub-score via (stars-1)/4 so it aggregates with the
  // other factors. Bands are evaluated top-down; first match wins.
  sunMoonGapMin: {
    steps: [
      { maxMin: 45, stars: 5 },   // <= 45 min
      { maxMin: 75, stars: 4 },   // <= 1h15
      { maxMin: 150, stars: 3 },  // <= 2h30
      { maxMin: 240, stars: 2 },  // <= 4h
      { maxMin: Infinity, stars: 1 }, // > 4h
    ],
  },
};

// Equal weights across all factors. Tune freely; only ratios matter.
export const WEIGHTS = {
  tide: 1,
  airTemp: 1,
  waterTemp: 1,
  wind: 1,
  sunMoonGap: 1,
};

export const CACHE = {
  key: 'barrinha-experience-cache-v3', // v3: added hourly temp/wind series
  ttlMs: 6 * 60 * 60 * 1000, // 6 hours
};

// Timeline chart: axis ranges double as the value→colour scale for each line.
export const CHART = {
  spanHours: 12,                     // total window width, centred on sunset
  tempRange: { min: 10, max: 40 },   // °C
  windRange: { min: 0, max: 45 },    // km/h
  tempColors: ['#3b82f6', '#22c55e', '#eab308', '#ef4444'], // cold → hot
  windColors: ['#22c55e', '#a3e635', '#f59e0b', '#ef4444'], // calm → strong
  // Plot background: flat daytime sky (left) and flat night (right), with the
  // whole day→night change squeezed into `transitionHours` around sunset. The
  // sunset mix (haze → orange centre → dusk) is spread across that band.
  skyDay: '#5a8fc0',
  skyNight: '#0a1330',
  sunsetMix: ['#8fa0c0', '#e08a4c', '#8a5a86'],
  transitionHours: 1,
};

// Human-readable labels + units for the render layer.
export const FACTOR_META = {
  tide: { label: 'Low tide ↔ sunset', unit: 'min', fmt: (v) => Math.round(v).toString() },
  airTemp: { label: 'Air temp', unit: '°C', fmt: (v) => v.toFixed(1) },
  waterTemp: { label: 'Water temp', unit: '°C', fmt: (v) => v.toFixed(1) },
  wind: { label: 'Wind', unit: 'km/h', fmt: (v) => v.toFixed(0) },
  sunMoonGap: { label: 'Sunset↔Moonrise', unit: 'min', fmt: (v) => Math.round(v).toString() },
};
