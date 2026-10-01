/* ===== MIMOSA - MQTT (broker.hivemq.com) ===== */
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

  isConnecting = true;
  manualDisconnect = false;
  connectBtn.textContent = 'Connessione...';
  connStatus.className = 'status-indicator connecting';
  connStatus.textContent = 'Connessione...';

  var host = (brokerInput && brokerInput.value) ? brokerInput.value : 'broker.hivemq.com';
  var clientId = 'mimosa_web_' + Math.random().toString(36).slice(2, 10);
  mqttClient = new Paho.Client(host, 8000, '/mqtt', clientId);

  mqttClient.onConnectionLost = function(resp) {
    if (manualDisconnect) return;
    isConnecting = false;
    connectBtn.textContent = 'Connetti';
    connStatus.className = 'status-indicator disconnected';
    connStatus.textContent = 'Disconnesso (errore)';
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
      connStatus.textContent = 'Errore: ' + (err.errorMessage || 'connessione fallita');
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
