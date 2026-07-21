/* ===== MIMOSA - Init & Event Listeners ===== */

// ---- Test data helper (from dev console) ----
function publishTestData(clientName) {
  var client = clientName || 'rpi-zero-1';
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
  var topic = getPublishTopic(client);
  console.log('Test data for ' + topic + ':', msg);
  return { topic: topic, message: msg };
}

// ---- Init ----
loadData();

// Event listeners
connectBtn.addEventListener('click', connectMQTT);
clientSelect.addEventListener('change', onClientChange);
document.getElementById('exportCSV').addEventListener('click', exportCSV);
document.getElementById('exportJSON').addEventListener('click', exportJSON);
document.getElementById('clearData').addEventListener('click', clearData);

// Double-click to add custom client
clientSelect.addEventListener('dblclick', function() {
  var custom = prompt('Inserisci il nome del client RPI:');
  if (custom && custom.trim()) {
    var opt = document.createElement('option');
    opt.value = custom.trim();
    opt.textContent = custom.trim();
    clientSelect.appendChild(opt);
    clientSelect.value = custom.trim();
    onClientChange();
  }
});

// Initial render
updateDashboard();
console.log('MIMOSA avviato. test: publishTestData("rpi-zero-1")');
