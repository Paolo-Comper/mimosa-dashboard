/* ===== MIMOSA - API del server locale + configurazione del browser ===== */
/* Lo storico dei campioni vive in SQLite lato Go; qui restano solo le
   preferenze (broker, osservatori, sensori) e le chiamate HTTP. */

function messaggioErroreApi(path, err) {
  var msg = (err && err.message) ? err.message : String(err);
  if (typeof location !== 'undefined' && location.protocol === 'file:') {
    return msg + ' — MIMOSA va aperto da http://localhost:8080, non come file (index.html)';
  }
  return msg + ' — richiesta a ' + path;
}

function apiRichiesta(path, metodo, body) {
  var opts = {
    method: metodo || 'GET',
    headers: { 'Accept': 'application/json' },
    cache: 'no-store'
  };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  return fetch(path, opts).then(function (r) {
    if (!r.ok) {
      return r.text().then(function (t) {
        var msg = t;
        try { msg = (JSON.parse(t) || {}).error || t; } catch (_) {}
        throw new Error(msg || ('HTTP ' + r.status));
      });
    }
    return r.json();
  }, function (err) {
    throw new Error(messaggioErroreApi(path, err));
  });
}

function apiGet(path) { return apiRichiesta(path, 'GET'); }

// Riprova una GET quando il server sta ancora partendo (es. attesa avvio).
function apiGetConRitentativi(path, tentativi, attesaMs) {
  tentativi = tentativi || 1;
  attesaMs = attesaMs || 500;
  return apiGet(path).catch(function (err) {
    if (tentativi <= 1) throw err;
    return new Promise(function (resolve) {
      setTimeout(function () {
        resolve(apiGetConRitentativi(path, tentativi - 1, attesaMs));
      }, attesaMs);
    });
  });
}

// Converte un campione del server ({id, topic, osservatorio, sensore, payload})
// nel record usato dalla dashboard.
function recordDaSample(sample) {
  if (!sample) return null;
  var data = sample.payload || {};
  return {
    id: sample.id || 0,
    timestamp: data.timestamp,
    topic: sample.topic,
    osservatorio: sample.osservatorio,
    sensore: sample.sensore,
    exported: sample.exported === true,
    received_at: sample.received_at || null,
    client_id: data.client_id || null,
    pms: data.pms || {},
    dht22: data.dht22 || {},
    bme280: data.bme280 || {},
    virtual: data.virtual || {},
    gps: data.gps || {},
    virtual_gps: data.virtual_gps || null,
    gps_network: data.gps_network || null
  };
}

// Importa una tantum i campioni che il vecchio MIMOSA teneva in localStorage.
function migraVecchiDati() {
  var fatto = false;
  try { fatto = localStorage.getItem('mimosa_import_v1') === 'ok'; } catch (_) {}
  if (fatto) return Promise.resolve();

  var raw = null;
  try { raw = localStorage.getItem(STORAGE_KEY); } catch (_) {}
  if (!raw) {
    try { localStorage.setItem('mimosa_import_v1', 'ok'); } catch (_) {}
    return Promise.resolve();
  }

  var records = [];
  try { records = JSON.parse(raw) || []; } catch (_) { records = []; }
  if (!records.length) {
    try { localStorage.removeItem(STORAGE_KEY); localStorage.setItem('mimosa_import_v1', 'ok'); } catch (_) {}
    return Promise.resolve();
  }

  return apiRichiesta('/api/import', 'POST', { records: records })
    .then(function (res) {
      console.log('MIMOSA: importati ' + (res.inseriti || 0) + ' campioni dal vecchio storage');
      try { localStorage.removeItem(STORAGE_KEY); localStorage.setItem('mimosa_import_v1', 'ok'); } catch (_) {}
    })
    .catch(function (err) {
      console.warn('MIMOSA: import dello storico locale non riuscito', err);
    });
}

// Carica gli ultimi campioni della selezione corrente (per grafici/tabella).
function caricaStorico() {
  var q = '?limit=200' +
    '&osservatorio=' + encodeURIComponent(currentOsservatorio || '') +
    '&sensore=' + encodeURIComponent(currentSensore || '');
  return apiGet('/api/samples' + q).then(function (res) {
    allData = (res || []).map(recordDaSample).filter(function (d) { return d && d.timestamp != null; });
    ultimoIdCampione = allData.length ? (allData[allData.length - 1].id || 0) : 0;

    // Se l'ultimo campione è appena arrivato al server, la posizione GPS è
    // ancora "fresca": mostra subito il pallino anche senza aspettare un SSE.
    var ultimo = allData.length ? allData[allData.length - 1] : null;
    if (ultimo && ultimo.received_at) {
      var eta = Date.now() - ultimo.received_at;
      ultimoArrivoDati = (eta >= 0 && eta <= GPS_STALE_MS) ? ultimo.received_at : 0;
    } else {
      ultimoArrivoDati = 0;
    }
  });
}

// Aggiorna i contatori mostrati nella barra di stato.
function aggiornaStatistiche() {
  var q = '?osservatorio=' + encodeURIComponent(currentOsservatorio || '') +
    '&sensore=' + encodeURIComponent(currentSensore || '');
  return apiGet('/api/stats' + q).then(function (st) {
    totaleCampioni = st.totale || 0;
    esportatiCampioni = st.esportati || 0;
    dimensioneDB = st.dimensione || 0;
    return st;
  });
}

// Ricarica storico + contatori + rendering per la selezione corrente.
function ricaricaSelezione() {
  return Promise.all([caricaStorico(), aggiornaStatistiche()]).then(function () {
    updateDashboard();
  });
}

// ---- Preferenze salvate nel browser (localStorage) ----

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

function loadBroker() {
  try { return localStorage.getItem(STORAGE_BROKER_KEY) || ''; } catch (_) { return ''; }
}
function saveBroker(value) {
  try { localStorage.setItem(STORAGE_BROKER_KEY, value); } catch (_) {}
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
