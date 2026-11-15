# MIMOSA v1.5.0 — Archivio SQLite e MQTT lato server

Release del 15 novembre 2026.

## La novità principale: i dati vivono sul server

Fino alla 1.4.0 lo storico era nel browser e si fermava a **5.000 campioni**
(5.001 righe nell'export CSV). Ora il server Go riceve i messaggi MQTT, li salva
in un database **SQLite** (`mimosa.db`) e li serve alla dashboard:

- **Nessun limite di 5.000 campioni**: lo storico cresce sul disco.
- **I dati restano** anche chiudendo il browser, ricaricando la pagina o
  riavviando MIMOSA (finché c'è il file `mimosa.db`).
- **Export CSV/JSON completo**, generato dal server in streaming: scarica tutto
  lo storico della selezione, non più solo gli ultimi 50 campioni.
- **Raccolta anche a browser chiuso**: all'avvio il server si ricollega da solo
  all'ultima sottoscrizione (finché non premi "Disconnetti").
- **Migrazione automatica** dei campioni che la 1.4.0 teneva in `localStorage`:
  vengono importati al primo avvio.

## Altre novità

- **MQTT lato server**: il browser non si collega più al broker, lo fa il
  server. Il campo broker usa **TCP 1883** di default; sono supportati anche
  `ssl://host:8883`, `ws://host:porta/percorso` e `wss://host:porta/percorso`.
- **Data e Ora con anno** nella tabella e nell'export.
- **Legenda GPS corretta**: 🟡 giallo = posizione da indirizzo di rete,
  🟢 verde = posizione da GPS a bordo.
- **Nuovo logo MIMOSA e header** come da mockup: logo grande al centro, altri
  loghi sotto centrati e più piccoli. Screenshot aggiornato.
- Barra di stato con **Archivio**: campioni totali e spazio occupato dal
  database.

## Da confermare

Nella mail del prof. la frase *"se non arrivano dati da 20 secondi…"* era
incompleta. Comportamento attuale: **dopo 20 secondi senza nuovi dati il pallino
viene rimosso dalla mappa**. Da confermare (alternative possibili: pallino
grigio oppure ultima posizione mantenuta).

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

Il browser si apre su `http://localhost:8080`. Seleziona **Osservatorio** e
**Sensore**, controlla il broker MQTT e premi **Connetti**.
Il database viene creato come `mimosa.db` nella cartella di avvio; si può
cambiare con `--db FILE`.

## Note per l'aggiornamento dalla 1.4.0

- Al primo avvio i vecchi campioni salvati dal browser vengono importati nel
  nuovo database.
- Il broker adesso viene contattato dal server: se la rete blocca la porta
  **1883**, usa `ssl://host:8883` oppure un URL `ws://`/`wss://`.
- Lo storico non dipende più dal browser: fai un backup di `mimosa.db` (a
  programma fermo) o esporta CSV/JSON.

## Checksums SHA-256

```text
6c050fda81f32a406ad8b374d6e6ffbef7f59a3ef8b790b6a94d445550d33876  mimosa-darwin-amd64
a7f45579fc8468cf1208d0e9ebf13dc7099dde2c5794552acf6515c7834cb922  mimosa-darwin-arm64
d48a67cf3dbdab8298f14f0b9bc6d8e5e999344fc7285135518f750a94794863  mimosa-linux-amd64
58ed8772f7f6da11d83cb9556cd0eb8a2a0cc592c3e1f9940db11225ded06952  mimosa-windows-amd64.exe
```
