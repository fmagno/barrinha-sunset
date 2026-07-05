# Barrinha Experience — Faro Activity Meteo Scorer

Client-side-only web app that fetches multi-day forecast data for Faro, Portugal,
evaluates each day against a fixed set of environmental attributes, and produces a
1–5 star score for how good conditions are for the target activity.

## Locked decisions (2026-07-04)

| Decision | Choice |
|---|---|
| Tide source | **Open-Meteo Marine API** (`sea_level_height_msl`) — no key, no proxy, CORS-friendly |
| Wind source | **Open-Meteo forecast API** (`wind_speed_10m_max`, raw km/h) |
| Weighting | **Equal weights**, as tunable named constants |
| Frontend stack | **Plain HTML/CSS/JS**, ES modules, no build step (GitHub Pages ready) |

The whole app is **keyless and static**. Only IPMA supplies air + water temp; Open-Meteo
supplies tide + wind; SunCalc computes astronomy in-browser.

## Location

- Faro, Portugal
- IPMA city `globalIdLocal`: **1080500** (city daily forecast)
- IPMA sea point `globalIdLocal`: **1080526** (oceanography, nearest coastal point — lat 37.19, lon -8.00)
- Coordinates for astronomy / Open-Meteo: **lat 37.0194, lon -7.9304**

> The original spec's id `1170300` was wrong (404). Verified correct ids at runtime 2026-07-04.

## Data sources (all verified live)

### IPMA — open data, no key, CORS-friendly
- **City daily forecast** (air temp): `https://api.ipma.pt/open-data/forecast/meteorology/cities/daily/1080500.json`
  - Fields used: `tMin`, `tMax`, `forecastDate`. (`classWindSpeed` present but unused — wind comes from Open-Meteo.)
  - Horizon: ~5 days.
- **Oceanography daily forecast** (water temp): `https://api.ipma.pt/open-data/forecast/oceanography/daily/hp-daily-sea-forecast-day{0,1,2}.json`
  - Three separate files (day 0, 1, 2). Each is an array of ~12 coastal points; filter to `globalIdLocal === 1080526`.
  - Fields used: `sstMin`, `sstMax`, plus file-level `forecastDate`.
  - **Horizon: 3 days** — this is the binding constraint on how many days can be scored.

### Open-Meteo — no key, CORS-friendly
- **Marine** (tide): `https://marine-api.open-meteo.com/v1/marine?latitude=37.0194&longitude=-7.9304&hourly=sea_level_height_msl&timeformat=unixtime&timezone=Europe/Lisbon`
  - Hourly `sea_level_height_msl`. **Low-tide instants** are detected as local minima of the curve (parabolic sub-hourly refinement); `timeformat=unixtime` gives absolute UTC epochs so they match sunset without timezone ambiguity. Best condition = a low tide near sunset.
- **Forecast** (wind): `https://api.open-meteo.com/v1/forecast?latitude=37.0194&longitude=-7.9304&daily=wind_speed_10m_max,wind_direction_10m_dominant&timezone=Europe/Lisbon`
  - Daily `wind_speed_10m_max` (km/h) — used for the wind **score**.
- **Forecast hourly** (chart): `…&hourly=temperature_2m,wind_speed_10m&timeformat=unixtime&timezone=Europe/Lisbon`
  - Hourly `temperature_2m` (°C) + `wind_speed_10m` (km/h), UTC epochs — drives the per-day timeline **chart** (not the score).

### Astronomy — SunCalc.js, vendored at `app/lib/suncalc.js`
- `SunCalc.getTimes(date, lat, lon).sunset`
- `SunCalc.getMoonTimes(date, lat, lon).rise`
- Combined into one factor: the **absolute gap** between sunset and moonrise (smaller = better).

## Scored attributes & normalization (→ [0,1], higher = better)

| Factor | Raw input | Normalization | Band (tunable) |
|---|---|---|---|
| Tide | \|sunset − nearest low tide\| (min) | discrete star bands → `(stars-1)/4` | <45m=5★, ≤1h=4★, ≤1h30=3★, ≤2h=2★, >2h=1★ |
| Air temp | mean of `tMin`,`tMax` (°C) | higher → higher | 10 °C→0, 30 °C→1 |
| Water temp | mean of `sstMin`,`sstMax` (°C) | higher → higher | 14 °C→0, 24 °C→1 |
| Wind | `wind_speed_10m_max` (km/h) | lower → higher | 0 km/h→1, 40 km/h→0 |
| Sun↔Moon gap | \|sunset − moonrise\| (min) | discrete star bands → `(stars-1)/4` | ≤45m=5★, ≤1h15=4★, ≤2h30=3★, ≤4h=2★, >4h=1★ |

All bands live as named constants in `js/config.js`.

## Scoring

- Per-factor sub-score clamped to [0,1].
- `weightedAverage = Σ(subScore·weight) / Σ(weight)` over factors present that day.
- Missing factor (e.g. tide gap in data) is dropped from both numerator and denominator, not scored as 0.
- **Stars** = `round(weightedAverage × 4) + 1` → integer 1–5.
- Scoring is a pure function `(dayRecord, weights) → { subScores, weightedAverage, stars }` for easy testing/tuning.

## Architecture

```
app/
  index.html          # shell, loads suncalc + echarts + main.js (module)
  styles.css
  lib/suncalc.js      # vendored (UMD global SunCalc)
  lib/echarts.min.js  # vendored (UMD global echarts) — timeline charts
  js/
    config.js         # location ids, endpoints, bands, weights, chart colours
    fetch.js          # all fetches + localStorage cache (timestamped)
    astronomy.js      # sunset/moonrise gap per date via SunCalc
    normalize.js      # merge sources → per-day records + noon→noon hourly slice
    scoring.js        # pure scoring fn + normalization helpers
    render.js         # per day: stars + ECharts 24h timeline + water-temp caption
    main.js           # orchestrate: fetch → normalize → score → render
```

## Rendering (per-day timeline)
Each day is an ECharts chart over a **12h window centred on sunset** (`CHART.spanHours`),
so sunset sits in the middle and the evening/night markers stay on-axis:
- Plot background is a horizontal **day→sunset→night gradient** (sky blue → sunset orange
  at centre → night blue), painted as the ECharts grid `backgroundColor` (`CHART.skyStops`).
- **Air temp** and **wind** as lines, each coloured by value via hidden `visualMap`
  (dual y-axes: °C left, km/h right).
- **Sunset**, **nearest low tide** and **moonrise** as dashed vertical markers (☀/🌊/🌙).
- **Water temp** shown as a value in the caption beside the plot.
- The 1–5★ score stays in the card header.

## Caching
- Responses cached in `localStorage` under a versioned key with a fetch timestamp.
- TTL ~6 h (IPMA refreshes ~2×/day). On load: use cache if fresh, else refetch.
- "Refresh" button forces a refetch.

## Constraints / notes
- Scored horizon = intersection of available dates across sources ≈ **3 days** (IPMA oceanography limit).
- No API keys anywhere — safe to host publicly.
- Astronomy is exact/offline; only weather needs network.
