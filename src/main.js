/* ===== MIMOSA - Init & Event Listeners ===== */

// ---- Test data helper (dalla console del browser) ----
function publishTestData(sensore, osservatorio) {
  var nomeSensore = sensore || 'rpi-zero-1';
  var nomeOsservatorio = osservatorio || DEFAULT_OSSERVATORIO;
  var now = Date.now() / 1000;
  var msg = JSON.stringify({
    timestamp: now,
    pms: {
      pm1: Math.floor(Math.random() * 20 + 2),
      pm25: Math.floor(Math.random() * 30 + 5),
      pm10: Math.floor(Math.random() * 40 + 8),
      temperature: Math.random() * 10 + 18,
      humidity: Math.random() * 30 + 40
    },
    dht22: {
      temperature: Math.random() * 8 + 19,
      humidity: Math.random() * 25 + 45
    },
    bme280: {
      temperature: Math.random() * 6 + 20,
      humidity: Math.random() * 20 + 50,
      pressure: Math.random() * 20 + 1000
    },
    gps: {
      lat: 43.7238 + Math.random() * 0.002,
      lon: 12.6376 + Math.random() * 0.002,
      alt: 460 + Math.random() * 20,
      sats: Math.floor(Math.random() * 8 + 4),
      valid: true
    }
  });
  var topic = getPublishTopic(nomeOsservatorio, nomeSensore);
  console.log('Test data per ' + topic + ':', msg);
  return { topic: topic, message: msg };
}

// ---- Menu di esportazione (formati multipli) ----
function toggleExportMenu(show) {
  var menu = $('exportMenu');
  var btn = $('exportBtn');
  var apri = typeof show === 'boolean' ? show : menu.hidden;
  menu.hidden = !apri;
  btn.setAttribute('aria-expanded', String(apri));
}

// ---- Init ----
loadData();
populateOsservatorioSelect();
populateSensoreSelect();

currentOsservatorio = osservatorioSelect.value;
currentSensore = sensoreSelect.value;

// Event listeners
connectBtn.addEventListener('click', connectMQTT);
osservatorioSelect.addEventListener('change', onSelectionChange);
sensoreSelect.addEventListener('change', onSelectionChange);

document.getElementById('exportBtn').addEventListener('click', function(e) {
  e.stopPropagation();
  toggleExportMenu();
});
document.getElementById('exportConfirm').addEventListener('click', function() {
  esportaSelezionati();
  toggleExportMenu(false);
});
document.getElementById('clearExported').addEventListener('click', clearExported);
document.getElementById('clearData').addEventListener('click', clearData);

document.addEventListener('click', function(e) {
  var dentro = e.target && e.target.closest && e.target.closest('.export-dropdown');
  if (!dentro) toggleExportMenu(false);
});
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') toggleExportMenu(false);
});

document.getElementById('addOsservatorioBtn').addEventListener('click', function() {
  var name = prompt('Inserisci il nome del nuovo osservatorio:');
  if (name && name.trim()) {
    addOsservatorio(name.trim());
    onSelectionChange();
  }
});

document.getElementById('addSensoreBtn').addEventListener('click', function() {
  var name = prompt('Inserisci il nome del nuovo sensore:');
  if (name && name.trim()) {
    addSensore(name.trim());
    onSelectionChange();
  }
});

// Double-click per aggiungere rapidamente un sensore (fallback)
sensoreSelect.addEventListener('dblclick', function() {
  var name = prompt('Inserisci il nome del sensore:');
  if (name && name.trim()) {
    addSensore(name.trim());
    onSelectionChange();
  }
});

// Initial render
updateDashboard();
console.log('MIMOSA avviato. test: publishTestData("rpi-zero-1", "mimosa")');
