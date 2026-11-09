/* ===== MIMOSA - State & Constants ===== */
// v2: i record salvati prima del fix del parsing del topic sono etichettati
// male (osservatorio/sensore sbagliati), quindi ripartiamo da uno storage pulito.
const STORAGE_KEY = 'mimosa_data_v2';
const STORAGE_SENSORS_KEY = 'mimosa_sensori';
const STORAGE_OSSERVATORI_KEY = 'mimosa_osservatori';
const STORAGE_DEVICES_KEY = 'mimosa_devices'; // legacy (era l'elenco dei "client")
const STORAGE_BROKER_KEY = 'mimosa_broker';
const DEFAULT_BROKER = 'broker.hivemq.com';
const DEFAULT_SENSORS = ['rpi-zero-1', 'rpi-zero-2'];
const DEFAULT_OSSERVATORI = ['mimosa'];
const DEFAULT_OSSERVATORIO = 'mimosa';
const MAX_RECORDS = 5000;
const KEEP_ALIVE = 60;
const RECONNECT_DELAY = 5000;
const ALL = '+';

// Se il sensore non invia nuovi dati per questo tempo, la posizione sulla
// mappa non è più considerata valida (il pallino viene tolto).
const GPS_STALE_MS = 20000;
let ultimoArrivoDati = 0;

// ---- Global state ----
let allData = [];
let mqttClient = null;
let isConnecting = false;
let reconnectTimer = null;
let currentSensore = ALL;
let currentOsservatorio = DEFAULT_OSSERVATORIO;
let currentSubTopic = null;
let manualDisconnect = false;

// ---- DOM refs ----
const $ = id => document.getElementById(id);
const osservatorioSelect = $('osservatorioSelect');
const sensoreSelect      = $('sensoreSelect');
const brokerInput        = $('brokerInput');
const connectBtn         = $('connectBtn');
const connStatus         = $('connectionStatus');
const dataCount          = $('dataCount');
const lastUpdate         = $('lastUpdate');
const currentTopic       = $('currentTopic');
const tableBody          = $('tableBody');

// ---- Formatters ----
function fmt(o, d) { return o == null ? '\u2014' : Number(o).toFixed(d || 1); }
function fmtTemp(o) { return o == null ? '\u2014' : Number(o).toFixed(1); }
function fmtTime(ts) {
  return new Date(ts * 1000).toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}
function fmtTimeShort(ts) {
  return new Date(ts * 1000).toLocaleTimeString('it-IT', {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}
// Distanza leggibile per l'accuratezza GPS (es. 100000 m -> "100 km").
function fmtDistanza(m) {
  if (m == null || !isFinite(Number(m))) return '\u2014';
  var n = Number(m);
  return n >= 1000 ? Math.round(n / 1000) + ' km' : Math.round(n) + ' m';
}

// ---- Topic helpers ----
function getSubscribeTopic() {
  return osservatorioSelect.value + '/' + sensoreSelect.value + '/data';
}
function getPublishTopic(osservatorio, sensore) {
  return osservatorio + '/' + sensore + '/data';
}

// Dati che rientrano nella selezione corrente (osservatorio + sensore)
function datiFiltrati() {
  return allData.filter(function(d) {
    return d.osservatorio === currentOsservatorio &&
      (currentSensore === ALL || d.sensore === currentSensore);
  });
}

// Precedenza delle sorgenti per temperatura e umidità: il valore "virtual"
// (calcolato/fuso) prevale su ogni sensore fisico quando è presente.
const SORGENTI_TEMP = ['virtual', 'bme280', 'dht22', 'pms'];
const SORGENTI_HUM  = ['virtual', 'bme280', 'dht22', 'pms'];
// La pressione è misurata solo dal barometro BME280: virtuale e bme280
const SORGENTI_PRESS = ['virtual', 'bme280'];

// Primo valore non nullo del campo tra le sorgenti, in ordine di precedenza
function valoreConPrecedenza(d, campo, sorgenti) {
  for (var i = 0; i < sorgenti.length; i++) {
    var s = d && d[sorgenti[i]];
    if (s && s[campo] != null) return s[campo];
  }
  return null;
}

// Pressione normalizzata in hPa. I firmware possono inviarla in Pa (~100000)
// oppure già in hPa (~1000): si sceglie l'unità in base alla grandezza.
function normalizzaPressione(p) {
  if (p == null) return null;
  var n = Number(p);
  if (!isFinite(n)) return null;
  return Math.abs(n) > 5000 ? n / 100 : n;
}

// Pressione in hPa con la precedenza virtual > bme280.
function pressioneHpa(d) {
  return normalizzaPressione(valoreConPrecedenza(d, 'pressure', SORGENTI_PRESS));
}

// Posizione GPS normalizzata. Il firmware nuovo manda la posizione "fusa" in
// virtual_gps (con GPS_HW_POS che dice se viene dal GPS hardware o dalla rete),
// quello vecchio la manda solo in gps. virtual_gps ha la precedenza.
function posizioneGPS(d) {
  if (!d) return null;

  var v = d.virtual_gps;
  if (v) {
    if (v.valid === false || v.lat == null || v.lon == null) return null;
    return {
      lat: Number(v.lat),
      lon: Number(v.lon),
      alt: v.alt != null ? Number(v.alt) : null,
      accuracy: v.accuracy_m != null ? Number(v.accuracy_m) : null,
      sats: v.sats != null ? v.sats : null,
      source: v.source || null,
      hwPos: v.GPS_HW_POS !== undefined ? v.GPS_HW_POS : null,
      legacy: false
    };
  }

  var g = d.gps;
  if (g && g.valid && g.lat != null && g.lon != null) {
    return {
      lat: Number(g.lat),
      lon: Number(g.lon),
      alt: g.alt != null ? Number(g.alt) : null,
      accuracy: null,
      sats: g.sats != null ? g.sats : null,
      source: 'gps',
      hwPos: 0,
      legacy: true
    };
  }
  return null;
}
