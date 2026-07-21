/* ===== MIMOSA - localStorage Persistence ===== */

function loadData() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw) allData = JSON.parse(raw);
  } catch (_) { allData = []; }
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allData));
  } catch (_) {
    allData = allData.slice(-1000);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(allData)); } catch (_2) {}
  }
}
