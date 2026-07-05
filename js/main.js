// Orchestration: fetch → normalize → score → render.
import { loadSources } from './fetch.js';
import { mergeSources } from './normalize.js';
import { scoreDay } from './scoring.js';
import { render, renderError } from './render.js';

async function run({ force = false } = {}) {
  const app = document.getElementById('app');
  app.innerHTML = '<p class="loading">Loading Faro forecast…</p>';
  try {
    const { sources, fetchedAt, fromCache } = await loadSources({ force });
    const days = mergeSources(sources);
    const scoredDays = days.map((day) => ({ day, score: scoreDay(day) }));
    render(scoredDays, { fetchedAt, fromCache });
  } catch (err) {
    console.error(err);
    renderError(err);
  }
}

document.getElementById('refresh')?.addEventListener('click', () => run({ force: true }));

run();
