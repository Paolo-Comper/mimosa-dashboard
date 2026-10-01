/* ===== MIMOSA - localStorage Persistence ===== */

function loadData() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw) allData = JSON.parse(raw);
  } catch (_) { allData = []; }
  migraDati();
}

// Compatibilità con i record salvati prima del rename: il campo "client"
// diventa "sensore" e viene aggiunto l'"osservatorio" mancante.
function migraDati() {
  allData.forEach(function(d) {
    if (d.sensore === undefined && d.client !== undefined) {
      d.sensore = d.client;
      delete d.client;
    }
    if (!d.osservatorio) d.osservatorio = DEFAULT_OSSERVATORIO;
  });
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allData));
  } catch (_) {
    allData = allData.slice(-1000);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(allData)); } catch (_2) {}
  }
}

// ---- Liste di osservatori / sensori ----
function loadList(key, legacyKey) {
  try {
    var raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
    if (legacyKey) {
      var old = localStorage.getItem(legacyKey);
      if (old) return JSON.parse(old);
    }
  } catch (_) {}
  return [];
}

function saveList(key, arr) {
  try { localStorage.setItem(key, JSON.stringify(arr)); } catch (_) {}
}

function loadSensori() { return loadList(STORAGE_SENSORS_KEY, STORAGE_DEVICES_KEY); }
function saveSensori(list) { saveList(STORAGE_SENSORS_KEY, list); }
function loadOsservatori() { return loadList(STORAGE_OSSERVATORI_KEY); }
function saveOsservatori(list) { saveList(STORAGE_OSSERVATORI_KEY, list); }

function riempiSelect(select, etichettaTutti, nomi) {
  select.innerHTML = '';
  if (etichettaTutti) {
    var tutti = document.createElement('option');
    tutti.value = ALL;
    tutti.textContent = etichettaTutti;
    select.appendChild(tutti);
  }
  nomi.forEach(function(nome) {
    var opt = document.createElement('option');
    opt.value = nome;
    opt.textContent = nome;
    select.appendChild(opt);
  });
}

function populateSensoreSelect() {
  var tutti = {};
  DEFAULT_SENSORS.forEach(function(d) { tutti[d] = true; });
  loadSensori().forEach(function(d) { tutti[d] = true; });
  riempiSelect(sensoreSelect, 'Tutti i sensori', Object.keys(tutti).sort());
}

function populateOsservatorioSelect() {
  var tutti = {};
  DEFAULT_OSSERVATORI.forEach(function(d) { tutti[d] = true; });
  loadOsservatori().forEach(function(d) { tutti[d] = true; });
  riempiSelect(osservatorioSelect, null, Object.keys(tutti).sort());
}

function aggiungiVoce(select, load, save, nome) {
  nome = nome.trim();
  if (!nome) return;
  var salvati = load();
  if (salvati.indexOf(nome) === -1) {
    salvati.push(nome);
    save(salvati);
  }
  for (var i = 0; i < select.options.length; i++) {
    if (select.options[i].value === nome) { select.value = nome; return; }
  }
  var opt = document.createElement('option');
  opt.value = nome;
  opt.textContent = nome;
  select.appendChild(opt);
  select.value = nome;
}

function addSensore(nome) {
  aggiungiVoce(sensoreSelect, loadSensori, saveSensori, nome);
}

function addOsservatorio(nome) {
  aggiungiVoce(osservatorioSelect, loadOsservatori, saveOsservatori, nome);
}
