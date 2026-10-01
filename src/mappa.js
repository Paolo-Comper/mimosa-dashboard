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

  // Singolo punto verde (ultima posizione)
  map.addLayer({
    id: 'ultima-posizione',
    type: 'circle',
    source: 'posizione',
    paint: {
      'circle-radius': 10,
      'circle-color': '#2ecc71',
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
  new maplibregl.Popup()
    .setLngLat(e.lngLat)
    .setHTML(`
      <div style="font-family: sans-serif; font-size: 13px; line-height: 1.5;">
        <strong style="color:#2f7fd6;">${p.ora}</strong><br>
        📍 ${Number(p.lat).toFixed(5)}, ${Number(p.lon).toFixed(5)}<br>
        🏔️ ${p.alt ? Number(p.alt).toFixed(1) + ' m' : '—'} &nbsp;🛰️ ${p.sats || '—'} sat<br>
        🌫️ PM₁: ${p.pm1 ?? '—'} · PM₂.₅: ${p.pm25 ?? '—'} · PM₁₀: ${p.pm10 ?? '—'}<br>
        🌡️ ${p.temp ?? '—'}°C · 💧 ${p.hum ?? '—'}% · 🔽 ${p.press ?? '—'} hPa
      </div>
    `)
    .addTo(window.mimosaMap);
}

function aggiornaMappa(dati) {
  const map = window.mimosaMap;
  if (!map || !map.isStyleLoaded()) return;

  // Prende solo l'ultimo dato con GPS valido
  const ultimo = dati
    .filter(d => d.gps && d.gps.valid && d.gps.lat !== null && d.gps.lon !== null)
    .pop();

  if (!ultimo) return;

  const g = ultimo.gps;
  const feature = {
    type: 'Feature',
    properties: {
      ora: new Date(ultimo.timestamp * 1000).toLocaleString('it-IT'),
      lat: g.lat,
      lon: g.lon,
      alt: g.alt,
      sats: g.sats,
      pm1: ultimo.pms?.pm1,
      pm25: ultimo.pms?.pm25,
      pm10: ultimo.pms?.pm10,
      temp: ultimo.bme280?.temperature ?? ultimo.dht22?.temperature ?? ultimo.pms?.temperature,
      hum: ultimo.bme280?.humidity ?? ultimo.dht22?.humidity ?? ultimo.pms?.humidity,
      press: ultimo.bme280?.pressure ? (ultimo.bme280.pressure / 100).toFixed(1) : null
    },
    geometry: {
      type: 'Point',
      coordinates: [g.lon, g.lat]
    }
  };

  window.ultimaFeatureMappa = feature;

  const source = map.getSource('posizione');
  if (!source) return;

  source.setData({
    type: 'FeatureCollection',
    features: [feature]
  });

  // Centra sull'ultima posizione (ogni aggiornamento)
  map.flyTo({ center: [g.lon, g.lat], zoom: 15, duration: 1000 });
}

// Esponi le funzioni globalmente
window.initMimosaMap = initMimosaMap;
window.aggiornaMappa = aggiornaMappa;
window.applicaTemaMappa = applicaTemaMappa;

// Avvio automatico
initMimosaMap();
