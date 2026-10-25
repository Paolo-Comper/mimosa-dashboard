/* ===== MIMOSA - MQTT ===== */

// Porte WebSocket dei broker pubblici più comuni
var BROKER_PORTS = {
  'broker.hivemq.com': { ws: 8000, wss: 8884 },
  'test.mosquitto.org': { ws: 8080, wss: 8081 },
  'broker.emqx.io': { ws: 8083, wss: 8084 },
  'broker.mqtt.eclipseprojects.io': { ws: 80, wss: 443 },
  'mqtt.eclipseprojects.io': { ws: 80, wss: 443 }
};

// Accetta "host", "host:porta", "host:porta/percorso" oppure un URL ws:// o wss://.
// Per i broker noti usa la porta WebSocket giusta; altrimenti 8000 (ws) o 8884 (wss).
function parseBroker(raw) {
  var s = String(raw || '').trim();
  if (!s) return null;

  var scheme = (s.match(/^(wss?|mqtts?|https?):\/\//i) || [])[1];
  var useSSL = scheme
    ? /^(wss|mqtts|https)$/i.test(scheme)
    : (typeof location !== 'undefined' && location.protocol === 'https:');
  if (scheme) s = s.slice(scheme.length + 3);

  var path = '/mqtt';
  var slash = s.indexOf('/');
  if (slash !== -1) {
    path = s.slice(slash) || '/mqtt';
    s = s.slice(0, slash);
  }

  var host = s;
  var port = null;

  if (s.charAt(0) === '[') {
    var end = s.indexOf(']');
    if (end === -1) return null;
    host = s.slice(0, end + 1);
    if (s.charAt(end + 1) === ':') port = parseInt(s.slice(end + 2), 10);
  } else {
    var colon = s.lastIndexOf(':');
    // Un solo ':' separa host e porta; più ':' indicano un IPv6 senza parentesi
    if (colon !== -1 && s.indexOf(':') === colon) {
      host = s.slice(0, colon);
      port = parseInt(s.slice(colon + 1), 10);
    }
  }

  var known = BROKER_PORTS[host.toLowerCase().replace(/^\[|\]$/g, '')];
  if (port == null) {
    port = known ? (useSSL ? known.wss : known.ws) : (useSSL ? 8884 : 8000);
  } else if (!scheme && known && port === known.wss && port !== known.ws) {
    // Porta TLS del broker indicata senza schema: usa wss
    useSSL = true;
  }

  if (!host || !isFinite(port) || port < 1 || port > 65535) return null;
  return { host: host, port: port, path: path, useSSL: useSSL };
}

function brokerUrl(broker) {
  var host = broker.host;
  if (host.indexOf(':') !== -1 && host.charAt(0) !== '[') {
    host = '[' + host + ']';
  }
  return (broker.useSSL ? 'wss' : 'ws') + '://' + host + ':' + broker.port + broker.path;
}

function connectMQTT() {
  if (isConnecting) return;
  if (mqttClient && mqttClient.isConnected()) {
    disconnectMQTT();
    return;
  }

  if (typeof Paho === 'undefined') {
    connStatus.className = 'status-indicator disconnected';
    connStatus.textContent = 'Libreria MQTT non caricata (serve internet)';
    return;
  }

  var broker = parseBroker(brokerInput ? brokerInput.value : DEFAULT_BROKER);
  if (!broker) {
    connStatus.className = 'status-indicator disconnected';
    connStatus.textContent = 'Broker non valido';
    return;
  }

  var url = brokerUrl(broker);
  isConnecting = true;
  manualDisconnect = false;
  connectBtn.textContent = 'Connessione...';
  connStatus.className = 'status-indicator connecting';
  connStatus.textContent = 'Connessione...';
  connStatus.title = url;
  console.log('MQTT: connessione a ' + url);

  var clientId = 'mimosa_web_' + Math.random().toString(36).slice(2, 10);
  mqttClient = new Paho.Client(url, clientId);

  mqttClient.onConnectionLost = function(resp) {
    if (manualDisconnect) return;
    isConnecting = false;
    connectBtn.textContent = 'Connetti';
    connStatus.className = 'status-indicator disconnected';
    connStatus.textContent = 'Disconnesso (errore)';
    connStatus.title = url + ' — ' + (resp && resp.errorMessage ? resp.errorMessage : 'connessione persa');
    mqttClient = null;
    currentSubTopic = null;
    scheduleReconnect();
  };

  mqttClient.onMessageArrived = function(msg) {
    processMessage(msg.destinationName, msg.payloadString);
  };

  var connectOptions = {
    keepAliveInterval: KEEP_ALIVE,
    cleanSession: true,
    reconnect: false,
    onSuccess: function() {
      isConnecting = false;
      connectBtn.textContent = 'Disconnetti';
      connStatus.className = 'status-indicator connected';
      connStatus.textContent = 'Connesso';

      currentOsservatorio = osservatorioSelect.value;
      currentSensore = sensoreSelect.value;

      var topic = getSubscribeTopic();
      mqttClient.subscribe(topic, { qos: 1 });
      currentSubTopic = topic;
      currentTopic.textContent = topic;
      updateDashboard();
    },
    onFailure: function(err) {
      isConnecting = false;
      connectBtn.textContent = 'Connetti';
      connStatus.className = 'status-indicator disconnected';
      var dettaglio = (err && err.errorMessage) ? err.errorMessage : 'connessione fallita';
      if (err && err.errorCode === 7) {
        connStatus.textContent = 'Errore socket: broker non raggiungibile';
        dettaglio = 'Impossibile aprire il WebSocket ' + url +
          '. Verifica host, porta WebSocket e firewall: la porta 1883 è MQTT TCP e non funziona nel browser. ' +
          'Se il broker non è tra quelli noti, indica la porta WebSocket (es. host:9001).';
      } else {
        connStatus.textContent = 'Errore: ' + dettaglio;
      }
      connStatus.title = dettaglio;
      console.error('MQTT ' + url + ':', dettaglio, err);
      mqttClient = null;
      scheduleReconnect();
    }
  };

  try {
    mqttClient.connect(connectOptions);
  } catch (e) {
    isConnecting = false;
    connectBtn.textContent = 'Connetti';
    connStatus.className = 'status-indicator disconnected';
    connStatus.textContent = 'Errore: ' + e.message;
    mqttClient = null;
  }
}

function disconnectMQTT() {
  manualDisconnect = true;
  clearTimeout(reconnectTimer);
  if (mqttClient && mqttClient.isConnected()) {
    try { mqttClient.disconnect(); } catch (_) {}
  }
  mqttClient = null;
  currentSubTopic = null;
  isConnecting = false;
  connectBtn.textContent = 'Connetti';
  connStatus.className = 'status-indicator disconnected';
  connStatus.textContent = 'Disconnesso';
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(function() {
    if (!mqttClient || !mqttClient.isConnected()) {
      connectMQTT();
    }
  }, RECONNECT_DELAY);
}

function processMessage(topic, payload) {
  try {
    var data = JSON.parse(payload);
    if (!data.timestamp) return;

    var parti = topic.split('/');
    var osservatorio = parti[0] || DEFAULT_OSSERVATORIO;
    var sensore = parti[1] || 'sconosciuto';

    allData.push({
      timestamp: data.timestamp,
      osservatorio: osservatorio,
      sensore: sensore,
      pms: data.pms || {},
      dht22: data.dht22 || {},
      bme280: data.bme280 || {},
      virtual: data.virtual || {},
      gps: data.gps || {}
    });

    if (allData.length > MAX_RECORDS) {
      allData = allData.slice(-MAX_RECORDS);
    }

    saveData();
    updateDashboard();
  } catch (e) {
    console.warn('Errore parsing messaggio:', e);
  }
}

// Cambio di osservatorio o sensore: riallinea l'iscrizione al topic {osservatorio}/{sensore}/data
function onSelectionChange() {
  var topic = getSubscribeTopic();
  currentTopic.textContent = topic;
  currentOsservatorio = osservatorioSelect.value;
  currentSensore = sensoreSelect.value;

  if (mqttClient && mqttClient.isConnected()) {
    if (currentSubTopic && currentSubTopic !== topic) {
      try { mqttClient.unsubscribe(currentSubTopic); } catch (_) {}
    }
    mqttClient.subscribe(topic, { qos: 1 });
    currentSubTopic = topic;
  }
  updateDashboard();
}
