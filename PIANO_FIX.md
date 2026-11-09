# Piano di fix — MIMOSA dashboard

Riferimento: email del prof. Andrea Cesarini dell'8/11/2026
(`Un piccolo problema: interfaccia LINUX non funzionante! :)))`), con allegati
lo screenshot della dashboard e il nuovo logo Marconi.

Stato: **implementato in locale** (solo commit locali, nessun push). Riepilogo:

- sostituito il logo in `res/LogoMarconi.png` con quello allegato alla mail;
- fix del parsing del topic (slash iniziale e più livelli);
- pressione normalizzata hPa/Pa in card, grafici, tabella ed export;
- mappa basata su `virtual_gps`, colore `GPS_HW_POS` (giallo/verde/nessuno) e
  rimozione del pallino dopo 20 s senza dati;
- acronimo **"Misuriamo Insieme l'atMOSferA"**;
- README aggiornato e test della logica in `tests/logica.test.js`.

Restano da fare solo la verifica end-to-end con broker reale e la nuova
release (build + upload dei binari), da fare quando si decide di pubblicare.

---

## 1. Cosa chiede il professore

1. La dashboard, con il JSON concordato, **non mostra i dati** (broker e topic
   sono corretti).
2. Sulla mappa la posizione deve essere presa da **`virtual_gps`**:
   - `GPS_HW_POS: 1` → pallino **GIALLO**
   - `GPS_HW_POS: 0` → pallino **VERDE**
   - `GPS_HW_POS: null` → **nessun pallino**
   - *"se non arrivano dati da 20 secondi …"* → frase troncata nella mail
     (manca la conclusione, da chiarire).
3. Caricare sull'interfaccia il nuovo logo Marconi allegato. **Fatto.**
4. Feedback da Urbino:
   - l'acronimo MIMOSA deve essere **"Misuriamo Insieme l'atMOSferA"**
     (oggi è "Monitoraggio Inquinamento MObile Sistema Aria");
   - la mappa si rigenera a ogni dato: aggiornarla solo se cambiano le
     coordinate.

Dati reali dal broker (topic `/uniurb/aserpieri/test/marconi0/esp32-d0ac78/data`):

```json
{"timestamp":1794094530,"pms":{"pm1":3,"pm25":6,"pm10":7,"temperature":27.2,"humidity":49.1},"dht22":{"temperature":26.800002,"humidity":53.100004},"bme280":{"temperature":25.075438,"humidity":44.775144,"pressure":1004.38104},"virtual":{"temperature":26.8,"humidity":53.1,"pressure":1004.38},"gps":{"lat":null,"lon":null,"alt":null,"sats":0,"valid":false},"client_id":"esp32-d0ac78"}
```

Nuovo JSON (quello da supportare), con `virtual_gps` e `gps_network`:

```json
{"timestamp":1794094757,"virtual_gps":{"lat":45.4642,"lon":9.18998,"alt":200.0,"valid":true,"source":"network","sats":null,"GPS_HW_POS":1,"accuracy_m":100000.0,"time_source":"ntp","datetime_utc":"2026-11-07T23:39:17Z","timestamp":1794094757},"gps_network":{"lat":45.4642,"lon":9.18998,"alt":200.0,"source":"ip","aid_sent":false,"accuracy_m":100000.0},"gps":{"lat":null,"lon":null,"alt":null,"sats":0,"valid":false},"pms":{"pm1":4,"pm25":6,"pm10":7,"temperature":27.2,"humidity":49.2},"dht22":{"temperature":26.9,"humidity":53.100004},"bme280":{"temperature":25.212984,"humidity":44.432564,"pressure":1004.4084},"virtual":{"temperature":26.9,"humidity":53.1,"pressure":1004.41},"topic":"/uniurb/aserpieri/test/marconi0/esp32-d0ac78/data","client_id":"esp32-d0ac78"}
```

---

## 2. Diagnosi: perché non funziona (causa principale)

**Non è un problema di Linux.** Dallo screenshot si vede che la connessione è
attiva (`Connesso`), il topic mostrato è identico a quello del `mosquitto_sub`,
ma `Dati ricevuti: 0` e tutte le card sono vuote.

Il problema è il **parsing del topic** in `src/mqtt.js` (`processMessage`):

```js
var parti = topic.split('/');
var osservatorio = parti[0] || DEFAULT_OSSERVATORIO;
var sensore = parti[1] || 'sconosciuto';
```

Con un topic che inizia con `/`, `split('/')` produce:

```
['', 'uniurb', 'aserpieri', 'test', 'marconi0', 'esp32-d0ac78', 'data']
```

Quindi:

| Campo        | Valore atteso                        | Valore salvato |
| ------------ | ------------------------------------ | -------------- |
| osservatorio | `/uniurb/aserpieri/test/marconi0`    | `mimosa` (fallback) |
| sensore      | `esp32-d0ac78`                       | `uniurb` |

Poi `src/state.js` → `datiFiltrati()` filtra con
`d.osservatorio === currentOsservatorio` e non trova niente: la dashboard
mostra "Nessun dato ricevuto" e `Dati ricevuti: 0`.

Nota importante: il record viene **salvato in localStorage prima del filtro**
(`saveData()` in `processMessage`), quindi nel browser del professore ci sono
già record etichettati male (osservatorio `mimosa`, sensore `uniurb`). Dopo il
fix vanno eliminati o migrati, altrimenti ricompaiono scegliendo l'osservatorio
`mimosa`.

Il modello attuale presuppone esattamente `{osservatorio}/{sensore}/data`
(2 livelli + `data`), mentre il topic reale ha più livelli e lo slash iniziale.

---

## 3. Altri problemi trovati

1. **Unità della pressione sbagliata.**
   Il JSON reale manda `pressure: 1004.38` in **hPa** (come anche l'esempio nel
   README), ma il codice divide per 100 assumendo i Pa: la pressione verrebbe
   mostrata come `10.0 hPa` in card, tabella, grafico e CSV
   (`src/state.js` → `pressioneHpa`, `src/dashboard.js`, `src/export.js`).
   Anche la nota del README sulle unità è errata.

2. **I rami nuovi del JSON non esistono nel modello.**
   `virtual_gps` e `gps_network` vengono ignorati in `processMessage`; la mappa
   legge solo `gps`, che ora è sempre invalido → la mappa non funzionerebbe
   nemmeno dopo il fix del parsing.

3. **Mappa rigenerata a ogni campione** (feedback Urbino):
   `aggiornaMappa()` chiama `map.flyTo()` e `source.setData()` a ogni messaggio.

4. **`--test` non permette di riprodurre il topic del prof.**
   `main.go` rifiuta `/` in `--osservatorio` e `--sensore`, quindi per i test
   end-to-end va usato `mosquitto_pub` con il topic esatto.

5. **Distribuzione della release.**
   I binari in `dist/` sono ignorati da git (`.gitignore`) e il professore
   scarica dalla pagina **Releases**: il fix arriva solo ricompilando i binari
   e ricaricandoli. Inoltre il binario attuale del prof. resta quello vecchio
   finché non scarica la nuova release.

---

## 4. Piano di lavoro

### Fase 0 — Riproduzione (consigliata, prima di toccare il codice)

- Avviare `./mimosa --dev` (porta 8080).
- Pubblicare il JSON reale sul topic esatto:
  ```bash
  mosquitto_pub -h broker.hivemq.com \
    -t '/uniurb/aserpieri/test/marconi0/esp32-d0ac78/data' \
    -m '<JSON del punto 1>'
  ```
- Verificare il bug (0 dati), poi usare lo stesso comando per la verifica del
  fix.

### Fase 1 (P0) — Parsing del topic + migrazione storage

File: `src/mqtt.js`, `src/state.js`.

- Sostituire il parsing "primi due livelli" con un parsing **dal fondo**:
  ```js
  function parseTopic(topic) {
    var t = String(topic || '').replace(/\/data\/?$/, '');
    var i = t.lastIndexOf('/');
    if (i < 0) return { osservatorio: t, sensore: '' };
    return { osservatorio: t.slice(0, i), sensore: t.slice(i + 1) };
  }
  // '/uniurb/aserpieri/test/marconi0/esp32-d0ac78/data'
  // -> { osservatorio: '/uniurb/aserpieri/test/marconi0', sensore: 'esp32-d0ac78' }
  ```
  Così lo slash iniziale viene conservato e coincide con il valore del select.
- Salvare nel record anche `topic`, `client_id`, `virtual_gps`, `gps_network`.
- Aggiornare/cambiare chiave di storage (`STORAGE_KEY` → `mimosa_data_v2`) per
  buttare i record salvati male; in alternativa migrazione esplicita.
- **Criterio di accettazione:** con il topic del prof. `datiFiltrati()` non è
  vuoto, `Dati ricevuti` cresce, card e tabella si popolano. Il topic
  `mimosa/rpi-zero-1/data` continua a funzionare (regressione).

### Fase 2 (P0) — Pressione

File: `src/state.js`, `src/dashboard.js`, `src/charts.js`, `src/export.js`,
`README.md`.

- Helper unico:
  ```js
  function pressioneHpa(p) {
    if (p == null) return null;
    return p > 5000 ? p / 100 : p; // Pa -> hPa; hPa resta hPa
  }
  ```
- Usarlo in card, tabella, grafico e CSV.
- Aggiornare il README (unità hPa, con tolleranza ai Pa).
- **Criterio di accettazione:** con `1004.38` la pressure mostra ~`1004.4` e
  non `10.0`.

### Fase 3 (P1) — `virtual_gps` sulla mappa

File: `src/mqtt.js`, `src/state.js`, `src/mappa.js`, `src/dashboard.js`,
`src/export.js`.

- Normalizzare la posizione: usare `virtual_gps` se presente e valido, altrimenti
  fallback sul vecchio `gps` (retrocompatibilità).
- Colore del pallino deciso da `GPS_HW_POS`:
  ```js
  'circle-color': ['match', ['get', 'gps_hw_pos'], 1, '#f1c40f', 0, '#2ecc71', '#95a5a6']
  ```
- `GPS_HW_POS: null` (o coordinate/`valid` mancanti) → nessuna feature, quindi
  nessun pallino.
- Aggiornare card GPS, colonne Lat/Lon della tabella, CSV/JSON export
  (aggiungere `source`, `accuracy_m`, `GPS_HW_POS`).
- **20 secondi**: usare l'istante di ricezione lato browser (`Date.now()`), non
  il timestamp del dispositivo (evita problemi di orologio). Un `setInterval`
  da 1 s toglie il pallino quando non arrivano dati da più di 20 s.
  *Comportamento esatto da confermare col prof. (frase troncata).*

### Fase 4 (P1) — Logo Marconi

**Fatto in questo commit**: `res/LogoMarconi.png` sostituito con il badge
circolare 512×512 allegato alla mail (stesso nome file, quindi nessuna modifica
a `//go:embed` né a `index.html`). Da valutare solo un ritocco di
`--logo-height` / `--logo-max-width` in `styles.css` per il formato quadrato.

### Fase 5 (P1) — Acronimo

File: `index.html`, `main.go`, `README.md`.

- Sostituire "Monitoraggio Inquinamento MObile Sistema Aria" con
  **"Misuriamo Insieme l'atMOSferA"** (sottotitolo, help da terminale, README).

### Fase 6 (P2) — Mappa aggiornata solo se cambiano le coordinate

File: `src/mappa.js`.

- Confrontare le coordinate con l'ultima feature: `setData()` e `flyTo()` solo
  se sono cambiate (oltre una soglia minima, es. `1e-6`) o al primo fix.
- Negli altri casi aggiornare solo i dati del popup, senza ricentrare.
- Mantenere il re-add dei layer su `style.load` (cambio tema).

### Fase 7 (P2) — Documentazione, test e release

- README §6: documentare `virtual_gps`, `gps_network`, `GPS_HW_POS`, unità
  pressione.
- README §9: aggiungere caso "Connesso ma Dati ricevuti 0" (topic con più
  livelli / slash iniziale).
- Cache-busting: portare `?v=3` → `?v=4` in `index.html`.
- Test manuali (matrice sotto).
- Ricompilare e ripubblicare i binari (senza push finché non deciso):
  ```bash
  go build -o mimosa .
  CGO_ENABLED=0 GOOS=linux   GOARCH=amd64 go build -trimpath -ldflags "-s -w" -o dist/mimosa-linux-amd64 .
  CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "-s -w" -o dist/mimosa-windows-amd64.exe .
  CGO_ENABLED=0 GOOS=darwin  GOARCH=amd64 go build -trimpath -ldflags "-s -w" -o dist/mimosa-darwin-amd64 .
  CGO_ENABLED=0 GOOS=darwin  GOARCH=arm64 go build -trimpath -ldflags "-s -w" -o dist/mimosa-darwin-arm64 .
  ```
- Tag nuova versione (es. `v1.4.0`; nota: il tag `1.3.0` esistente è senza `v`)
  e nuova Release con i 4 file.

---

## 5. Matrice di test

| # | Scenario | Esito atteso |
|---|----------|--------------|
| 1 | Topic `/uniurb/.../esp32-d0ac78/data` + JSON vecchio (senza `virtual_gps`) | Dati > 0; pressione ~1004.4; nessun pallino (gps invalido) |
| 2 | Stesso topic + JSON nuovo, `GPS_HW_POS: 1` | Pallino GIALLO, coordinate 45.4642 / 9.18998 |
| 3 | `GPS_HW_POS: 0` | Pallino VERDE |
| 4 | `GPS_HW_POS: null` | Nessun pallino |
| 5 | Stop pubblicazione > 20 s | Pallino rimosso (da confermare) |
| 6 | Topic classico `mimosa/rpi-zero-1/data` | Funziona come prima (regressione) |
| 7 | Sensore `+` (tutti) | Filtro corretto per sensore |
| 8 | Cambio tema | Mappa e grafici coerenti |
| 9 | Reload pagina | Storico persistito (nuova chiave storage) |
| 10 | Export CSV/JSON | Campi nuovi presenti, pressione corretta |
| 11 | `./mimosa --test --sensore rpi-zero-1` | Dati di test visualizzati |

---

## 6. Punti da chiarire col professore

1. **Frase troncata**: "se non arrivano dati da 20 secondi…" — cosa deve
   succedere? Ipotesi di default: il pallino scompare (e la card GPS torna a
   `—`). In alternativa: pallino grigio / ultima posizione mantenuta.
2. **Unità pressione**: il JSON concordato manda hPa (`1004.38`), ma codice e
   README parlavano di Pa. Confermare hPa come unità ufficiale (l'helper
   gestisce comunque entrambe).
3. **Slash iniziale del topic**: `/uniurb/...` è voluto o si può pubblicare
   come `uniurb/...`? Il fix supporta entrambi, ma un topic senza slash
   iniziale è più convenzionale.
4. **Quale binario ha usato?** Deve riscaricare la nuova Release per vedere le
   modifiche.

---

## 7. Stima

- Fase 1–2 (P0): ~45 min
- Fase 3 (mappa/GPS): ~1–1,5 h
- Fase 5–6 (acronimo, ottimizzazione mappa): ~30 min
- Fase 7 (README, test, build, release): ~45 min
- Totale: ~3–4 h, verifica inclusa.

