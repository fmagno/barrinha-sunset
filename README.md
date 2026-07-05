# Barrinha Experience 🌅

A **client-side-only** web app that scores each upcoming day in **Faro, Portugal** from
1–5 ★ for how good the environmental conditions are for the target activity.

No backend, no API keys — safe to host on GitHub Pages.

## What it scores

Each day gets a weighted score from five factors (equal weight, tunable):

| Factor | Best condition | Source |
|---|---|---|
| Tide | as low as possible | Open-Meteo Marine (`sea_level_height_msl`) |
| Air temp | as high as possible | IPMA city daily forecast |
| Water temp | as high as possible | IPMA oceanography daily forecast |
| Wind | as close to 0 as possible | Open-Meteo forecast (`wind_speed_10m_max`) |
| Sunset ↔ moonrise gap | as small as possible | SunCalc (computed in-browser) |

Scored horizon ≈ **3 days** (bounded by IPMA's oceanography files).

## Run locally

```bash
# from this directory (repo root)
python3 -m http.server 8080
# then open http://localhost:8080
```

(A plain static server is required — ES modules don't load over `file://`.)

## Deploy (GitHub Pages)

Push to `main`, then in repo **Settings → Pages** set source to **Deploy from a branch**,
branch `main`, folder `/ (root)`. The site serves `index.html` directly.

## Structure

```
index.html        # shell; loads SunCalc then the ES-module app
styles.css
lib/suncalc.js    # vendored (MIT) — astronomy, no network
js/
  config.js       # location ids, endpoints, normalization bands, weights
  fetch.js        # all data fetches + localStorage cache (6 h TTL)
  astronomy.js    # sunset & closest moonrise per date
  normalize.js    # merge sources by date → per-day records
  scoring.js      # pure: (dayRecord, weights) → { subScores, stars }
  render.js       # one card per day: stars + factor breakdown
  main.js         # orchestration
docs/spec.md      # full specification & locked decisions
```

## Tuning

All normalization bands and factor weights live in [`js/config.js`](js/config.js).
Scoring is a pure function in [`js/scoring.js`](js/scoring.js), easy to test and adjust.
