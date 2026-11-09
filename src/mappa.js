/* ===== MIMOSA - Mappa GPS (MapLibre GL) ===== */
/* Mostra solo l'ultima posizione rilevata (installazione fissa). */

// Sopprime i warning WebGL (deprecati, innocui)
{
  const _warn = console.warn.bind(console);
  console.warn = (...a) => {
    if (a.length && typeof a[0] === 'string' && a[0].startsWith('WebGL warning:')) return;
    _warn(...a);
  };
}

window.mimosaMap = null;
window.ultimaFeatureMappa = null;

// Basemap chiaro / scuro a seconda del tema
const MAP_STYLE = {
  light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
};

function stileMappa() {
  return document.documentElement.getAttribute('data-theme') === 'dark'
    ? MAP_STYLE.dark
    : MAP_STYLE.light;
}

function aggiungiLivelliMappa() {
  const map = window.mimosaMap;
  if (!map || map.getSource('posizione')) return;

  map.addSource('posizione', {
    type: 'geojson',
    data: window.ultimaFeatureMappa
      ? { type: 'FeatureCollection', features: [window.ultimaFeatureMappa] }
      : { type: 'FeatureCollection', features: [] }
  });

  // Pallino: GIALLO = posizione dal GPS hardware (GPS_HW_POS = 1),
  // VERDE = posizione dalla rete (GPS_HW_POS = 0).
  map.addLayer({
    id: 'ultima-posizione',
    type: 'circle',
    source: 'posizione',
    paint: {
      'circle-radius': 10,
      'circle-color': ['match', ['get', 'gps_hw_pos'], 1, '#f1c40f', 0, '#2ecc71', '#95a5a6'],
      'circle-stroke-width': 3,
      'circle-stroke-color': '#ffffff',
      'circle-opacity': 0.95
    }
  });

  map.on('click', 'ultima-posizione', e => mostraPopupMappa(e));
}

function initMimosaMap() {
  if (typeof maplibregl === 'undefined') {
    const el = document.getElementById('map');
    if (el) el.innerHTML = '<div class="map-unavailable">Mappa non disponibile: serve una connessione a internet.</div>';
    return;
  }

  const map = new maplibregl.Map({
    container: 'map',
    style: stileMappa(),
    center: [12.6376, 43.7238],
    zoom: 14
  });

  map.addControl(new maplibregl.NavigationControl(), 'top-right');

  // 'style.load' scatta anche dopo setStyle (cambio tema)
  map.on('load', aggiungiLivelliMappa);
  map.on('style.load', aggiungiLivelliMappa);

  window.mimosaMap = map;
}

// Cambia la basemap in base al tema corrente (invocata dal toggle tema)
function applicaTemaMappa() {
  const map = window.mimosaMap;
  if (!map) return;
  map.setStyle(stileMappa());
}

function mostraPopupMappa(e) {
  const p = e.features[0].properties;
  const fonte = p.source === 'network' ? 'rete (IP)'
    : (p.source === 'gps' ? 'GPS hardware' : (p.source || '\u2014'));
  const accuratezza = p.accuracy != null ? ' \u00b1 ' + fmtDistanza(p.accuracy) : '';
  new maplibregl.Popup()
    .setLngLat(e.lngLat)
    .setHTML(`
      <div style="font-family: sans-serif; font-size: 13px; line-height: 1.5;">
        <strong style="color:#2f7fd6;">${p.ora}</strong><br>
        📍 ${Number(p.lat).toFixed(5)}, ${Number(p.lon).toFixed(5)}<br>
        🛰️ ${fonte}${accuratezza}<br>
        🏔️ ${p.alt != null ? Number(p.alt).toFixed(1) + ' m' : '—'} &nbsp;🛰️ ${p.sats ?? '—'} sat<br>
        🌫️ PM₁: ${p.pm1 ?? '—'} · PM₂.₅: ${p.pm25 ?? '—'} · PM₁₀: ${p.pm10 ?? '—'}<br>
        🌡️ ${p.temp ?? '—'}°C · 💧 ${p.hum ?? '—'}% · 🔽 ${p.press ?? '—'} hPa
      </div>
    `)
    .addTo(window.mimosaMap);
}

// Toglie il pallino dalla mappa (nessuna posizione da proiettare).
function svuotaMappa() {
  window.ultimaFeatureMappa = null;
  const map = window.mimosaMap;
  if (!map) return;
  const source = map.getSource('posizione');
  if (source) source.setData({ type: 'FeatureCollection', features: [] });
}

function aggiornaMappa(dati) {
  const map = window.mimosaMap;
  if (!map || !map.isStyleLoaded()) return;

  // Nessun dato recente: la posizione non è più attendibile (GPS_STALE_MS).
  if (!ultimoArrivoDati || Date.now() - ultimoArrivoDati > GPS_STALE_MS) {
    svuotaMappa();
    return;
  }

  const ultimo = dati[dati.length - 1];
  const pos = posizioneGPS(ultimo);
  if (!pos) {
    svuotaMappa();
    return;
  }

  // GPS_HW_POS: 1 = GPS hardware (giallo), 0 = rete (verde),
  // null/assente = nessun pallino.
  const hwPos = pos.legacy ? 0 : pos.hwPos;
  if (!pos.legacy && hwPos !== 1 && hwPos !== 0) {
    svuotaMappa();
    return;
  }

  const press = pressioneHpa(ultimo);
  const feature = {
    type: 'Feature',
    properties: {
      ora: new Date(ultimo.timestamp * 1000).toLocaleString('it-IT'),
      lat: pos.lat,
      lon: pos.lon,
      alt: pos.alt,
      sats: pos.sats,
      accuracy: pos.accuracy,
      source: pos.source || (pos.legacy ? 'gps' : null),
      gps_hw_pos: hwPos,
      pm1: ultimo.pms?.pm1,
      pm25: ultimo.pms?.pm25,
      pm10: ultimo.pms?.pm10,
      temp: valoreConPrecedenza(ultimo, 'temperature', SORGENTI_TEMP),
      hum: valoreConPrecedenza(ultimo, 'humidity', SORGENTI_HUM),
      press: press != null ? press.toFixed(1) : null
    },
    geometry: {
      type: 'Point',
      coordinates: [pos.lon, pos.lat]
    }
  };

  const prec = window.ultimaFeatureMappa;
  const stesseCoord = !!prec &&
    Math.abs(prec.geometry.coordinates[0] - pos.lon) < 1e-6 &&
    Math.abs(prec.geometry.coordinates[1] - pos.lat) < 1e-6;
  const stessoColore = !!prec && prec.properties.gps_hw_pos === hwPos;

  window.ultimaFeatureMappa = feature;

  // Aggiorna la mappa (e ricentra) solo se cambiano le coordinate o il colore
  // del pallino: evita di "rigenerare" la mappa a ogni campione.
  if (stesseCoord && stessoColore) return;

  const source = map.getSource('posizione');
  if (!source) return;

  source.setData({
    type: 'FeatureCollection',
    features: [feature]
  });

  if (!stesseCoord) {
    map.flyTo({ center: [pos.lon, pos.lat], zoom: 15, duration: 1000 });
  }
}

// Controllo periodico: se il sensore smette di inviare dati, dopo
// GPS_STALE_MS il pallino sparisce dalla mappa.
function controllaScadenzaGPS() {
  if (!window.ultimaFeatureMappa) return;
  if (!ultimoArrivoDati || Date.now() - ultimoArrivoDati > GPS_STALE_MS) {
    svuotaMappa();
  }
}
setInterval(controllaScadenzaGPS, 1000);

// Esponi le funzioni globalmente
window.initMimosaMap = initMimosaMap;
window.aggiornaMappa = aggiornaMappa;
window.applicaTemaMappa = applicaTemaMappa;

// Avvio automatico
initMimosaMap();
