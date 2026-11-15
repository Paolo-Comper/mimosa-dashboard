/* ===== MIMOSA - Esportazione e gestione dati (lato server) ===== */
/* CSV/JSON vengono generati in streaming dal server Go: qui si apre solo il
   download. Lo storico completo non passa più dalla memoria del browser. */

function urlExport(formato) {
  return '/api/export?format=' + encodeURIComponent(formato) +
    '&osservatorio=' + encodeURIComponent(currentOsservatorio || '') +
    '&sensore=' + encodeURIComponent(currentSensore || '');
}

function scaricaFormato(formato) {
  var a = document.createElement('a');
  a.href = urlExport(formato);
  a.download = '';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { a.remove(); }, 1000);
}

// Scarica i formati richiesti e poi aggiorna il contatore "Esportati".
function esportaSelezionati() {
  var formati = [];
  if ($('fmtCSV').checked) formati.push('csv');
  if ($('fmtJSON').checked) formati.push('json');
  if (formati.length === 0) {
    alert('Seleziona almeno un formato (CSV o JSON).');
    return;
  }
  formati.forEach(function (f, i) {
    setTimeout(function () { scaricaFormato(f); }, i * 700);
  });
  // il server marca i record come esportati durante lo streaming
  setTimeout(function () {
    aggiornaStatistiche().then(updateDashboard).catch(function () {});
  }, 2500);
}

function clearExported() {
  if (!confirm('Cancellare dal database tutti i dati già esportati?')) return;
  apiRichiesta('/api/exported', 'DELETE')
    .then(function () { return ricaricaSelezione(); })
    .catch(function (err) { alert('Errore: ' + err.message); });
}

function clearData() {
  if (!confirm('Cancellare TUTTI i dati ricevuti dall\'archivio?')) return;
  apiRichiesta('/api/samples', 'DELETE')
    .then(function () { return ricaricaSelezione(); })
    .catch(function (err) { alert('Errore: ' + err.message); });
}
