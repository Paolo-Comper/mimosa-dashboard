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

// Copia del record senza i metadati interni (es. flag "exported")
function recordPulito(d) {
  var c = {};
  ['timestamp', 'osservatorio', 'sensore', 'pms', 'dht22', 'bme280', 'gps'].forEach(function(k) {
    if (d[k] !== undefined) c[k] = d[k];
  });
  return c;
}

// Marca come "esportati" i record appena scaricati. Il flag viene salvato e
// riguarda solo questi record: i dati nuovi ricevuti dopo non lo ereditano.
function marcaEsportati(records) {
  records.forEach(function(d) { d.exported = true; });
  saveData();
  updateDashboard();
}

// Quoting CSV: racchiude tra virgolette i campi che contengono , " o newline
function csvField(v) {
  var s = String(v === null || v === undefined ? '' : v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function buildCSV(records) {
  var header = 'timestamp,data_ora,osservatorio,sensore,pm1,pm25,pm10,temp_pms,hum_pms,temp_dht22,hum_dht22,temp_bme280,hum_bme280,pressure_hpa,lat,lon,alt,sats,gps_valid';
  var rows = records.map(function(d) {
    var p = d.pms || {}, dh = d.dht22 || {}, b = d.bme280 || {}, g = d.gps || {};
    return [
      d.timestamp, csvField(fmtTime(d.timestamp)), csvField(d.osservatorio || ''), csvField(d.sensore || ''),
      p.pm1 ?? '', p.pm25 ?? '', p.pm10 ?? '',
      p.temperature ?? '', p.humidity ?? '',
      dh.temperature ?? '', dh.humidity ?? '',
      b.temperature ?? '', b.humidity ?? '',
      b.pressure ? (b.pressure / 100).toFixed(1) : '',
      g.lat ?? '', g.lon ?? '', g.alt ?? '', g.sats ?? '',
      g.valid ?? ''
    ].join(',');
  }).join('\n');
  return header + '\n' + rows;
}

function buildJSON(records) {
  return JSON.stringify(records.map(recordPulito), null, 2);
}

function slug(s) {
  return String(s).replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'dati';
}

// Scarica i formati richiesti sugli STESSI dati (stesso snapshot), poi li tagga.
function esportaFormati(formats) {
  if (allData.length === 0) { alert('Nessun dato da esportare.'); return; }
  var filtered = datiFiltrati();
  if (filtered.length === 0) {
    alert('Nessun dato da esportare per la selezione corrente (osservatorio/sensore).');
    return;
  }

  var base = 'mimosa_' + slug(currentOsservatorio) + '_' + slug(currentSensore === ALL ? 'tutti' : currentSensore);
  if (formats.indexOf('csv') !== -1) downloadFile(buildCSV(filtered), base + '.csv', 'text/csv');
  if (formats.indexOf('json') !== -1) downloadFile(buildJSON(filtered), base + '.json', 'application/json');
  marcaEsportati(filtered);
}

function esportaSelezionati() {
  var formats = [];
  if ($('fmtCSV').checked) formats.push('csv');
  if ($('fmtJSON').checked) formats.push('json');
  if (formats.length === 0) { alert('Seleziona almeno un formato (CSV o JSON).'); return; }
  esportaFormati(formats);
}

function clearExported() {
  var tagged = allData.filter(function(d) { return d.exported === true; }).length;
  if (tagged === 0) { alert('Nessun dato esportato da cancellare.'); return; }
  if (!confirm('Cancellare i ' + tagged + ' dati già esportati?\nI dati nuovi non esportati resteranno.')) return;
  allData = allData.filter(function(d) { return d.exported !== true; });
  saveData();
  updateDashboard();
}

function clearData() {
  if (!confirm('Cancellare tutti i dati ricevuti?')) return;
  allData = [];
  saveData();
  updateDashboard();
}
