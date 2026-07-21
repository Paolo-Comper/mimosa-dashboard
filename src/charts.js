/* ===== MIMOSA - Charts (Chart.js) ===== */

function createChart(ctx, label, color, yLabel) {
  return new Chart(ctx, {
    type: 'line',
    data: { labels: [], datasets: [{
      label: label, data: [],
      borderColor: color, backgroundColor: color + '22',
      borderWidth: 2, pointRadius: 2, pointHoverRadius: 5,
      fill: true, tension: 0.3
    }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 300 },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1a2a3a', titleColor: '#e0e8f0', bodyColor: '#e0e8f0',
          borderColor: '#2a3f55', borderWidth: 1,
          callbacks: { title: function(items) { return items[0].label; } }
        }
      },
      scales: {
        x: { ticks: { color: '#8899aa', maxTicksLimit: 10, font: { size: 10 } }, grid: { color: '#2a3f5533' } },
        y: { beginAtZero: true, ticks: { color: '#8899aa', font: { size: 10 } }, grid: { color: '#2a3f5533' }, title: { display: !!yLabel, text: yLabel, color: '#8899aa' } }
      }
    }
  });
}

function createMultiChart(ctx, datasets, yLabel) {
  return new Chart(ctx, {
    type: 'line',
    data: { labels: [], datasets: datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 300 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#8899aa', boxWidth: 12, padding: 8, font: { size: 10 } } },
        tooltip: {
          backgroundColor: '#1a2a3a', titleColor: '#e0e8f0', bodyColor: '#e0e8f0',
          borderColor: '#2a3f55', borderWidth: 1
        }
      },
      scales: {
        x: { ticks: { color: '#8899aa', maxTicksLimit: 10, font: { size: 10 } }, grid: { color: '#2a3f5533' } },
        y: { beginAtZero: true, ticks: { color: '#8899aa', font: { size: 10 } }, grid: { color: '#2a3f5533' }, title: { display: !!yLabel, text: yLabel, color: '#8899aa' } }
      }
    }
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
