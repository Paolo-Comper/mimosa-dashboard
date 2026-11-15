/* Test della logica della dashboard (Node, senza dipendenze).
 *
 * Carica i file reali serviti al browser (state.js, storage.js, mqtt.js) in un
 * contesto vm con DOM/localStorage finti e verifica:
 *  - formattazione data/ora (con anno) e legenda GPS
 *  - pressione hPa/Pa
 *  - posizione da virtual_gps / gps con GPS_HW_POS
 *  - conversione dei campioni del server e filtro osservatorio/sensore
 *
 * Uso: node tests/logica.test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.join(__dirname, '..');
const leggi = rel => fs.readFileSync(path.join(root, rel), 'utf8');

// --- payload reali presi dall'email del professore ---
const payloadVecchio = {
  topic: '/uniurb/aserpieri/test/marconi0/esp32-d0ac78/data',
  client_id: 'esp32-d0ac78',
  gps: { lat: null, sats: 0, alt: null, valid: false, utc: null, lon: null },
  timestamp: 1794094530,
  virtual: { humidity: 53.1, pressure: 1004.38, temperature: 26.8 },
  dht22: { humidity: 53.100004, temperature: 26.800002 },
  pms: { pm25: 6, pm10: 7, humidity: 49.1, pm1: 3, temperature: 27.2 },
  bme280: { humidity: 44.775144, pressure: 1004.38104, temperature: 25.075438 }
};

const payloadNuovo = {
  gps_network: { lat: 45.4642, accuracy_m: 100000.0, alt: 200.0, source: 'ip', aid_sent: false, lon: 9.18998 },
  dht22: { humidity: 53.100004, temperature: 26.9 },
  pms: { pm25: 6, pm10: 7, humidity: 49.2, pm1: 4, temperature: 27.2 },
  virtual: { humidity: 53.1, pressure: 1004.41, temperature: 26.9 },
  virtual_gps: {
    lat: 45.4642, datetime_utc: '2026-11-07T23:39:17Z', valid: true,
    lon: 9.18998, sats: null, source: 'network', GPS_HW_POS: 1,
    accuracy_m: 100000.0, alt: 200.0, time_source: 'ntp', timestamp: 1794094757
  },
  bme280: { humidity: 44.432564, pressure: 1004.4084, temperature: 25.212984 },
  timestamp: 1794094757,
  topic: '/uniurb/aserpieri/test/marconi0/esp32-d0ac78/data',
  gps: { lat: null, sats: 0, alt: null, valid: false, utc: null, lon: null },
  client_id: 'esp32-d0ac78'
};

// --- finto browser ---
function nodoFinto() {
  return {
    value: '', textContent: '', innerHTML: '', className: '', title: '',
    hidden: false, options: [], checked: false,
    addEventListener() {}, appendChild() {}, setAttribute() {},
    getContext() { return {}; }, closest() { return null; }
  };
}

const store = {};
const sandbox = {
  console: console,
  assert: assert,
  document: {
    getElementById: () => nodoFinto(),
    createElement: () => nodoFinto(),
    addEventListener() {},
    documentElement: { getAttribute: () => 'light', setAttribute() {} }
  },
  localStorage: {
    getItem: k => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  },
  location: { protocol: 'http:' },
  fetch: () => Promise.reject(new Error('fetch non usato nei test')),
  updateDashboard: () => {},
  payloadVecchio: JSON.stringify(payloadVecchio),
  payloadNuovo: JSON.stringify(payloadNuovo)
};

const sorgenti = ['src/state.js', 'src/storage.js', 'src/mqtt.js'].map(leggi).join('\n');

const verifiche = `
// --- formattazione data/ora: ora c'è anche l'anno ---
assert.ok(fmtTime(1794094757).indexOf('2026') !== -1, 'fmtTime deve contenere l\\'anno');

// --- legenda GPS: 1 = rete (giallo), 0 = GPS a bordo (verde) ---
assert.strictEqual(etichettaSorgenteGPS(1), 'rete');
assert.strictEqual(etichettaSorgenteGPS(0), 'GPS a bordo');
assert.strictEqual(etichettaSorgenteGPS(null), 'sorgente n/d');

// --- pressione hPa/Pa ---
assert.strictEqual(normalizzaPressione(100438), 1004.38);
assert.ok(Math.abs(normalizzaPressione(1004.38) - 1004.38) < 1e-9);

// --- record del server e filtro osservatorio/sensore ---
const campioneVecchio = {
  id: 1,
  topic: '/uniurb/aserpieri/test/marconi0/esp32-d0ac78/data',
  osservatorio: '/uniurb/aserpieri/test/marconi0',
  sensore: 'esp32-d0ac78',
  exported: false,
  payload: JSON.parse(payloadVecchio)
};
const recVecchio = recordDaSample(campioneVecchio);
assert.strictEqual(recVecchio.timestamp, 1794094530);
assert.strictEqual(recVecchio.osservatorio, '/uniurb/aserpieri/test/marconi0');
assert.strictEqual(recVecchio.sensore, 'esp32-d0ac78');
assert.strictEqual(recVecchio.exported, false);
assert.strictEqual(posizioneGPS(recVecchio), null); // gps invalido, nessun virtual_gps
assert.strictEqual(pressioneHpa(recVecchio).toFixed(1), '1004.4');

const campioneNuovo = {
  id: 2,
  topic: '/uniurb/aserpieri/test/marconi0/esp32-d0ac78/data',
  osservatorio: '/uniurb/aserpieri/test/marconi0',
  sensore: 'esp32-d0ac78',
  exported: true,
  payload: JSON.parse(payloadNuovo)
};
const recNuovo = recordDaSample(campioneNuovo);
assert.strictEqual(recNuovo.exported, true);
const pos = posizioneGPS(recNuovo);
assert.ok(pos, 'virtual_gps deve produrre una posizione');
assert.strictEqual(pos.lat, 45.4642);
assert.strictEqual(pos.lon, 9.18998);
assert.strictEqual(pos.hwPos, 1);
assert.strictEqual(pos.source, 'network');
assert.strictEqual(pos.accuracy, 100000);

allData = [recVecchio, recNuovo];
currentOsservatorio = '/uniurb/aserpieri/test/marconi0';
currentSensore = 'esp32-d0ac78';
assert.strictEqual(datiFiltrati().length, 2);
assert.strictEqual(appartieneAllaSelezione(recNuovo), true);
currentSensore = 'altro-sensore';
assert.strictEqual(datiFiltrati().length, 0);

// GPS_HW_POS 0 -> GPS a bordo; null -> nessun colore
const conFlag = flag => {
  const c = JSON.parse(JSON.stringify(campioneNuovo));
  c.payload.virtual_gps.GPS_HW_POS = flag;
  return posizioneGPS(recordDaSample(c));
};
assert.strictEqual(conFlag(0).hwPos, 0);
assert.strictEqual(conFlag(null).hwPos, null);

// fallback sul vecchio ramo gps (retrocompatibilità)
const legacy = posizioneGPS({ gps: { valid: true, lat: 43.7, lon: 12.6, alt: 400, sats: 6 } });
assert.strictEqual(legacy.legacy, true);
assert.strictEqual(legacy.hwPos, 0);

console.log('OK: verifiche di logica superate');
`;

vm.runInNewContext(sorgenti + '\n' + verifiche, sandbox, { filename: 'dashboard-bundle.js' });
