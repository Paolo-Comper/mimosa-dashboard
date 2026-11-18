package main

import (
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math/rand"
	"net/url"
	"strings"
	"sync"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
)

// StatoMQTT è lo stato della sottoscrizione lato server (visibile alla UI).
type StatoMQTT struct {
	Connesso     bool   `json:"connected"`
	Broker       string `json:"broker"`
	Topic        string `json:"topic"`
	Osservatorio string `json:"osservatorio"`
	Sensore      string `json:"sensore"`
	Errore       string `json:"error"`
}

// GestoreMQTT si occupa della connessione al broker: è il server a ricevere i
// messaggi e a salvarli in SQLite, non il browser.
type GestoreMQTT struct {
	mu     sync.Mutex
	store  *Store
	hub    *Hub
	client mqtt.Client
	stato  StatoMQTT
}

func nuovoGestoreMQTT(store *Store, hub *Hub) *GestoreMQTT {
	return &GestoreMQTT{store: store, hub: hub}
}

func (g *GestoreMQTT) Stato() StatoMQTT {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.stato
}

// parseTopicMQTT separa osservatorio e sensore, come faceva il browser.
// L'osservatorio conserva l'eventuale '/' iniziale, il sensore è l'ultimo
// livello prima di "/data".
func parseTopicMQTT(topic string) (osservatorio, sensore string, ok bool) {
	t := strings.TrimRight(strings.TrimSpace(topic), "/")
	t = strings.TrimSuffix(t, "/data")
	i := strings.LastIndex(t, "/")
	if i < 0 {
		return "", "", false
	}
	osservatorio = t[:i]
	sensore = t[i+1:]
	if sensore == "" {
		return "", "", false
	}
	return osservatorio, sensore, true
}

func hostConPorta(host string) bool {
	if strings.HasPrefix(host, "[") {
		return strings.Contains(host, "]:")
	}
	return strings.Count(host, ":") == 1
}

// normalizzaBroker accetta "host", "host:porta" o URL espliciti e restituisce
// un indirizzo paho. Senza schema si assume MQTT TCP sulla porta 1883.
func normalizzaBroker(raw string) (string, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return "", errors.New("broker mancante")
	}
	if strings.Contains(s, "://") {
		parti := strings.SplitN(s, "://", 2)
		schema := strings.ToLower(parti[0])
		resto := parti[1]
		if strings.TrimSpace(resto) == "" {
			return "", errors.New("broker non valido")
		}
		switch schema {
		case "tcp", "ssl", "ws", "wss":
			return schema + "://" + resto, nil
		case "mqtt":
			return "tcp://" + resto, nil
		case "mqtts", "tls":
			return "ssl://" + resto, nil
		case "http":
			return "ws://" + resto, nil
		case "https":
			return "wss://" + resto, nil
		default:
			return "", fmt.Errorf("schema broker non supportato: %s", schema)
		}
	}
	if strings.Contains(s, "/") {
		return "", errors.New("per un broker con percorso usa un URL esplicito, es. ws://host:porta/mqtt")
	}
	if !hostConPorta(s) {
		s += ":1883"
	}
	return "tcp://" + s, nil
}

func randString(n int) string {
	const charset = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, n)
	for i := range b {
		b[i] = charset[rand.Intn(len(charset))]
	}
	return string(b)
}

func (g *GestoreMQTT) Connetti(brokerRaw, topic string) (StatoMQTT, error) {
	brokerRaw = strings.TrimSpace(brokerRaw)
	topic = strings.TrimSpace(topic)
	if topic == "" {
		return g.Stato(), errors.New("topic mancante")
	}
	osservatorio, sensore, ok := parseTopicMQTT(topic)
	if !ok {
		return g.Stato(), fmt.Errorf("topic non valido: %s", topic)
	}
	brokerURL, err := normalizzaBroker(brokerRaw)
	if err != nil {
		return g.Stato(), err
	}

	// Chiude l'eventuale connessione precedente.
	g.mu.Lock()
	vecchio := g.client
	g.client = nil
	g.stato.Connesso = false
	g.mu.Unlock()
	if vecchio != nil {
		vecchio.Disconnect(200)
	}

	opts := mqtt.NewClientOptions()
	opts.AddBroker(brokerURL)
	opts.SetClientID("mimosa-server-" + randString(8))
	opts.SetCleanSession(true)
	opts.SetAutoReconnect(true)
	opts.SetMaxReconnectInterval(60 * time.Second)
	opts.SetKeepAlive(30 * time.Second)
	opts.SetPingTimeout(5 * time.Second)
	opts.SetConnectTimeout(10 * time.Second)
	opts.SetOrderMatters(false)

	if u, err := url.Parse(brokerURL); err == nil {
		if u.Scheme == "ssl" || u.Scheme == "tls" || u.Scheme == "wss" {
			opts.SetTLSConfig(&tls.Config{MinVersion: tls.VersionTLS12, ServerName: u.Hostname()})
		}
	}

	opts.SetOnConnectHandler(func(cli mqtt.Client) {
		tk := cli.Subscribe(topic, 1, g.onMessage)
		if !tk.WaitTimeout(10 * time.Second) {
			log.Printf("MQTT: timeout sottoscrizione %s", topic)
		} else if tk.Error() != nil {
			log.Printf("MQTT: errore sottoscrizione %s: %v", topic, tk.Error())
		}
		g.mu.Lock()
		g.stato = StatoMQTT{
			Connesso:     true,
			Broker:       brokerRaw,
			Topic:        topic,
			Osservatorio: osservatorio,
			Sensore:      sensore,
		}
		g.mu.Unlock()
		g.hub.Broadcast("status", eventoStato(g.Stato()))
	})
	opts.SetConnectionLostHandler(func(_ mqtt.Client, err error) {
		g.mu.Lock()
		g.stato.Connesso = false
		if err != nil {
			g.stato.Errore = err.Error()
		}
		g.mu.Unlock()
		g.hub.Broadcast("status", eventoStato(g.Stato()))
	})

	cli := mqtt.NewClient(opts)
	tk := cli.Connect()
	if !tk.WaitTimeout(10 * time.Second) {
		cli.Disconnect(250)
		return g.Stato(), errors.New("timeout di connessione al broker")
	}
	if err := tk.Error(); err != nil {
		cli.Disconnect(250)
		return g.Stato(), err
	}

	g.mu.Lock()
	g.client = cli
	g.stato = StatoMQTT{
		Connesso:     true,
		Broker:       brokerRaw,
		Topic:        topic,
		Osservatorio: osservatorio,
		Sensore:      sensore,
	}
	g.mu.Unlock()

	_ = g.store.salvaImpostazione("broker", brokerRaw)
	_ = g.store.salvaImpostazione("topic", topic)
	_ = g.store.salvaImpostazione("auto", "1")
	g.hub.Broadcast("status", eventoStato(g.Stato()))
	return g.Stato(), nil
}

func (g *GestoreMQTT) Disconnetti() StatoMQTT {
	g.mu.Lock()
	cli := g.client
	g.client = nil
	g.stato.Connesso = false
	g.stato.Errore = ""
	g.mu.Unlock()
	_ = g.store.salvaImpostazione("auto", "0")
	if cli != nil {
		cli.Disconnect(250)
	}
	g.hub.Broadcast("status", eventoStato(g.Stato()))
	return g.Stato()
}

// Autoconnetti riprende l'ultima sottoscrizione salvata (se l'utente non ha
// premuto "Disconnetti"): i dati vengono raccolti anche senza browser aperto.
func (g *GestoreMQTT) Autoconnetti() {
	auto, _ := g.store.leggiImpostazione("auto")
	if auto != "1" {
		return
	}
	broker, okBroker := g.store.leggiImpostazione("broker")
	topic, okTopic := g.store.leggiImpostazione("topic")
	if !okBroker || !okTopic || strings.TrimSpace(broker) == "" || strings.TrimSpace(topic) == "" {
		return
	}
	go func() {
		log.Printf("MQTT: riconnessione automatica a %s (%s)", broker, topic)
		if _, err := g.Connetti(broker, topic); err != nil {
			log.Printf("MQTT: auto-connect fallita: %v", err)
		}
	}()
}

type campioneEvento struct {
	ID           int64           `json:"id"`
	Topic        string          `json:"topic"`
	Osservatorio string          `json:"osservatorio"`
	Sensore      string          `json:"sensore"`
	Payload      json.RawMessage `json:"payload"`
}

func (g *GestoreMQTT) onMessage(_ mqtt.Client, msg mqtt.Message) {
	raw := msg.Payload()
	var meta struct {
		Timestamp *float64 `json:"timestamp"`
		ClientID  string   `json:"client_id"`
	}
	if err := json.Unmarshal(raw, &meta); err != nil || meta.Timestamp == nil {
		return
	}
	topic := msg.Topic()
	osservatorio, sensore, ok := parseTopicMQTT(topic)
	if !ok {
		return
	}
	campione := Campione{
		Timestamp:    *meta.Timestamp,
		Topic:        topic,
		Osservatorio: osservatorio,
		Sensore:      sensore,
		ClientID:     meta.ClientID,
		Payload:      json.RawMessage(append([]byte(nil), raw...)),
	}
	id, err := g.store.inserisciCampione(campione)
	if err != nil {
		log.Printf("MQTT: salvataggio campione fallito: %v", err)
		return
	}
	g.hub.Broadcast("sample", map[string]any{
		"type": "sample",
		"sample": campioneEvento{
			ID:           id,
			Topic:        topic,
			Osservatorio: osservatorio,
			Sensore:      sensore,
			Payload:      campione.Payload,
		},
	})
}

func eventoStato(stato StatoMQTT) map[string]any {
	return map[string]any{"type": "status", "mqtt": stato}
}
