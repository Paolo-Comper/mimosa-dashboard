/* ===== MIMOSA - State & Constants ===== */

const STORAGE_KEY = 'mimosa_data';
const STORAGE_DEVICES_KEY = 'mimosa_devices';
const DEFAULT_DEVICES = ['rpi-zero-1', 'rpi-zero-2'];
const MAX_RECORDS = 5000;
const TOPIC_BASE = 'mimosa';
const KEEP_ALIVE = 60;
const RECONNECT_DELAY = 5000;

// ---- Global state ----
let allData = [];
let mqttClient = null;
let isConnecting = false;
let reconnectTimer = null;
let currentClient = '+';

// ---- DOM refs ----
const $ = id => document.getElementById(id);
const clientSelect   = $('clientSelect');
const brokerInput    = $('brokerInput');
const connectBtn     = $('connectBtn');
const connStatus     = $('connectionStatus');
const dataCount      = $('dataCount');
const lastUpdate     = $('lastUpdate');
const currentTopic   = $('currentTopic');
const tableBody      = $('tableBody');

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
  return TOPIC_BASE + '/' + clientSelect.value + '/data';
}
function getPublishTopic(client) {
  return TOPIC_BASE + '/' + client + '/data';
}
