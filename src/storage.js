/* ===== MIMOSA - localStorage Persistence ===== */

function loadData() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw) allData = JSON.parse(raw);
  } catch (_) { allData = []; }
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allData));
  } catch (_) {
    allData = allData.slice(-1000);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(allData)); } catch (_2) {}
  }
}

// ---- Device list persistence ----
function loadDevices() {
  try {
    var raw = localStorage.getItem(STORAGE_DEVICES_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return [];
}

function saveDeviceList(devices) {
  try {
    localStorage.setItem(STORAGE_DEVICES_KEY, JSON.stringify(devices));
  } catch (_) {}
}

function populateClientSelect() {
  // Merge saved custom devices + defaults, deduplicate
  var saved = loadDevices();
  var all = {};
  DEFAULT_DEVICES.forEach(function(d) { all[d] = true; });
  saved.forEach(function(d) { all[d] = true; });
  var names = Object.keys(all).sort();

  // Keep the "Tutti i client" option
  clientSelect.innerHTML = '<option value="+">Tutti i client</option>';
  names.forEach(function(name) {
    var opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    clientSelect.appendChild(opt);
  });
}

function addDevice(name) {
  name = name.trim();
  if (!name) return;

  var saved = loadDevices();
  if (saved.indexOf(name) === -1) {
    saved.push(name);
    saveDeviceList(saved);
  }

  // Add to select if not already present
  for (var i = 0; i < clientSelect.options.length; i++) {
    if (clientSelect.options[i].value === name) return;
  }
  var opt = document.createElement('option');
  opt.value = name;
  opt.textContent = name;
  clientSelect.appendChild(opt);
  clientSelect.value = name;
}
