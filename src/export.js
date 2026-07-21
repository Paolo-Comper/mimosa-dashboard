/* ===== MIMOSA - Export & Data Management ===== */

function downloadFile(content, filename, mime) {
  var blob = new Blob([content], { type: mime + ';charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportCSV() {
  if (allData.length === 0) { alert('Nessun dato da esportare.'); return; }
  var filtered = currentClient === '+' ? allData : allData.filter(function(d) { return d.client === currentClient; });
  if (filtered.length === 0) { alert('Nessun dato da esportare per il client selezionato.'); return; }

  var header = 'timestamp,data_ora,client,pm1,pm25,pm10,temp_pms,hum_pms,temp_dht22,hum_dht22,temp_bme280,hum_bme280,pressure_hpa,lat,lon,alt,sats,gps_valid';
  var rows = filtered.map(function(d) {
    var p = d.pms || {}, dh = d.dht22 || {}, b = d.bme280 || {}, g = d.gps || {};
    return [
      d.timestamp, fmtTime(d.timestamp), d.client,
      p.pm1 ?? '', p.pm25 ?? '', p.pm10 ?? '',
      p.temperature ?? '', p.humidity ?? '',
      dh.temperature ?? '', dh.humidity ?? '',
      b.temperature ?? '', b.humidity ?? '',
      b.pressure ? (b.pressure / 100).toFixed(1) : '',
      g.lat ?? '', g.lon ?? '', g.alt ?? '', g.sats ?? '',
      g.valid ?? ''
    ].join(',');
  }).join('\n');

  downloadFile(header + '\n' + rows, 'mimosa_dati.csv', 'text/csv');
}

function exportJSON() {
  if (allData.length === 0) { alert('Nessun dato da esportare.'); return; }
  var filtered = currentClient === '+' ? allData : allData.filter(function(d) { return d.client === currentClient; });
  if (filtered.length === 0) { alert('Nessun dato da esportare per il client selezionato.'); return; }
  downloadFile(JSON.stringify(filtered, null, 2), 'mimosa_dati.json', 'application/json');
}

function clearData() {
  if (!confirm('Cancellare tutti i dati ricevuti?')) return;
  allData = [];
  saveData();
  updateDashboard();
}
