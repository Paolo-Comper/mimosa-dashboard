<div align="center">
  <img src="res/marconi.png" alt="MIMOSA" height="80">
  <br><br>
  <h1>MIMOSA</h1>
  <p><strong>Monitoraggio Inquinamento MObile Sistema Aria</strong></p>
  <p>
    Dashboard web per la qualità dell'aria in tempo reale<br>
    Riceve dati via MQTT da sensori MIMOSA su Raspberry Pi
  </p>
  <p>
    <img src="https://img.shields.io/badge/Go-1.26+-00ADD8?style=for-the-badge&logo=go&logoColor=white" alt="Go">
    <img src="https://img.shields.io/badge/Linux-FCC624?style=for-the-badge&logo=linux&logoColor=black" alt="Linux">
    <img src="https://img.shields.io/badge/Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white" alt="Windows">
    <img src="https://img.shields.io/badge/macOS-000000?style=for-the-badge&logo=apple&logoColor=white" alt="macOS">
    <img src="https://img.shields.io/badge/MQTT-660066?style=for-the-badge&logo=mqtt&logoColor=white" alt="MQTT">
    <img src="https://img.shields.io/badge/license-MIT-green?style=for-the-badge" alt="License">
  </p>
</div>

---

## ✨ Caratteristiche

- **MQTT nativo** — si connette al broker in tempo reale
- **Grafici live** — PM₁, PM₂.₅, PM₁₀, temperatura, umidità, pressione
- **Mappa GPS** — ultima posizione rilevata, tracking in tempo reale
- **Tabella dati** — cronologia con filtro per client
- **Esportazione** — CSV / JSON con un click
- **Portatile** — singolo eseguibile, nessuna installazione
- **Cross-platform** — Linux, Windows, macOS

---

## 🚀 Download rapido

Scarica l'ultima versione dalle [release](https://github.com/Paolo-Comper/mimosa-dashboard/releases):

| Piattaforma | File |
|-------------|------|
| 🐧 Linux x86_64 | `mimosa-linux-amd64` |
| 🪟 Windows x86_64 | `mimosa-windows-amd64.exe` |
| 🍏 macOS Intel | `mimosa-darwin-amd64` |
| 🍏 macOS ARM (M1/M2) | `mimosa-darwin-arm64` |

L'eseguibile contiene **tutto** (HTML, JS, CSS, immagini). Zero dipendenze.

---

## 🔧 Compilazione

Clona e compila con Go:

```bash
git clone https://github.com/Paolo-Comper/mimosa-dashboard.git
cd mimosa-dashboard
go build -o mimosa .
```

Risultato: un singolo file `mimosa` (o `mimosa.exe` su Windows).

---

## 📖 Utilizzo

### Avvio rapido

```bash
./mimosa
```

Apri `http://localhost:8080`, seleziona un client RPI e clicca **Connetti**.

### Dati di test

```bash
./mimosa --test                     # 10 messaggi
./mimosa --test rpi-zero-2 50       # nome + conteggio custom
```

Il server HTTP resta attivo durante i test.

### Porta personalizzata

```bash
PORT=9090 ./mimosa
```

### Modalità sviluppo

Legge HTML/CSS/JS dal disco (modifichi e ricarichi il browser senza ricompilare):

```bash
./mimosa --dev
```

### Aiuto

```bash
./mimosa --help
```

---

## 🪟 Windows

### Doppio click

Scarica `mimosa-windows-amd64.exe`, rinomina in `mimosa.exe` ed esegui.

### PowerShell

```powershell
.\mimosa.exe
```

### Compilare da sorgente

```powershell
cd C:\percorso\mimosa
go build -o mimosa.exe .
.\mimosa.exe
```

> Il firewall potrebbe chiedere permesso per la rete. Accetta.

---

## 📡 Formato dati MQTT

Topic: `mimosa/<nome-client>/data`

```json
{
  "timestamp": 1771815991.22558,
  "pms":       { "pm1": 4, "pm25": 10, "pm10": 15, "temperature": 9.1, "humidity": 63.3 },
  "dht22":     { "temperature": 4.9, "humidity": 81.1 },
  "bme280":    { "temperature": 4.3, "humidity": 74.2, "pressure": 999.57 },
  "gps":       { "lat": 43.72386, "lon": 12.63765, "alt": 472.0, "sats": 7, "valid": true }
}
```

### Collegare un RPI

1. L'RPI pubblica su `mimosa/<nome>/data`
2. Apri la dashboard, seleziona `<nome>`, clicca **Connetti**

Doppio click sul menu client per inserire un nome custom.

---

## 💾 Esportazione dati

| Formato | Uso |
|---------|-----|
| **CSV** | Excel, LibreOffice, analisi |
| **JSON** | Elaborazioni programmatiche |

I dati sono salvati automaticamente nel **localStorage** del browser.

---

## 📁 Struttura

```
mimosa-dashboard/
├── main.go              ← server Go (embed di tutto)
├── go.mod / go.sum      ← dipendenze
├── index.html           ← interfaccia dashboard
├── styles.css           ← tema scuro
├── src/
│   ├── state.js         ← costanti, stato globale, DOM
│   ├── storage.js       ← salvataggio localStorage
│   ├── charts.js        ← grafici Chart.js
│   ├── mqtt.js          ← client MQTT
│   ├── export.js        ← esportazione CSV/JSON
│   ├── dashboard.js     ← rendering interfaccia
│   ├── main.js          ← init, event listener
│   └── mappa.js         ← mappa GPS
├── res/
│   ├── marconi.png      ← logo ITT Marconi
│   └── urbino.png       ← logo Osservatorio Urbino
└── README.md
```

---

## 📄 Licenza

Progetto **MIMOSA** — ITT Marconi Rovereto & Osservatorio di Urbino
