// Render layer: one card per day. Each card shows a 12h timeline centred on sunset,
// with air-temp and wind lines coloured by value (ECharts visualMap), the sunset,
// nearest-low-tide and moonrise instants marked, and water temp beside the plot.
// On wide screens the timeline runs horizontally; on narrow screens it transposes
// to run vertically (day at top → night at bottom) so it fits the width.
import { FACTOR_META, CHART } from './config.js';

const echarts = window.echarts;
const WEEKDAY = { weekday: 'short', day: 'numeric', month: 'short' };
const BREAKPOINT = 640;
const entries = []; // { chart, day } — live instances, for resize/re-orient

const isMobile = () => window.innerWidth <= BREAKPOINT;

function fmtTime(date) {
  if (!(date instanceof Date) || isNaN(date)) return '—';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function starsHtml(n) {
  return `<span class="stars" aria-label="${n} out of 5 stars">${'★'.repeat(n)}${'☆'.repeat(5 - n)}</span>`;
}

// Event marker on the time axis (x on desktop, y on mobile), or null if missing.
function marker(date, emoji, mobile) {
  if (!(date instanceof Date) || isNaN(date)) return null;
  return { [mobile ? 'yAxis' : 'xAxis']: date.getTime(), label: { formatter: emoji } };
}

function chartOption(day, mobile) {
  const { series } = day;
  // Data is [time, value] on desktop and [value, time] on mobile (axes swapped).
  const tempData = series.t.map((t, i) => (mobile ? [series.temp[i], t] : [t, series.temp[i]]));
  const windData = series.t.map((t, i) => (mobile ? [series.wind[i], t] : [t, series.wind[i]]));
  const valueDim = mobile ? 0 : 1; // which data dimension holds the value

  const markData = [
    marker(day.astro.sunset, '☀', mobile),
    marker(day.lowTide, '🌊', mobile),
    marker(day.astro.moonrise, '🌙', mobile),
  ].filter(Boolean);

  const valueAxis = (range, position, showSplit) => ({
    type: 'value',
    min: range.min, max: range.max, position,
    axisLabel: { color: '#7f8fab', fontSize: 9, margin: 4 },
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: showSplit ? { lineStyle: { color: '#1f2c47' } } : { show: false },
  });

  const timeAxis = () => ({
    type: 'time', min: day.winStartMs, max: day.winEndMs,
    inverse: mobile, // vertical: earliest (day) at top, latest (night) at bottom
    axisLabel: { color: '#7f8fab', fontSize: 9, formatter: (v) => echarts.time.format(v, '{HH}', false) },
    axisLine: { lineStyle: { color: '#2b3a58' } },
    axisTick: { show: false },
    splitLine: mobile ? { lineStyle: { color: '#1f2c47' } } : { show: false },
  });

  // Day→sunset→night gradient behind the plot: horizontal on desktop, vertical on
  // mobile (top=day → bottom=night). Sunset sits at offset 0.5 either way, and the
  // day→night change is confined to a band of width CHART.transitionHours.
  const half = Math.min(0.49, CHART.transitionHours / 2 / CHART.spanHours);
  const s = 0.5 - half, e = 0.5 + half;
  const mix = CHART.sunsetMix;
  const mixStops = mix.map((color, i) => ({ offset: s + ((i + 1) / (mix.length + 1)) * (e - s), color }));
  const skyGradient = {
    type: 'linear',
    x: 0, y: 0, x2: mobile ? 0 : 1, y2: mobile ? 1 : 0,
    colorStops: [
      { offset: 0, color: CHART.skyDay },
      { offset: s, color: CHART.skyDay },
      ...mixStops,
      { offset: e, color: CHART.skyNight },
      { offset: 1, color: CHART.skyNight },
    ],
  };

  const tempAxis = valueAxis(CHART.tempRange, mobile ? 'bottom' : 'left', !mobile);
  const windAxis = valueAxis(CHART.windRange, mobile ? 'top' : 'right', false);
  const time = timeAxis();

  // Legends sit next to their value axis. Desktop: both at top (temp left / wind
  // right, matching the left/right axes). Mobile (transposed): temp axis is at the
  // bottom and wind axis at the top, so the legends move with them.
  const legBase = { show: true, itemWidth: 12, itemHeight: 6, textStyle: { color: '#9fb0c8', fontSize: 10 } };
  const legend = mobile
    ? [
        { ...legBase, data: ['Air °C'], bottom: 0, left: 'center' },
        { ...legBase, data: ['Wind km/h'], top: 0, left: 'center' },
      ]
    : [
        { ...legBase, data: ['Air °C'], top: 0, left: 4 },
        { ...legBase, data: ['Wind km/h'], top: 0, right: 4 },
      ];

  return {
    animation: false,
    grid: {
      left: mobile ? 38 : 34, right: mobile ? 38 : 34,
      top: mobile ? 46 : 22, bottom: mobile ? 46 : 20,
      show: true, backgroundColor: skyGradient, borderWidth: 0,
    },
    legend,
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#1d2c49', borderColor: '#2b4270',
      textStyle: { color: '#e8eef7', fontSize: 11 },
      formatter: (ps) => {
        const timeVal = ps[0].value[mobile ? 1 : 0];
        const t = echarts.time.format(timeVal, '{HH}:{mm}', false);
        const rows = ps.map((p) => `${p.marker}${p.seriesName}: <b>${p.value[valueDim]}</b>`).join('<br>');
        return `${t}<br>${rows}`;
      },
    },
    xAxis: mobile ? [tempAxis, windAxis] : time,
    yAxis: mobile ? time : [tempAxis, windAxis],
    // Hidden visualMaps colour each line by its own value (like the AQI example).
    visualMap: [
      { type: 'continuous', seriesIndex: 0, dimension: valueDim, show: false,
        min: CHART.tempRange.min, max: CHART.tempRange.max, inRange: { color: CHART.tempColors } },
      { type: 'continuous', seriesIndex: 1, dimension: valueDim, show: false,
        min: CHART.windRange.min, max: CHART.windRange.max, inRange: { color: CHART.windColors } },
    ],
    series: [
      {
        name: 'Air °C', type: 'line', showSymbol: false, smooth: true,
        xAxisIndex: 0, yAxisIndex: 0,
        lineStyle: { width: 3 }, data: tempData,
        markLine: {
          symbol: 'none', silent: true,
          label: { color: '#e8eef7', fontSize: 13, distance: 3 },
          lineStyle: { color: '#8aa0c0', type: 'dashed', width: 1, opacity: 0.7 },
          data: markData,
        },
      },
      {
        name: 'Wind km/h', type: 'line', showSymbol: false, smooth: true,
        xAxisIndex: mobile ? 1 : 0, yAxisIndex: mobile ? 0 : 1,
        lineStyle: { width: 2, opacity: 0.9 }, data: windData,
      },
    ],
  };
}

function cardHtml(day, score, idx) {
  const dateLabel = new Date(day.date + 'T12:00:00').toLocaleDateString([], WEEKDAY);
  const water = day.raw.waterTemp == null ? '—' : `${FACTOR_META.waterTemp.fmt(day.raw.waterTemp)}°C`;
  return `
    <article class="card card--stars-${score.stars}">
      <header class="card__head">
        <h2>${dateLabel}</h2>
        ${starsHtml(score.stars)}
      </header>
      <div class="card__chart" id="chart-${idx}"></div>
      <div class="card__caption">
        <span class="water">🌡️ Water <b>${water}</b></span>
        <span>☀ ${fmtTime(day.astro.sunset)}</span>
        <span>🌊 ${fmtTime(day.lowTide)}</span>
        <span>🌙 ${fmtTime(day.astro.moonrise)}</span>
      </div>
    </article>`;
}

function disposeCharts() {
  entries.forEach((e) => e.chart.dispose());
  entries.length = 0;
}

export function render(scoredDays, meta) {
  const root = document.getElementById('app');
  disposeCharts();

  if (!scoredDays.length) {
    root.innerHTML = `<p class="empty">No forecast days available right now. Try refreshing later.</p>`;
    return;
  }

  root.innerHTML = scoredDays.map(({ day, score }, i) => cardHtml(day, score, i)).join('');
  const mobile = isMobile();
  scoredDays.forEach(({ day }, i) => {
    const el = document.getElementById(`chart-${i}`);
    if (!el) return;
    const chart = echarts.init(el, null, { renderer: 'canvas' });
    chart.setOption(chartOption(day, mobile));
    entries.push({ chart, day });
  });

  const status = document.getElementById('status');
  if (status) {
    const when = new Date(meta.fetchedAt).toLocaleString();
    status.textContent = `${scoredDays.length} day(s) · data ${meta.fromCache ? 'cached' : 'fetched'} ${when}`;
  }
}

export function renderError(err) {
  disposeCharts();
  document.getElementById('app').innerHTML =
    `<p class="error">Couldn't load forecast data: ${err.message}</p>`;
}

// On resize/rotate, re-apply the option (orientation may flip) and resize.
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const mobile = isMobile();
    entries.forEach(({ chart, day }) => {
      chart.setOption(chartOption(day, mobile), true);
      chart.resize();
    });
  }, 150);
});
