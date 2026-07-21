/* ===== MIMOSA - MQTT Client ===== */

function connectMQTT() {
  if (isConnecting) return;
  if (mqttClient && mqttClient.isConnected()) {
    disconnectMQTT();
    return;
  }

  isConnecting = true;
  connectBtn.textContent = 'Connessione...';
  connStatus.className = 'status-indicator connecting';
  connStatus.textContent = 'Connessione...';

  var clientId = 'mimosa_web_' + Math.random().toString(36).slice(2, 10);
  mqttClient = new Paho.Client('broker.hivemq.com', 8000, '/mqtt', clientId);

  mqttClient.onConnectionLost = function(resp) {
    isConnecting = false;
    connectBtn.textContent = 'Connetti';
    connStatus.className = 'status-indicator disconnected';
    connStatus.textContent = 'Disconnesso (errore)';
    mqttClient = null;
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

      var topic = getSubscribeTopic();
      mqttClient.subscribe(topic, { qos: 1 });
      currentTopic.textContent = topic;
      currentClient = clientSelect.value;
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
  clearTimeout(reconnectTimer);
  if (mqttClient && mqttClient.isConnected()) {
    try { mqttClient.disconnect(); } catch (_) {}
  }
  mqttClient = null;
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
    var client = topic.split('/')[1] || 'unknown';
    if (!data.timestamp) return;

    allData.push({
      timestamp: data.timestamp,
      client: client,
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

function onClientChange() {
  var topic = getSubscribeTopic();
  currentTopic.textContent = topic;
  currentClient = clientSelect.value;

  if (mqttClient && mqttClient.isConnected()) {
    try {
      mqttClient.unsubscribe(TOPIC_BASE + '/+/data');
      mqttClient.unsubscribe(TOPIC_BASE + '/*/data');
    } catch (_) {}
    mqttClient.subscribe(topic, { qos: 1 });
  }
  updateDashboard();
}
