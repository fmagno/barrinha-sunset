// Scoring layer: pure functions. (dayRecord, weights) → { subScores, weightedAverage, stars }.
import { BANDS, WEIGHTS } from './config.js';

const clamp01 = (x) => Math.max(0, Math.min(1, x));

// Normalize a raw value to a [0,1] sub-score.
// - Stepped band ({ steps: [{maxMin, stars}, …] }): first row whose maxMin the
//   value does not exceed wins; its star rating maps to (stars-1)/4.
// - Linear band ({ at0, at1 }): interpolate between at0 (→0) and at1 (→1);
//   direction is encoded by the ordering. Clamped to [0,1].
export function normalize(value, band) {
  if (value == null || Number.isNaN(value)) return null;
  if (band.steps) {
    const step = band.steps.find((s) => value <= s.maxMin) ?? band.steps[band.steps.length - 1];
    return (step.stars - 1) / 4;
  }
  const { at0, at1 } = band;
  if (at1 === at0) return 0.5;
  return clamp01((value - at0) / (at1 - at0));
}

// Maps raw.<factor> → band key. sunMoonGap uses its own band name.
const RAW_TO_BAND = {
  tide: 'tide',
  airTemp: 'airTemp',
  waterTemp: 'waterTemp',
  wind: 'wind',
  sunMoonGap: 'sunMoonGapMin',
  moonFullness: 'moonFullness',
  weather: 'weather',
};

// Maps raw.<factor> → weight key.
const RAW_TO_WEIGHT = {
  tide: 'tide',
  airTemp: 'airTemp',
  waterTemp: 'waterTemp',
  wind: 'wind',
  sunMoonGap: 'sunMoonGap',
  moonFullness: 'moonFullness',
  weather: 'weather',
};

export function scoreDay(dayRecord, weights = WEIGHTS) {
  const subScores = {};
  let num = 0;
  let den = 0;

  for (const factor of Object.keys(RAW_TO_BAND)) {
    const raw = dayRecord.raw[factor];
    const sub = normalize(raw, BANDS[RAW_TO_BAND[factor]]);
    subScores[factor] = sub; // null if input missing
    if (sub == null) continue;
    const w = weights[RAW_TO_WEIGHT[factor]] ?? 0;
    num += sub * w;
    den += w;
  }

  const weightedAverage = den > 0 ? num / den : 0;
  const stars = Math.round(weightedAverage * 4) + 1; // 1..5
  return { subScores, weightedAverage, stars };
}
