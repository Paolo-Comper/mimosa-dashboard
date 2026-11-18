package main

import (
	"bufio"
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestParseTopicMQTT(t *testing.T) {
	casi := []struct {
		topic, osservatorio, sensore string
		ok                           bool
	}{
		{"/uniurb/aserpieri/test/marconi0/esp32-d0ac78/data", "/uniurb/aserpieri/test/marconi0", "esp32-d0ac78", true},
		{"mimosa/rpi-zero-1/data", "mimosa", "rpi-zero-1", true},
		{"mimosa/+/data", "mimosa", "+", true},
		{"mimosa/rpi-zero-1/data/", "mimosa", "rpi-zero-1", true},
		{"foo/bar", "foo", "bar", true},
		{"senza-livelli", "", "", false},
	}
	for _, c := range casi {
		oss, sens, ok := parseTopicMQTT(c.topic)
		if ok != c.ok || oss != c.osservatorio || sens != c.sensore {
			t.Errorf("parseTopicMQTT(%q) = (%q, %q, %v), atteso (%q, %q, %v)",
				c.topic, oss, sens, ok, c.osservatorio, c.sensore, c.ok)
		}
	}
}

func TestNormalizzaBroker(t *testing.T) {
	casi := []struct {
		in, out string
		err     bool
	}{
		{"broker.hivemq.com", "tcp://broker.hivemq.com:1883", false},
		{"127.0.0.1:1884", "tcp://127.0.0.1:1884", false},
		{"ssl://example.org:8883", "ssl://example.org:8883", false},
		{"mqtts://example.org:8883", "ssl://example.org:8883", false},
		{"mqtt://example.org", "tcp://example.org", false},
		{"ws://example.org:9001/mqtt", "ws://example.org:9001/mqtt", false},
		{"wss://example.org:9001/mqtt", "wss://example.org:9001/mqtt", false},
		{"", "", true},
		{"host/percorso", "", true},
	}
	for _, c := range casi {
		out, err := normalizzaBroker(c.in)
		if (err != nil) != c.err || out != c.out {
			t.Errorf("normalizzaBroker(%q) = (%q, %v), atteso (%q, err=%v)", c.in, out, err, c.out, c.err)
		}
	}
}

const payloadNuovoTest = `{
  "timestamp": 1794094757,
  "topic": "/uniurb/aserpieri/test/marconi0/esp32-d0ac78/data",
  "client_id": "esp32-d0ac78",
  "pms": {"pm1": 4, "pm25": 6, "pm10": 7, "temperature": 27.2, "humidity": 49.2},
  "dht22": {"humidity": 53.100004, "temperature": 26.9},
  "bme280": {"humidity": 44.432564, "pressure": 1004.4084, "temperature": 25.212984},
  "virtual": {"humidity": 53.1, "pressure": 1004.41, "temperature": 26.9},
  "gps": {"lat": null, "lon": null, "alt": null, "sats": 0, "valid": false},
  "gps_network": {"lat": 45.4642, "lon": 9.18998, "alt": 200.0, "source": "ip", "accuracy_m": 100000.0},
  "virtual_gps": {"lat": 45.4642, "lon": 9.18998, "alt": 200.0, "valid": true,
    "source": "network", "sats": null, "GPS_HW_POS": 1, "accuracy_m": 100000.0,
    "datetime_utc": "2026-11-07T23:39:17Z", "timestamp": 1794094757}
}`

func TestPosizioneGPSExport(t *testing.T) {
	var p expPayload
	if err := json.Unmarshal([]byte(payloadNuovoTest), &p); err != nil {
		t.Fatal(err)
	}
	pos := posizioneGPSExport(p)
	if !pos.valid {
		t.Fatal("virtual_gps valido atteso")
	}
	if pos.lat == nil || *pos.lat != 45.4642 || pos.lon == nil || *pos.lon != 9.18998 {
		t.Fatalf("coordinate inattese: %+v", pos)
	}
	if pos.hwPos == nil || *pos.hwPos != 1 || pos.source != "network" {
		t.Fatalf("sorgente GPS inattesa: %+v", pos)
	}

	// GPS_HW_POS null: posizione valida ma nessun colore/pallino
	p.VirtualGPS.GPSHWPos = nil
	if pos = posizioneGPSExport(p); !pos.valid || pos.hwPos != nil {
		t.Fatalf("GPS_HW_POS null: atteso valid senza hwPos, ottenuto %+v", pos)
	}

	// fallback sul vecchio ramo gps
	var legacy expPayload
	if err := json.Unmarshal([]byte(`{"gps":{"lat":43.7,"lon":12.6,"alt":400,"sats":6,"valid":true}}`), &legacy); err != nil {
		t.Fatal(err)
	}
	pos = posizioneGPSExport(legacy)
	if !pos.valid || pos.hwPos == nil || *pos.hwPos != 0 || pos.source != "gps" {
		t.Fatalf("fallback gps inatteso: %+v", pos)
	}
}

func TestRigaCSV(t *testing.T) {
	campione := Campione{
		ID:           1,
		Timestamp:    1794094757,
		Topic:        "/uniurb/aserpieri/test/marconi0/esp32-d0ac78/data",
		Osservatorio: "/uniurb/aserpieri/test/marconi0",
		Sensore:      "esp32-d0ac78",
		Payload:      json.RawMessage(payloadNuovoTest),
	}
	riga, err := rigaCSV(campione)
	if err != nil {
		t.Fatal(err)
	}
	if len(riga) != len(intestazioneCSV) {
		t.Fatalf("riga con %d colonne, intestazione con %d", len(riga), len(intestazioneCSV))
	}
	attesi := map[int]string{
		0:  "1794094757",
		2:  "/uniurb/aserpieri/test/marconi0",
		3:  "esp32-d0ac78",
		4:  "4",
		5:  "6",
		15: "1004.4", // pressione BME in hPa
		17: "45.4642",
		18: "9.18998",
		21: "true",
		22: "network",
		23: "100000",
		24: "1",
	}
	for i, atteso := range attesi {
		if riga[i] != atteso {
			t.Errorf("colonna %d = %q, atteso %q", i, riga[i], atteso)
		}
	}
	if !strings.Contains(riga[1], "/2026") {
		t.Errorf("data_ora senza anno: %q", riga[1])
	}

	rec, err := recordJSON(campione)
	if err != nil {
		t.Fatal(err)
	}
	var obj map[string]any
	if err := json.Unmarshal(rec, &obj); err != nil {
		t.Fatal(err)
	}
	if obj["osservatorio"] != "/uniurb/aserpieri/test/marconi0" || obj["virtual_gps"] == nil {
		t.Fatalf("export JSON inatteso: %s", string(rec))
	}
}

func TestStore(t *testing.T) {
	path := filepath.Join(t.TempDir(), "test.db")
	store, err := apriStore(path)
	if err != nil {
		t.Fatal(err)
	}
	defer store.chiudi()

	payload := json.RawMessage(payloadNuovoTest)
	campioni := []Campione{
		{Timestamp: 1794094757, Topic: "mimosa/s1/data", Osservatorio: "mimosa", Sensore: "s1", Payload: payload},
		{Timestamp: 1794094758, Topic: "mimosa/s1/data", Osservatorio: "mimosa", Sensore: "s1", Payload: payload},
		{Timestamp: 1794094759, Topic: "altro/s2/data", Osservatorio: "altro", Sensore: "s2", Payload: payload},
	}
	for _, c := range campioni {
		if _, err := store.inserisciCampione(c); err != nil {
			t.Fatal(err)
		}
	}

	stats, err := store.statistiche("", "")
	if err != nil {
		t.Fatal(err)
	}
	if stats.Totale != 3 || stats.Esportati != 0 {
		t.Fatalf("statistiche globali inattese: %+v", stats)
	}
	stats, err = store.statistiche("mimosa", "s1")
	if err != nil || stats.Totale != 2 {
		t.Fatalf("statistiche filtrate inattese: %+v, %v", stats, err)
	}

	ultimi, err := store.ultimiCampioni("mimosa", "s1", 10)
	if err != nil || len(ultimi) != 2 || ultimi[0].Timestamp != 1794094757 {
		t.Fatalf("ultimi campioni inattesi: %+v, %v", ultimi, err)
	}

	maxID, err := store.massimoID()
	if err != nil {
		t.Fatal(err)
	}
	if err := store.segnaEsportati("mimosa", "s1", maxID); err != nil {
		t.Fatal(err)
	}
	stats, _ = store.statistiche("mimosa", "s1")
	if stats.Esportati != 2 {
		t.Fatalf("esportati attesi 2, trovati %d", stats.Esportati)
	}

	conta := 0
	if err := store.iteraPerExport("mimosa", "s1", maxID, func(c Campione) error {
		conta++
		return nil
	}); err != nil || conta != 2 {
		t.Fatalf("iteraPerExport: conta=%d err=%v", conta, err)
	}

	if err := store.svuotaEsportati(); err != nil {
		t.Fatal(err)
	}
	if stats, _ = store.statistiche("", ""); stats.Totale != 1 {
		t.Fatalf("dopo svuotaEsportati attesi 1, trovati %d", stats.Totale)
	}

	if n, err := store.importaCampioni([]Campione{
		{Timestamp: 1794094800, Topic: "mimosa/s1/data", Osservatorio: "mimosa", Sensore: "s1", Payload: payload},
	}); err != nil || n != 1 {
		t.Fatalf("importaCampioni: n=%d err=%v", n, err)
	}
	if err := store.svuotaCampioni(); err != nil {
		t.Fatal(err)
	}
	if stats, _ = store.statistiche("", ""); stats.Totale != 0 {
		t.Fatalf("dopo svuotaCampioni attesi 0, trovati %d", stats.Totale)
	}

	if err := store.salvaImpostazione("broker", "broker.hivemq.com"); err != nil {
		t.Fatal(err)
	}
	if v, ok := store.leggiImpostazione("broker"); !ok || v != "broker.hivemq.com" {
		t.Fatalf("impostazione non riletta: %q %v", v, ok)
	}
}

func TestNormalizzaPressione(t *testing.T) {
	casi := map[float64]float64{1004.38: 1004.38, 100438: 1004.38, 0: 0}
	for in, atteso := range casi {
		if out := normalizzaPressioneVal(in); math.Abs(out-atteso) > 1e-9 {
			t.Errorf("normalizzaPressioneVal(%v) = %v, atteso %v", in, out, atteso)
		}
	}
}

// leggiEventoSSE legge un blocco SSE (righe fino alla riga vuota).
func leggiEventoSSE(sc *bufio.Scanner) string {
	var righe []string
	for sc.Scan() {
		riga := sc.Text()
		if riga == "" {
			if len(righe) > 0 {
				return strings.Join(righe, "\n")
			}
			continue
		}
		righe = append(righe, riga)
	}
	return strings.Join(righe, "\n")
}

func TestSSEEventiNominati(t *testing.T) {
	hub := nuovoHub(func() any { return eventoStato(StatoMQTT{Connesso: false}) })
	srv := httptest.NewServer(http.HandlerFunc(hub.ServeHTTP))
	defer srv.Close()

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if ct := resp.Header.Get("Content-Type"); !strings.HasPrefix(ct, "text/event-stream") {
		t.Fatalf("Content-Type inatteso: %q", ct)
	}

	sc := bufio.NewScanner(resp.Body)
	trovatoStatus := false
	for i := 0; i < 10; i++ {
		ev := leggiEventoSSE(sc)
		if strings.Contains(ev, "event: status") {
			trovatoStatus = true
			break
		}
	}
	if !trovatoStatus {
		t.Fatal("evento SSE iniziale 'status' mancante")
	}

	hub.Broadcast("sample", map[string]any{
		"type":   "sample",
		"sample": map[string]any{"id": 7, "topic": "mimosa/s1/data"},
	})
	trovatoSample := false
	for i := 0; i < 10; i++ {
		ev := leggiEventoSSE(sc)
		if strings.Contains(ev, "event: sample") {
			trovatoSample = true
			if !strings.Contains(ev, `"id":7`) {
				t.Fatalf("evento sample senza id: %q", ev)
			}
			break
		}
	}
	if !trovatoSample {
		t.Fatal("evento SSE 'sample' mancante (il client addEventListener non lo riceverebbe)")
	}
}

func TestAPIStatusVersioneECSamplesReceivedAt(t *testing.T) {
	store, err := apriStore(filepath.Join(t.TempDir(), "api.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.chiudi()

	campione := Campione{
		Timestamp:    1,
		Topic:        "mimosa/s1/data",
		Osservatorio: "mimosa",
		Sensore:      "s1",
		Payload:      json.RawMessage(`{"timestamp":1}`),
	}
	if _, err := store.inserisciCampione(campione); err != nil {
		t.Fatal(err)
	}
	hub := nuovoHub(nil)
	gestore := nuovoGestoreMQTT(store, hub)
	api := &API{store: store, mqtt: gestore, hub: hub}

	rec := httptest.NewRecorder()
	api.handleStatus(rec, httptest.NewRequest(http.MethodGet, "/api/status", nil))
	var stato struct {
		Versione string `json:"versione"`
		Stats    Statistiche
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &stato); err != nil {
		t.Fatalf("status non JSON: %v (%s)", err, rec.Body.String())
	}
	if stato.Versione != versione {
		t.Fatalf("versione status = %q, attesa %q", stato.Versione, versione)
	}
	if stato.Stats.Totale != 1 {
		t.Fatalf("totale status = %d, atteso 1", stato.Stats.Totale)
	}

	rec = httptest.NewRecorder()
	api.handleSamples(rec, httptest.NewRequest(http.MethodGet, "/api/samples?limit=5", nil))
	var campioni []campioneJSON
	if err := json.Unmarshal(rec.Body.Bytes(), &campioni); err != nil {
		t.Fatalf("samples non JSON: %v (%s)", err, rec.Body.String())
	}
	if len(campioni) != 1 {
		t.Fatalf("campioni = %d, atteso 1", len(campioni))
	}
	if campioni[0].ReceivedAt <= 0 {
		t.Fatalf("received_at non valorizzato: %+v", campioni[0])
	}
}
