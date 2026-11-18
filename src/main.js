/* ===== MIMOSA - Init & Event Listeners ===== */

// ---- Avvisi in pagina ----
function mostraAvviso(html, id) {
  id = id || 'avviso-mimosa';
  var box = document.getElementById(id);
  if (!box) {
    box = document.createElement('div');
    box.id = id;
    box.className = 'avviso-mimosa';
    document.body.insertBefore(box, document.body.firstChild);
  }
  box.innerHTML = html;
  box.style.display = 'block';
}

function nascondiAvviso(id) {
  var box = document.getElementById(id || 'avviso-mimosa');
  if (box) box.style.display = 'none';
}

// ---- Menu di esportazione (formati multipli) ----
function toggleExportMenu(show) {
  var menu = $('exportMenu');
  var btn = $('exportBtn');
  var apri = typeof show === 'boolean' ? show : menu.hidden;
  menu.hidden = !apri;
  btn.setAttribute('aria-expanded', String(apri));
}

function bindEventi() {
  connectBtn.addEventListener('click', connectMQTT);
  osservatorioSelect.addEventListener('change', onSelectionChange);
  sensoreSelect.addEventListener('change', onSelectionChange);

  brokerInput.addEventListener('change', function () {
    var value = brokerInput.value.trim();
    brokerInput.value = value;
    saveBroker(value);
    if (mqttConnesso) {
      disconnectMQTT();
      mostraStato('disconnected', 'Broker modificato: riconnetti', '');
    }
  });

  document.getElementById('exportBtn').addEventListener('click', function (e) {
    e.stopPropagation();
    toggleExportMenu();
  });
  document.getElementById('exportConfirm').addEventListener('click', function () {
    esportaSelezionati();
    toggleExportMenu(false);
  });
  document.getElementById('clearExported').addEventListener('click', clearExported);
  document.getElementById('clearData').addEventListener('click', clearData);

  document.addEventListener('click', function (e) {
    var dentro = e.target && e.target.closest && e.target.closest('.export-dropdown');
    if (!dentro) toggleExportMenu(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') toggleExportMenu(false);
  });

  // Tornando sulla scheda (o dopo la sospensione del PC) riallinea subito i dati.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && mqttConnesso) sincronizzaDalServer();
  });
  window.addEventListener('online', function () {
    if (mqttConnesso) sincronizzaDalServer();
  });

  document.getElementById('addOsservatorioBtn').addEventListener('click', function () {
    var name = prompt('Inserisci il nome del nuovo osservatorio:');
    if (name && name.trim()) {
      addOsservatorio(name.trim());
      onSelectionChange();
    }
  });

  document.getElementById('addSensoreBtn').addEventListener('click', function () {
    var name = prompt('Inserisci il nome del nuovo sensore:');
    if (name && name.trim()) {
      addSensore(name.trim());
      onSelectionChange();
    }
  });

  // Double-click per aggiungere rapidamente un sensore (fallback)
  sensoreSelect.addEventListener('dblclick', function () {
    var name = prompt('Inserisci il nome del sensore:');
    if (name && name.trim()) {
      addSensore(name.trim());
      onSelectionChange();
    }
  });
}

// ---- Init asincrona: config locale, migrazione, stato server, storico ----
function inizializzaApp() {
  populateOsservatorioSelect();
  populateSensoreSelect();

  var savedBroker = loadBroker();
  if (savedBroker) brokerInput.value = savedBroker;

  return migraVecchiDati()
    .then(inizializzaStatoMQTT)
    .then(function () {
      if (!currentOsservatorio) currentOsservatorio = osservatorioSelect.value;
      if (!currentSensore) currentSensore = sensoreSelect.value;
      currentTopic.textContent = getSubscribeTopic();
      return ricaricaSelezione();
    })
    .then(function () {
      nascondiAvviso();
    })
    .catch(function (err) {
      console.error('MIMOSA init:', err);
      mostraAvviso(
        '<strong>Server MIMOSA non raggiungibile.</strong> Verifica che l\'eseguibile sia in esecuzione ' +
        'e apri <a href="' + location.origin + '/">' + location.origin + '</a> (non il file index.html).' +
        '<br><small>Dettaglio: ' + (err && err.message ? err.message : err) + '</small>'
      );
      mostraStato('disconnected', 'Server non raggiungibile', err && err.message ? err.message : '');
    });
}

function avvia() {
  // Se la pagina è stata aperta come file, le API /api/ non possono funzionare.
  if (location.protocol === 'file:') {
    mostraAvviso(
      '<strong>MIMOSA non funziona aperto come file.</strong> ' +
      'Avvia l\'eseguibile di MIMOSA e apri <a href="http://localhost:8080/">http://localhost:8080</a> ' +
      '(non il file index.html).',
      'avviso-file'
    );
    mostraStato('disconnected', 'Apri da http://localhost:8080', 'file:// non supportato');
    return;
  }

  bindEventi();

  if (typeof Chart === 'undefined') {
    mostraAvviso(
      'Grafici non disponibili: la libreria Chart.js non è stata caricata. ' +
      'I dati restano visibili in tabella e negli altri pannelli.',
      'avviso-grafici'
    );
  }

  inizializzaApp();
}

avvia();
console.log('MIMOSA avviato: i dati sono salvati dal server in SQLite.');
