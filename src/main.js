/* ===== MIMOSA - Init & Event Listeners ===== */

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
    .catch(function (err) {
      console.error('MIMOSA init:', err);
      mostraStato('disconnected', 'Server non raggiungibile: ' + err.message, err.message);
    });
}

bindEventi();
inizializzaApp();
console.log('MIMOSA avviato: i dati sono salvati dal server in SQLite.');
