/* ===== MIMOSA - Dashboard Render ===== */

function updateDashboard() {
  var filtered = currentClient === '+'
    ? allData
    : allData.filter(function(d) { return d.client === currentClient; });

  dataCount.textContent = filtered.length;

  // Limit warning
  var warn = document.getElementById('limitWarning');
  var totalEl = document.getElementById('totalSamples');
  if (filtered.length > 50) {
    warn.style.display = 'flex';
    totalEl.textContent = filtered.length;
  } else {
    warn.style.display = 'none';
  }

  if (filtered.length === 0) {
    ['cv-pm1','cv-pm25','cv-pm10','cv-temp','cv-hum','cv-press','cv-gps'].forEach(function(id) {
      $(id).textContent = '\u2014';
    });
    $('cv-gps-sats').textContent = '';
    tableBody.innerHTML = '<tr><td colspan="12" style="text-align:center;padding:20px;color:#8899aa;">Nessun dato ricevuto</td></tr>';
    updateCharts([]);
    lastUpdate.textContent = '\u2014';
    return;
  }

  var latest = filtered[filtered.length - 1];
  var pms = latest.pms || {};
  var dht = latest.dht22 || {};
  var bme = latest.bme280 || {};
  var gps = latest.gps || {};

  // Current values
  $('cv-pm1').textContent   = pms.pm1 != null ? pms.pm1 : '\u2014';
  $('cv-pm25').textContent  = pms.pm25 != null ? pms.pm25 : '\u2014';
  $('cv-pm10').textContent  = pms.pm10 != null ? pms.pm10 : '\u2014';
  $('cv-temp').textContent  = fmtTemp(bme.temperature ?? dht.temperature ?? pms.temperature);
  $('cv-hum').textContent   = fmt(bme.humidity ?? dht.humidity ?? pms.humidity, 0);
  $('cv-press').textContent = bme.pressure ? fmt(bme.pressure / 100, 1) : '\u2014';

  if (gps.valid && gps.lat != null) {
    $('cv-gps').textContent = Number(gps.lat).toFixed(4) + ', ' + Number(gps.lon).toFixed(4);
    $('cv-gps-sats').textContent = 'sats ' + (gps.sats ?? '--');
  } else {
    $('cv-gps').textContent = '\u2014';
    $('cv-gps-sats').textContent = '';
  }

  lastUpdate.textContent = fmtTime(latest.timestamp);

  // Map
  if (window.aggiornaMappa) {
    window.aggiornaMappa(allData);
  }

  // Table (last 50, reversed)
  var rows = filtered.slice(-50).reverse();
  tableBody.innerHTML = rows.map(function(d) {
    var p = d.pms || {}, dh = d.dht22 || {}, b = d.bme280 || {}, g = d.gps || {};
    return '<tr>'
      + '<td>' + fmtTime(d.timestamp) + '</td>'
      + '<td>' + d.client + '</td>'
      + '<td>' + (p.pm1 != null ? p.pm1 : '\u2014') + '</td>'
      + '<td>' + (p.pm25 != null ? p.pm25 : '\u2014') + '</td>'
      + '<td>' + (p.pm10 != null ? p.pm10 : '\u2014') + '</td>'
      + '<td>' + fmtTemp(p.temperature) + '</td>'
      + '<td>' + fmtTemp(dh.temperature) + '</td>'
      + '<td>' + fmtTemp(b.temperature) + '</td>'
      + '<td>' + fmt(b.humidity ?? dh.humidity ?? p.humidity, 0) + '</td>'
      + '<td>' + (b.pressure ? fmt(b.pressure / 100, 1) : '\u2014') + '</td>'
      + '<td>' + (g.valid && g.lat != null ? Number(g.lat).toFixed(4) : '\u2014') + '</td>'
      + '<td>' + (g.valid && g.lon != null ? Number(g.lon).toFixed(4) : '\u2014') + '</td>'
      + '</tr>';
  }).join('');

  updateCharts(filtered);
}

function updateCharts(data) {
  var last50 = data.slice(-50);
  var labels = last50.map(function(d) { return fmtTimeShort(d.timestamp); });

  chartPM.data.labels = labels;
  chartPM.data.datasets[0].data = last50.map(function(d) { var p = d.pms; return p ? p.pm1 : null; });
  chartPM.data.datasets[1].data = last50.map(function(d) { var p = d.pms; return p ? p.pm25 : null; });
  chartPM.data.datasets[2].data = last50.map(function(d) { var p = d.pms; return p ? p.pm10 : null; });
  chartPM.update('none');

  chartTemp.data.labels = labels;
  chartTemp.data.datasets[0].data = last50.map(function(d) { var p = d.pms; return p ? p.temperature : null; });
  chartTemp.data.datasets[1].data = last50.map(function(d) { var p = d.dht22; return p ? p.temperature : null; });
  chartTemp.data.datasets[2].data = last50.map(function(d) { var p = d.bme280; return p ? p.temperature : null; });
  chartTemp.update('none');

  chartHum.data.labels = labels;
  chartHum.data.datasets[0].data = last50.map(function(d) { var p = d.pms; return p ? p.humidity : null; });
  chartHum.data.datasets[1].data = last50.map(function(d) { var p = d.dht22; return p ? p.humidity : null; });
  chartHum.data.datasets[2].data = last50.map(function(d) { var p = d.bme280; return p ? p.humidity : null; });
  chartHum.update('none');

  chartPress.data.labels = labels;
  chartPress.data.datasets[0].data = last50.map(function(d) {
    var p = d.bme280;
    return p && p.pressure ? p.pressure / 100 : null;
  });
  chartPress.update('none');
}
