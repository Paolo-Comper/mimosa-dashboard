# MIMOSA v1.5.1 — Dati in tempo reale e dashboard locale

Release del 18 novembre 2026.

## Correzioni principali

- **Dati in tempo reale (bug SSE)** — il server inviava gli eventi senza nome e
  il browser ascoltava eventi `sample`/`status` che non arrivavano mai. Effetto:
  la dashboard sembrava connessa, ma i dati comparivano solo cambiando sensore
  (o "a blocchi" quando si interagiva). Ora gli eventi sono nominati e la
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
- **Robustezza** — guardie se una libreria grafica non è disponibile, errori SSE
  non più silenziosi, versione visibile nella barra di stato.

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
| macOS Intel | `mimosa-darwin-amd64` |
| macOS Apple Silicon (M1/M2/M3) | `mimosa-darwin-arm64` |

## Avvio rapido

**Linux / macOS**

```bash
chmod +x mimosa-linux-amd64        # oppure mimosa-darwin-*
./mimosa-linux-amd64
```

**Windows**

Doppio click su `mimosa-windows-amd64.exe`; se compare SmartScreen:
*Ulteriori informazioni* → *Esegui comunque*.

Il browser si apre su `http://localhost:8080`. Se non si apre, copia l'URL
stampato nel terminale e aprilo a mano (non aprire il file `index.html`).

## Checksums SHA-256

```text
a440b71f9128f34bf97ffb6864ea132029fbd8062d7638c259a75bdfd21af028  mimosa-darwin-amd64
700180ff33716fdd959ae196e5a0022566205c72a678b5afd9118116eeb3cfd8  mimosa-darwin-arm64
e2e6c1bd6e5f7339562f2395c26c51ea105812d2a52e9b6da0abb7752f0d0f5d  mimosa-linux-amd64
0fa8746705544dfbe0b586b72148b6fd8eaee45e295386bbc10b42765cf52e8a  mimosa-windows-amd64.exe
```
