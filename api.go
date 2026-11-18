package main

import (
	"bufio"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

// ── SSE: eventi verso la dashboard ─────────────────────────────────────────

// eventoSSE è un evento con nome (Server-Sent Events): il browser lo riceve
// tramite addEventListener("<nome>"). Senza "event:" gli eventi finirebbero
// tutti sul generico "message" e i listener "sample"/"status" non scatterebbero.
type eventoSSE struct {
	nome string
	dati []byte
}

type Hub struct {
	mu            sync.Mutex
	clienti       map[chan eventoSSE]struct{}
	statoIniziale func() any
}

func nuovoHub(statoIniziale func() any) *Hub {
	return &Hub{
		clienti:       make(map[chan eventoSSE]struct{}),
		statoIniziale: statoIniziale,
	}
}

func (h *Hub) Broadcast(nome string, v any) {
	b, err := json.Marshal(v)
	if err != nil {
		log.Printf("SSE: marshal evento %q: %v", nome, err)
		return
	}
	evento := eventoSSE{nome: nome, dati: b}
	h.mu.Lock()
	defer h.mu.Unlock()
	for ch := range h.clienti {
		select {
		case ch <- evento:
		default: // client lento: salta l'evento, non bloccare il server
		}
	}
}

func (h *Hub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming non supportato", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	ch := make(chan eventoSSE, 64)
	h.mu.Lock()
	h.clienti[ch] = struct{}{}
	h.mu.Unlock()
	defer func() {
		h.mu.Lock()
		delete(h.clienti, ch)
		h.mu.Unlock()
	}()

	// Retry: se la connessione cade, il browser riprova da solo.
	if _, err := io.WriteString(w, "retry: 3000\n\n"); err != nil {
		return
	}
	flusher.Flush()

	if h.statoIniziale != nil {
		if b, err := json.Marshal(h.statoIniziale()); err == nil {
			if _, err := fmt.Fprintf(w, "event: status\ndata: %s\n\n", b); err != nil {
				return
			}
			flusher.Flush()
		}
	}

	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case ev := <-ch:
			if _, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", ev.nome, ev.dati); err != nil {
				return
			}
			flusher.Flush()
		case <-ticker.C:
			if _, err := io.WriteString(w, ": ping\n\n"); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}

// ── API HTTP ───────────────────────────────────────────────────────────────

type API struct {
	store *Store
	mqtt  *GestoreMQTT
	hub   *Hub
}

func registraAPI(mux *http.ServeMux, api *API) {
	mux.HandleFunc("GET /api/status", api.handleStatus)
	mux.HandleFunc("GET /api/stats", api.handleStats)
	mux.HandleFunc("GET /api/samples", api.handleSamples)
	mux.HandleFunc("GET /api/export", api.handleExport)
	mux.HandleFunc("GET /api/stream", api.hub.ServeHTTP)
	mux.HandleFunc("POST /api/mqtt/connect", api.handleConnect)
	mux.HandleFunc("POST /api/mqtt/disconnect", api.handleDisconnect)
	mux.HandleFunc("DELETE /api/samples", api.handleDeleteSamples)
	mux.HandleFunc("DELETE /api/exported", api.handleDeleteExported)
	mux.HandleFunc("POST /api/import", api.handleImport)
}

func scriviJSON(w http.ResponseWriter, codice int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(codice)
	_ = json.NewEncoder(w).Encode(v)
}

func erroreJSON(w http.ResponseWriter, codice int, err error) {
	scriviJSON(w, codice, map[string]string{"error": err.Error()})
}

func leggiBodyJSON(w http.ResponseWriter, r *http.Request, maxByte int64, dst any) error {
	r.Body = http.MaxBytesReader(w, r.Body, maxByte)
	return json.NewDecoder(r.Body).Decode(dst)
}

type rispostaStato struct {
	StatoMQTT
	Versione string      `json:"versione"`
	Stats    Statistiche `json:"stats"`
}

func (a *API) handleStatus(w http.ResponseWriter, r *http.Request) {
	stato := a.mqtt.Stato()
	stats, err := a.store.statistiche(stato.Osservatorio, stato.Sensore)
	if err != nil {
		erroreJSON(w, http.StatusInternalServerError, err)
		return
	}
	scriviJSON(w, http.StatusOK, rispostaStato{StatoMQTT: stato, Versione: versione, Stats: stats})
}

func (a *API) handleStats(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	stats, err := a.store.statistiche(q.Get("osservatorio"), q.Get("sensore"))
	if err != nil {
		erroreJSON(w, http.StatusInternalServerError, err)
		return
	}
	scriviJSON(w, http.StatusOK, stats)
}

type campioneJSON struct {
	ID           int64           `json:"id"`
	Topic        string          `json:"topic"`
	Osservatorio string          `json:"osservatorio"`
	Sensore      string          `json:"sensore"`
	Esportato    bool            `json:"exported"`
	ReceivedAt   int64           `json:"received_at"`
	Payload      json.RawMessage `json:"payload"`
}

func (a *API) handleSamples(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limite := 50
	if v, err := strconv.Atoi(q.Get("limit")); err == nil && v > 0 {
		limite = v
	}
	campioni, err := a.store.ultimiCampioni(q.Get("osservatorio"), q.Get("sensore"), limite)
	if err != nil {
		erroreJSON(w, http.StatusInternalServerError, err)
		return
	}
	out := make([]campioneJSON, 0, len(campioni))
	for _, c := range campioni {
		out = append(out, campioneJSON{
			ID:           c.ID,
			Topic:        c.Topic,
			Osservatorio: c.Osservatorio,
			Sensore:      c.Sensore,
			Esportato:    c.Esportato,
			ReceivedAt:   c.ReceivedAt,
			Payload:      c.Payload,
		})
	}
	scriviJSON(w, http.StatusOK, out)
}

func (a *API) handleConnect(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Broker string `json:"broker"`
		Topic  string `json:"topic"`
	}
	if err := leggiBodyJSON(w, r, 64<<10, &req); err != nil {
		erroreJSON(w, http.StatusBadRequest, err)
		return
	}
	stato, err := a.mqtt.Connetti(req.Broker, req.Topic)
	if err != nil {
		erroreJSON(w, http.StatusBadGateway, err)
		return
	}
	scriviJSON(w, http.StatusOK, stato)
}

func (a *API) handleDisconnect(w http.ResponseWriter, r *http.Request) {
	scriviJSON(w, http.StatusOK, a.mqtt.Disconnetti())
}

func (a *API) handleDeleteSamples(w http.ResponseWriter, r *http.Request) {
	if err := a.store.svuotaCampioni(); err != nil {
		erroreJSON(w, http.StatusInternalServerError, err)
		return
	}
	a.hub.Broadcast("status", eventoStato(a.mqtt.Stato()))
	scriviJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *API) handleDeleteExported(w http.ResponseWriter, r *http.Request) {
	if err := a.store.svuotaEsportati(); err != nil {
		erroreJSON(w, http.StatusInternalServerError, err)
		return
	}
	a.hub.Broadcast("status", eventoStato(a.mqtt.Stato()))
	scriviJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *API) handleImport(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Records []json.RawMessage `json:"records"`
	}
	if err := leggiBodyJSON(w, r, 64<<20, &body); err != nil {
		erroreJSON(w, http.StatusBadRequest, err)
		return
	}
	var campioni []Campione
	for _, raw := range body.Records {
		var meta struct {
			Timestamp    *float64 `json:"timestamp"`
			Topic        string   `json:"topic"`
			Osservatorio string   `json:"osservatorio"`
			Sensore      string   `json:"sensore"`
			ClientID     string   `json:"client_id"`
		}
		if err := json.Unmarshal(raw, &meta); err != nil || meta.Timestamp == nil {
			continue
		}
		osservatorio, sensore := meta.Osservatorio, meta.Sensore
		topic := meta.Topic
		if osservatorio == "" || sensore == "" {
			if o, s, ok := parseTopicMQTT(topic); ok {
				if osservatorio == "" {
					osservatorio = o
				}
				if sensore == "" {
					sensore = s
				}
			}
		}
		if osservatorio == "" || sensore == "" {
			continue
		}
		if topic == "" {
			topic = osservatorio + "/" + sensore + "/data"
		}
		campioni = append(campioni, Campione{
			Timestamp:    *meta.Timestamp,
			Topic:        topic,
			Osservatorio: osservatorio,
			Sensore:      sensore,
			ClientID:     meta.ClientID,
			Payload:      raw,
		})
	}
	n, err := a.store.importaCampioni(campioni)
	if err != nil {
		erroreJSON(w, http.StatusInternalServerError, err)
		return
	}
	scriviJSON(w, http.StatusOK, map[string]int{"inseriti": n})
}

// ── Export CSV/JSON in streaming ───────────────────────────────────────────

func (a *API) handleExport(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	osservatorio := q.Get("osservatorio")
	sensore := q.Get("sensore")
	formato := strings.ToLower(q.Get("format"))
	if formato == "" {
		formato = "csv"
	}
	if formato != "csv" && formato != "json" {
		erroreJSON(w, http.StatusBadRequest, fmt.Errorf("formato non supportato: %s", formato))
		return
	}
	maxID, err := a.store.massimoID()
	if err != nil {
		erroreJSON(w, http.StatusInternalServerError, err)
		return
	}
	nome := nomeFileExport(osservatorio, sensore, formato)

	switch formato {
	case "csv":
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", `attachment; filename="`+nome+`"`)
		cw := csv.NewWriter(w)
		if err := cw.Write(intestazioneCSV); err != nil {
			log.Printf("export CSV: %v", err)
			return
		}
		err = a.store.iteraPerExport(osservatorio, sensore, maxID, func(c Campione) error {
			riga, err := rigaCSV(c)
			if err != nil {
				return nil // payload non valido: salta la riga
			}
			return cw.Write(riga)
		})
		cw.Flush()
		if err == nil {
			err = cw.Error()
		}
		if err != nil {
			log.Printf("export CSV: %v", err)
			return
		}
		if err := a.store.segnaEsportati(osservatorio, sensore, maxID); err != nil {
			log.Printf("export CSV: marcatura esportati: %v", err)
		}
	case "json":
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Content-Disposition", `attachment; filename="`+nome+`"`)
		bw := bufio.NewWriter(w)
		if _, err := bw.WriteString("["); err != nil {
			return
		}
		primo := true
		err = a.store.iteraPerExport(osservatorio, sensore, maxID, func(c Campione) error {
			rec, err := recordJSON(c)
			if err != nil {
				return nil
			}
			if !primo {
				if _, err := bw.WriteString(","); err != nil {
					return err
				}
			}
			primo = false
			_, err = bw.Write(rec)
			return err
		})
		if _, werr := bw.WriteString("]"); werr != nil && err == nil {
			err = werr
		}
		if ferr := bw.Flush(); ferr != nil && err == nil {
			err = ferr
		}
		if err != nil {
			log.Printf("export JSON: %v", err)
			return
		}
		if err := a.store.segnaEsportati(osservatorio, sensore, maxID); err != nil {
			log.Printf("export JSON: marcatura esportati: %v", err)
		}
	}
}
