/* ===== MIMOSA - MQTT lato server + stream eventi (SSE) ===== */
/* Il browser non parla più direttamente col broker: chiede al server locale
   di collegarsi e riceve i campioni via Server-Sent Events. */

function mostraStato(conn, testo, dettaglio) {
  connStatus.className = 'status-indicator ' + conn;
  connStatus.textContent = testo;
  connStatus.title = dettaglio || '';
}

function connectMQTT() {
  if (isConnecting) return;
  if (mqttConnesso) {
    disconnectMQTT();
    return;
  }

  var broker = (brokerInput ? brokerInput.value : DEFAULT_BROKER || '').trim();
  var topic = getSubscribeTopic();
  isConnecting = true;
  connectBtn.textContent = 'Connessione...';
  mostraStato('connecting', 'Connessione...', broker + ' · ' + topic);

  apiRichiesta('/api/mqtt/connect', 'POST', { broker: broker, topic: topic })
    .then(function (stato) {
      isConnecting = false;
      saveBroker(broker);
      applicaStatoMQTT(stato);
      return ricaricaSelezione();
    })
    .catch(function (err) {
      isConnecting = false;
      mqttConnesso = false;
      connectBtn.textContent = 'Connetti';
      mostraStato('disconnected', 'Errore: ' + err.message, err.message);
    });
}

function disconnectMQTT() {
  mqttConnesso = false;
  chiudiStream();
  connectBtn.textContent = 'Connetti';
  mostraStato('disconnected', 'Disconnesso', '');
  apiRichiesta('/api/mqtt/disconnect', 'POST', {}).catch(function () {});
}

// Applica lo stato del server alla UI (usato da connect, su SSE e all'avvio).
function applicaStatoMQTT(stato) {
  if (!stato) return;
  mqttConnesso = !!stato.connected;
  connectBtn.textContent = mqttConnesso ? 'Disconnetti' : 'Connetti';
  if (stato.topic) currentTopic.textContent = stato.topic;

  if (mqttConnesso) {
    if (stato.broker) brokerInput.value = stato.broker;
    mostraStato('connected', 'Connesso', (stato.broker || '') + ' · ' + (stato.topic || ''));
    if (!eventiSSE) apriStream();
  } else if (stato.error) {
    mostraStato('disconnected', 'Errore: ' + stato.error, stato.error);
  } else {
    mostraStato('disconnected', 'Disconnesso', '');
  }
}

// All'avvio chiede al server se è già connesso (es. riconnessione automatica).
function inizializzaStatoMQTT() {
  return apiGet('/api/status').then(function (stato) {
    if (stato && stato.connected) {
      assicuraOpzione(osservatorioSelect, stato.osservatorio);
      if (stato.osservatorio) osservatorioSelect.value = stato.osservatorio;
      assicuraOpzione(sensoreSelect, stato.sensore);
      if (stato.sensore) sensoreSelect.value = stato.sensore;
      currentOsservatorio = osservatorioSelect.value;
      currentSensore = sensoreSelect.value;
      if (stato.broker) brokerInput.value = stato.broker;
    }
    applicaStatoMQTT(stato || {});
    return stato;
  });
}

// ---- Server-Sent Events ----

function apriStream() {
  chiudiStream();
  if (typeof EventSource === 'undefined') return;
  eventiSSE = new EventSource('/api/stream');

  eventiSSE.addEventListener('status', function (ev) {
    try {
      var msg = JSON.parse(ev.data);
      if (msg && msg.type === 'status' && msg.mqtt) applicaStatoMQTT(msg.mqtt);
    } catch (_) {}
  });

  eventiSSE.addEventListener('sample', function (ev) {
    try {
      var msg = JSON.parse(ev.data);
      if (msg && msg.type === 'sample' && msg.sample) aggiungiCampioneUI(msg.sample);
    } catch (_) {}
  });

  eventiSSE.onerror = function () {
    if (!mqttConnesso) mostraStato('connecting', 'Riconnessione...', '');
  };
}

function chiudiStream() {
  if (eventiSSE) {
    eventiSSE.close();
    eventiSSE = null;
  }
}

function appartieneAllaSelezione(d) {
  return d.osservatorio === currentOsservatorio &&
    (currentSensore === ALL || d.sensore === currentSensore);
}

// Aggiunge un campione ricevuto in tempo reale (senza riscriverlo: lo salva
// già il server). Tiene in RAM solo gli ultimi MAX_MEMORIA campioni.
function aggiungiCampioneUI(sample) {
  if (!sample) return;
  if (sample.id && sample.id <= ultimoIdCampione) return; // già caricato dallo storico
  var d = recordDaSample(sample);
  if (!d || d.timestamp == null) return;

  allData.push(d);
  if (allData.length > MAX_MEMORIA) {
    allData = allData.slice(-MAX_MEMORIA);
  }
  ultimoIdCampione = Math.max(ultimoIdCampione, sample.id || 0);
  ultimoArrivoDati = Date.now();
  if (appartieneAllaSelezione(d)) totaleCampioni += 1;
  updateDashboard();
}

// Cambio osservatorio/sensore: il server si ri-sottoscrive e la UI ricarica
// lo storico della nuova selezione.
function onSelectionChange() {
  var topic = getSubscribeTopic();
  currentTopic.textContent = topic;
  currentOsservatorio = osservatorioSelect.value;
  currentSensore = sensoreSelect.value;

  if (mqttConnesso) {
    apiRichiesta('/api/mqtt/connect', 'POST', { broker: brokerInput.value.trim(), topic: topic })
      .then(function (stato) { applicaStatoMQTT(stato); })
      .catch(function (err) {
        mqttConnesso = false;
        connectBtn.textContent = 'Connetti';
        mostraStato('disconnected', 'Errore: ' + err.message, err.message);
      });
  }
  ricaricaSelezione().catch(function (err) {
    console.warn('MIMOSA: ricarica selezione non riuscita', err);
  });
}
