# MIMOSA v1.4.0 — Dati MQTT e mappa GPS

Release del 10 novembre 2026.

## Correzioni

- **Dashboard vuota con topic multi-livello** — i messaggi pubblicati su topic
  con più livelli e/o con `/` iniziale (es.
  `/uniurb/aserpieri/test/marconi0/esp32-d0ac78/data`) ora vengono associati
  correttamente a osservatorio e sensore. Prima la dashboard mostrava
  **Connesso** ma `Dati ricevuti: 0`.
- **Pressione** — l'unità viene riconosciuta automaticamente (hPa ~1000 o
  Pa ~100000): un valore come `1004.38` non viene più mostrato come `10.0` in
  card, tabella, grafico ed export.
- **Storico** — i record salvati prima del fix (con osservatorio/sensore
  sbagliati) vengono ignorati: nuova chiave di storage `mimosa_data_v2`.

## Novità

- **Mappa basata su `virtual_gps`** — la posizione proiettata è quella del ramo
  `virtual_gps` (con fallback sul vecchio ramo `gps`):
  - `GPS_HW_POS: 1` → 🟡 pallino giallo (GPS hardware)
  - `GPS_HW_POS: 0` → 🟢 pallino verde (posizione di rete)
  - `GPS_HW_POS: null` / assente → nessun pallino
  - dopo **20 secondi** senza nuovi dati il pallino viene rimosso (posizione
    non più aggiornata)
- **Mappa più fluida** — si aggiorna solo quando cambiano le coordinate (o il
  colore del pallino): niente più ricentraggio a ogni campione.
- **Card GPS, tabella ed export** — usano la nuova posizione, con sorgente e
  accuratezza (`± 100 km` per la posizione di rete, metri per il GPS).
- **Nuovo logo Marconi** e acronimo corretto:
  **Misuriamo Insieme l'atMOSferA**.
- **Export CSV/JSON** — aggiunti `virtual_gps`, `gps_network`, `gps_source`,
  `gps_accuracy_m`, `gps_hw_pos`.

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
chmod +x mimosa-linux-amd64      # oppure mimosa-darwin-*
./mimosa-linux-amd64
```

**Windows**

Doppio click su `mimosa-windows-amd64.exe`; se compare SmartScreen:
*Ulteriori informazioni* → *Esegui comunque*.

Il browser si apre su `http://localhost:8080`. Seleziona **Osservatorio** e
**Sensore**, controlla il broker MQTT (predefinito `broker.hivemq.com`) e premi
**Connetti**.

## Requisiti

- Connessione a internet: grafici, mappa e MQTT sono caricati da CDN e broker
  pubblici.
- Broker MQTT raggiungibile in **WebSocket** (HiveMQ: porta `8000`, oppure
  `8884` con TLS).

## Checksums SHA-256

```text
9008a1d6b4a8968701f0d92b46214b1ebb526b029815f321ea94f1baf6ef5dba  mimosa-darwin-amd64
1e4dd0d633852f47b9c31fe727bc10cb2531ab41a11e6ade0eddc42b32ff6c92  mimosa-darwin-arm64
61c8ba664a95a04516709c677932f061aeb283bf8bead09118e594bab00405ed  mimosa-linux-amd64
647e8a99379db4f4306d3485291558c039d8168f11d656949fe4ab4ba38c5829  mimosa-windows-amd64.exe
```
