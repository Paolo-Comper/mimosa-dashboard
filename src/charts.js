/* ===== MIMOSA - Charts (Chart.js) ===== */

function temaColori() {
  const s = getComputedStyle(document.documentElement);
  const v = (n, fb) => (s.getPropertyValue(n) || '').trim() || fb;
  return {
    tick: v('--chart-tick', '#5d6f80'),
    grid: v('--chart-grid', 'rgba(42,63,85,0.15)'),
    tipBg: v('--chart-tooltip-bg', '#ffffff'),
    tipText: v('--chart-tooltip-text', '#16232f'),
    tipBorder: v('--chart-tooltip-border', '#d5dee8')
  };
}

const COL = temaColori();

function opzioniBase(yLabel, multi) {
  return {
    responsive: true, maintainAspectRatio: false,
    animation: { duration: 300 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: !!multi, labels: { color: COL.tick, boxWidth: 12, padding: 8, font: { size: 10 } } },
      tooltip: {
        backgroundColor: COL.tipBg, titleColor: COL.tipText, bodyColor: COL.tipText,
        borderColor: COL.tipBorder, borderWidth: 1
      }
    },
    scales: {
      x: { ticks: { color: COL.tick, maxTicksLimit: 10, font: { size: 10 } }, grid: { color: COL.grid } },
      y: { beginAtZero: true, ticks: { color: COL.tick, font: { size: 10 } }, grid: { color: COL.grid }, title: { display: !!yLabel, text: yLabel, color: COL.tick } }
    }
  };
}

function createChart(ctx, label, color, yLabel) {
  return new Chart(ctx, {
    type: 'line',
    data: { labels: [], datasets: [{
      label: label, data: [],
      borderColor: color, backgroundColor: color + '22',
      borderWidth: 2, pointRadius: 2, pointHoverRadius: 5,
      fill: true, tension: 0.3
    }] },
    options: opzioniBase(yLabel, false)
  });
}

function createMultiChart(ctx, datasets, yLabel) {
  return new Chart(ctx, {
    type: 'line',
    data: { labels: [], datasets: datasets },
    options: opzioniBase(yLabel, true)
  });
}

// ---- Chart instances ----
var ctxPM    = document.getElementById('chartPM').getContext('2d');
var ctxTemp  = document.getElementById('chartTemp').getContext('2d');
var ctxHum   = document.getElementById('chartHum').getContext('2d');
var ctxPress = document.getElementById('chartPress').getContext('2d');

var chartPM = createMultiChart(ctxPM, [
  { label: 'PM\u2081', data: [], borderColor: '#e74c3c', backgroundColor: '#e74c3c22', borderWidth: 2, pointRadius: 1, fill: true, tension: 0.3 },
  { label: 'PM\u2082.\u2085', data: [], borderColor: '#f39c12', backgroundColor: '#f39c1222', borderWidth: 2, pointRadius: 1, fill: true, tension: 0.3 },
  { label: 'PM\u2081\u2080', data: [], borderColor: '#9b59b6', backgroundColor: '#9b59b622', borderWidth: 2, pointRadius: 1, fill: true, tension: 0.3 }
], '\u00b5g/m\u00b3');

var chartTemp = createMultiChart(ctxTemp, [
  { label: 'PMS', data: [], borderColor: '#e74c3c', backgroundColor: '#e74c3c22', borderWidth: 2, pointRadius: 1, fill: true, tension: 0.3 },
  { label: 'DHT22', data: [], borderColor: '#f39c12', backgroundColor: '#f39c1222', borderWidth: 2, pointRadius: 1, fill: true, tension: 0.3 },
  { label: 'BME280', data: [], borderColor: '#2ecc71', backgroundColor: '#2ecc7122', borderWidth: 2, pointRadius: 1, fill: true, tension: 0.3 }
], '\u00b0C');

var chartHum = createMultiChart(ctxHum, [
  { label: 'PMS', data: [], borderColor: '#5dade2', backgroundColor: '#5dade222', borderWidth: 2, pointRadius: 1, fill: true, tension: 0.3 },
  { label: 'DHT22', data: [], borderColor: '#2ecc71', backgroundColor: '#2ecc7122', borderWidth: 2, pointRadius: 1, fill: true, tension: 0.3 },
  { label: 'BME280', data: [], borderColor: '#f39c12', backgroundColor: '#f39c1222', borderWidth: 2, pointRadius: 1, fill: true, tension: 0.3 }
], '%');

var chartPress = createChart(ctxPress, 'BME280', '#2ecc71', 'hPa');

// Riallinea i colori dei grafici al tema corrente (invocata dal toggle tema)
function applicaTemaGrafici() {
  const c = temaColori();
  [chartPM, chartTemp, chartHum, chartPress].forEach(ch => {
    if (!ch) return;
    const p = ch.options.plugins;
    p.tooltip.backgroundColor = c.tipBg;
    p.tooltip.titleColor = c.tipText;
    p.tooltip.bodyColor = c.tipText;
    p.tooltip.borderColor = c.tipBorder;
    if (p.legend && p.legend.labels) p.legend.labels.color = c.tick;
    ['x', 'y'].forEach(ax => {
      const a = ch.options.scales[ax];
      if (a.ticks) a.ticks.color = c.tick;
      if (a.grid) a.grid.color = c.grid;
      if (a.title) a.title.color = c.tick;
    });
    ch.update();
  });
}

window.applicaTemaGrafici = applicaTemaGrafici;
