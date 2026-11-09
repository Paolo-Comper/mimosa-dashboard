/* Test della logica della dashboard (Node, senza dipendenze).
 *
 * Carica i file reali serviti al browser (state.js, storage.js, mqtt.js) in un
 * contesto vm con DOM/localStorage finti, poi verifica:
 *  - parsing del topic (slash iniziale, più livelli, wildcard)
 *  - filtro osservatorio/sensore
 *  - normalizzazione pressione hPa/Pa
 *  - posizione da virtual_gps / gps con GPS_HW_POS
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
const payloadVecchio = JSON.stringify({
  bh1750: { saturated: false, mtreg: 31, nominal_lux_per_wm2: 120.0, lux: null },
  topic: '/uniurb/aserpieri/test/marconi0/esp32-d0ac78/data',
  client_id: 'esp32-d0ac78',
  gps: { lat: null, sats: 0, alt: null, valid: false, utc: null, lon: null },
  timestamp: 1794094530,
  virtual: { humidity: 53.1, pressure: 1004.38, temperature: 26.8 },
  dht22: { humidity: 53.100004, temperature: 26.800002 },
  pms: { pm25: 6, pm10: 7, humidity: 49.1, pm1: 3, temperature: 27.2 },
  bme280: { humidity: 44.775144, pressure: 1004.38104, temperature: 25.075438 }
});

const payloadNuovo = JSON.stringify({
  bh1750: { saturated: false, mtreg: 31, nominal_lux_per_wm2: 120.0, lux: null },
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
});

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
  // dashboard.js non viene caricato: processMessage chiama updateDashboard()
  updateDashboard: () => {},
  payloadVecchio: payloadVecchio,
  payloadNuovo: payloadNuovo
};

const sorgenti = ['src/state.js', 'src/storage.js', 'src/mqtt.js'].map(leggi).join('\n');

const verifiche = `
// --- parsing del topic ---
const topicReale = '/uniurb/aserpieri/test/marconi0/esp32-d0ac78/data';
let nomi = parseTopic(topicReale);
assert.strictEqual(nomi.osservatorio, '/uniurb/aserpieri/test/marconi0');
assert.strictEqual(nomi.sensore, 'esp32-d0ac78');
assert.deepStrictEqual(parseTopic('mimosa/rpi-zero-1/data'),
  { osservatorio: 'mimosa', sensore: 'rpi-zero-1' });
assert.deepStrictEqual(parseTopic('mimosa/+/data'),
  { osservatorio: 'mimosa', sensore: '+' });

// --- messaggio del professore (JSON vecchio, gps invalido) ---
processMessage(topicReale, payloadVecchio);
assert.strictEqual(allData.length, 1);
assert.strictEqual(allData[0].osservatorio, '/uniurb/aserpieri/test/marconi0');
assert.strictEqual(allData[0].sensore, 'esp32-d0ac78');
assert.strictEqual(allData[0].virtual_gps, null);

// il filtro osservatorio/sensore ora trova il record
currentOsservatorio = '/uniurb/aserpieri/test/marconi0';
currentSensore = 'esp32-d0ac78';
assert.strictEqual(datiFiltrati().length, 1);

// pressione: hPa riconosciuta (il vecchio codice mostrava 10.0)
assert.strictEqual(pressioneHpa(allData[0]).toFixed(1), '1004.4');
assert.strictEqual(normalizzaPressione(100438), 1004.38);
assert.ok(Math.abs(normalizzaPressione(1004.38) - 1004.38) < 1e-9);

// niente posizione: gps invalido e nessun virtual_gps
assert.strictEqual(posizioneGPS(allData[0]), null);

// --- messaggio nuovo: virtual_gps ---
processMessage(topicReale, payloadNuovo);
assert.strictEqual(allData.length, 2);
const pos = posizioneGPS(allData[1]);
assert.ok(pos, 'virtual_gps deve produrre una posizione');
assert.strictEqual(pos.lat, 45.4642);
assert.strictEqual(pos.lon, 9.18998);
assert.strictEqual(pos.hwPos, 1);
assert.strictEqual(pos.source, 'network');
assert.strictEqual(pos.accuracy, 100000);
assert.strictEqual(pos.legacy, false);

// GPS_HW_POS 0 -> verde; null -> nessun pallino
const conFlag = flag => {
  const d = JSON.parse(payloadNuovo);
  d.virtual_gps.GPS_HW_POS = flag;
  return posizioneGPS(d);
};
assert.strictEqual(conFlag(0).hwPos, 0);
assert.strictEqual(conFlag(null).hwPos, null);

// virtual_gps non valido: si usa il vecchio ramo gps (retrocompatibilità)
const legacy = posizioneGPS({ gps: { valid: true, lat: 43.7, lon: 12.6, alt: 400, sats: 6 } });
assert.strictEqual(legacy.legacy, true);
assert.strictEqual(legacy.hwPos, 0);

console.log('OK: verifiche di logica superate');
`;

vm.runInNewContext(sorgenti + '\n' + verifiche, sandbox, { filename: 'dashboard-bundle.js' });
