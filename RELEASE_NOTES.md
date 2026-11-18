# MIMOSA v1.5.1 — Dati in tempo reale e dashboard locale

Release del 18 novembre 2026. Include **solo Linux e Windows**: la versione
macOS non è inclusa perché non è stato possibile testarla.

## Correzioni principali

- **Dati in tempo reale (bug SSE)** — il server inviava gli eventi senza nome e
  il browser ascoltava eventi `sample`/`status` che non arrivavano mai. Effetto:
  la dashboard sembrava connessa, ma i dati comparivano solo cambiando sensore
  (o "a blocchi" quando si interagiva). Ora gli eventi sono nominati e
  tabella/grafici/card si aggiornano a ogni campione.
- **Polling di sicurezza** — anche se SSE viene bloccato o bufferizzato da
  proxy/browser/rete, la dashboard si riallinea ogni 4 secondi e quando si
  ritorna sulla scheda.
- **Grafici e mappa senza CDN** — Chart.js e MapLibre sono inclusi nel binario
  (`src/vendor/`). Niente più `Cannot read properties of undefined (reading
  'data')` su reti che bloccano jsdelivr; serve internet solo per le tile della
  mappa.
- **`NetworkError when attempting to fetch resource`** — succedeva aprendo la
  dashboard come file (`file:///.../index.html`). Ora compare un avviso chiaro
  che indica di usare `http://localhost:8080`; migliorata anche l'apertura
  automatica del browser (xdg-open → gio open → sensible-browser →
  firefox/chromium) e il controllo iniziale del server con retry.
- **Posizione GPS** — viene mostrata subito anche aprendo la dashboard con
  storico recente (`received_at`); il pallino viene rimosso dopo 20 secondi
  senza dati (comportamento assunto, da confermare col professore).
- **Porta occupata** — MIMOSA chiude solo una vecchia istanza MIMOSA
  riconosciuta dall'API, non processi di altri programmi; se la porta è occupata
  da altro passa alla successiva e stampa l'URL corretto.
- **Robustezza** — guardie se una libreria grafica non è disponibile, errori SSE
  non più silenziosi, connessioni MQTT serializzate (niente doppie istanze
  auto-connect + click), versione visibile nella barra di stato.

## Note per l'aggiornamento

- La **1.5.1 sostituisce la 1.5.0**: scarica il nuovo binario.
- Apri sempre l'URL `http://localhost:8080` stampato all'avvio; **non aprire
  `index.html` come file** (le API del server non sono raggiungibili da
  `file://`).
- Il database `mimosa.db` della 1.5.0 è compatibile: nessuna migrazione.
- Se il broker non risponde sulla porta `1883`, usa `ssl://host:8883` oppure un
  URL `ws://`/`wss://`.

## Download

| Sistema | File |
| ------- | ---- |
| Windows 64 bit | `mimosa-windows-amd64.exe` |
| Linux 64 bit | `mimosa-linux-amd64` |

## Avvio rapido

**Linux**

```bash
chmod +x mimosa-linux-amd64
./mimosa-linux-amd64
```

**Windows**

Doppio click su `mimosa-windows-amd64.exe`; se compare SmartScreen:
*Ulteriori informazioni* → *Esegui comunque*.

Il browser si apre su `http://localhost:8080`. Se non si apre, copia l'URL
stampato nel terminale e aprilo a mano (non aprire il file `index.html`).

## Checksums SHA-256

```text
9899bb217d27642befdc7f09625a25255e0749c5c6677b15b4d2f2e481ef8a60  mimosa-linux-amd64
78a3c4a6abb16f71d19acf01d48aa20af2d0fac340848af00edb08696fb45590  mimosa-windows-amd64.exe
```
