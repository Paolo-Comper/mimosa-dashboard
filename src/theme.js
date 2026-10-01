/* ===== MIMOSA - Theme toggle (chiaro/scuro) ===== */
(function () {
  const KEY = 'mimosa-theme';

  function temaCorrente() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function aggiornaEtichetta() {
    const btn = document.getElementById('themeToggle');
    if (!btn) return;
    const dark = temaCorrente() === 'dark';
    btn.textContent = dark ? '☀️ Giorno' : '🌙 Notte';
    btn.setAttribute('aria-label', dark ? 'Passa al tema chiaro' : 'Passa al tema scuro');
  }

  function applicaTema(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem(KEY, t); } catch (e) {}
    aggiornaEtichetta();
    if (typeof window.applicaTemaGrafici === 'function') window.applicaTemaGrafici();
    if (typeof window.applicaTemaMappa === 'function') window.applicaTemaMappa();
  }

  function cambiaTema() {
    applicaTema(temaCorrente() === 'dark' ? 'light' : 'dark');
  }

  function init() {
    const btn = document.getElementById('themeToggle');
    if (btn) btn.addEventListener('click', cambiaTema);
    aggiornaEtichetta();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.cambiaTema = cambiaTema;
})();
