/* ===== MIMOSA - State & Constants ===== */
const STORAGE_KEY = 'mimosa_data';
const STORAGE_SENSORS_KEY = 'mimosa_sensori';
const STORAGE_OSSERVATORI_KEY = 'mimosa_osservatori';
const STORAGE_DEVICES_KEY = 'mimosa_devices'; // legacy (era l'elenco dei "client")
const DEFAULT_SENSORS = ['rpi-zero-1', 'rpi-zero-2'];
const DEFAULT_OSSERVATORI = ['mimosa'];
const DEFAULT_OSSERVATORIO = 'mimosa';
const MAX_RECORDS = 5000;
const KEEP_ALIVE = 60;
const RECONNECT_DELAY = 5000;
const ALL = '+';

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
