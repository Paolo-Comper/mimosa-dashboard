package main

import (
	"embed"
	"encoding/json"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"math/rand"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
)

//go:embed index.html styles.css
//go:embed src/*.js
//go:embed res/marconi.png res/urbino.png
var assets embed.FS

const logo = `
  ╔══════════════════════════════════════════╗
  ║         MIMOSA - Air Quality             ║
  ║         Monitoraggio Aria                ║
  ╚══════════════════════════════════════════╝
`

type PMS struct {
	PM1         int     `json:"pm1"`
	PM25        int     `json:"pm25"`
	PM10        int     `json:"pm10"`
	Temperature float64 `json:"temperature"`
	Humidity    float64 `json:"humidity"`
}

type DHT22 struct {
	Temperature float64 `json:"temperature"`
	Humidity    float64 `json:"humidity"`
}

type BME280 struct {
	Temperature float64 `json:"temperature"`
	Humidity    float64 `json:"humidity"`
	Pressure    float64 `json:"pressure"`
}

type GPS struct {
	Lat   float64 `json:"lat"`
	Lon   float64 `json:"lon"`
	Alt   float64 `json:"alt"`
	Sats  int     `json:"sats"`
	Valid bool    `json:"valid"`
}

type Payload struct {
	Timestamp float64 `json:"timestamp"`
	PMS       PMS     `json:"pms"`
	DHT22     DHT22   `json:"dht22"`
	BME280    BME280  `json:"bme280"`
	GPS       GPS     `json:"gps"`
}

const helpText = `MIMOSA - Avvio facile (cross-platform)
======================================
Avvia un server HTTP, apre il browser e (opzionalmente) pubblica
dati di test MQTT.

Uso:
  ./mimosa                                # solo server HTTP
  ./mimosa --test                         # server + 10 msg di test
  ./mimosa --test rpi-zero-1 5            # client + conteggio custom
  ./mimosa --dev                          # modalita sviluppo (file da disco)
  ./mimosa --help                         # questo messaggio

Porta: default 8080, sovrascrivi con PORT=9090
`

func echo(msg string) {
	fmt.Println(" ", msg)
}

func apriBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	_ = cmd.Start()
}

func killPort(port int) {
	switch runtime.GOOS {
	case "windows":
		exec.Command("cmd", "/c",
			fmt.Sprintf(`for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%d"') do taskkill /f /pid %%p`, port),
		).Run()
	default:
		exec.Command("sh", "-c",
			fmt.Sprintf("fuser -k %d/tcp 2>/dev/null", port),
		).Run()
	}
}

func randClientID() string {
	const charset = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, 8)
	for i := range b {
		b[i] = charset[rand.Intn(len(charset))]
	}
	return "mimosa-" + string(b)
}

// ── Messaggi di test ────────────────────────────────────────

var basePayload = Payload{
	PMS:    PMS{PM1: 4, PM25: 10, PM10: 15, Temperature: 9.1, Humidity: 63.3},
	DHT22:  DHT22{Temperature: 4.9, Humidity: 81.1},
	BME280: BME280{Temperature: 4.32, Humidity: 74.23, Pressure: 999.57},
	GPS:    GPS{Lat: 43.72386, Lon: 12.63765, Alt: 472.0, Sats: 7, Valid: true},
}

func generaMessaggio(idx int) Payload {
	p := basePayload
	t := float64(time.Now().UnixMilli()) / 1000.0
	return Payload{
		Timestamp: t,
		PMS: PMS{
			PM1:         max(0, p.PMS.PM1+rand.Intn(18)-3),
			PM25:        max(0, p.PMS.PM25+rand.Intn(25)-5),
			PM10:        max(0, p.PMS.PM10+rand.Intn(30)-5),
			Temperature: arrotonda(p.PMS.Temperature+rand.Float64()-0.5, 1),
			Humidity:    arrotonda(p.PMS.Humidity+rand.Float64()*4-2, 1),
		},
		DHT22: DHT22{
			Temperature: arrotonda(p.DHT22.Temperature+rand.Float64()-0.5, 1),
			Humidity:    arrotonda(p.DHT22.Humidity+rand.Float64()*4-2, 1),
		},
		BME280: BME280{
			Temperature: arrotonda(p.BME280.Temperature+rand.Float64()*0.6-0.3, 2),
			Humidity:    arrotonda(p.BME280.Humidity+rand.Float64()*2-1, 2),
			Pressure:    arrotonda(p.BME280.Pressure+rand.Float64()*4-2, 2),
		},
		GPS: GPS{
			Lat:   arrotonda(p.GPS.Lat+float64(idx)*0.00001, 6),
			Lon:   arrotonda(p.GPS.Lon+float64(idx)*0.00001, 6),
			Alt:   arrotonda(p.GPS.Alt+rand.Float64()*2-1, 1),
			Sats:  7,
			Valid: true,
		},
	}
}

func arrotonda(v float64, dec int) float64 {
	pow := 1.0
	for i := 0; i < dec; i++ {
		pow *= 10
	}
	return float64(int(v*pow+0.5)) / pow
}

func pubblicaTest(clientName string, count int) {
	topic := fmt.Sprintf("mimosa/%s/data", clientName)

	fmt.Println("")
	fmt.Println("  ============================================")
	fmt.Println("   MIMOSA - Test MQTT")
	fmt.Printf("   Broker:    tcp://broker.hivemq.com:1883\n")
	fmt.Printf("   Client:    %s\n", clientName)
	fmt.Printf("   Messaggi:  %d\n", count)
	fmt.Printf("   Intervallo: 2s\n")
	fmt.Printf("   Topic:     %s\n", topic)
	fmt.Println("  ============================================")
	fmt.Println("")

	for i := 1; i <= count; i++ {
		msgData := generaMessaggio(i)
		payload, _ := json.Marshal(msgData)

		opts := mqtt.NewClientOptions()
		opts.AddBroker("tcp://broker.hivemq.com:1883")
		opts.SetClientID(randClientID())
		opts.SetConnectTimeout(10 * time.Second)
		opts.SetKeepAlive(30 * time.Second)
		opts.SetPingTimeout(5 * time.Second)

		client := mqtt.NewClient(opts)
		token := client.Connect()
		if !token.WaitTimeout(10 * time.Second) {
			fmt.Printf("  [%d/%d] Connessione fallita, salto...\n", i, count)
			continue
		}
		if token.Error() != nil {
			fmt.Printf("  [%d/%d] Connessione fallita (%s), salto...\n", i, count, token.Error())
			continue
		}

		t := client.Publish(topic, 0, false, payload)
		t.WaitTimeout(5 * time.Second)

		fmt.Printf("  [%d/%d] Pubblicato su %s\n", i, count, topic)

		client.Disconnect(250)

		if i < count {
			time.Sleep(2 * time.Second)
		}
	}

	fmt.Println("")
	fmt.Println("  ============================================")
	fmt.Println("   Test completato!")
	fmt.Println("  ============================================")
}

type logWriter struct{}

func (logWriter) Write(p []byte) (int, error) { return len(p), nil }

// ── MAIN ────────────────────────────────────────────────────

func main() {
	testFlag := flag.Bool("test", false, "Pubblica dati di test MQTT")
	devFlag := flag.Bool("dev", false, "Modalita sviluppo (legge i file da disco)")
	helpFlag := flag.Bool("help", false, "Mostra aiuto")
	flag.Parse()

	if *helpFlag {
		fmt.Print(helpText)
		return
	}

	portStr := os.Getenv("PORT")
	port := 8080
	if portStr != "" {
		if p, err := strconv.Atoi(portStr); err == nil {
			port = p
		}
	}

	// Porta occupata? kill vecchia istanza
	ln, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
	if err != nil {
		killPort(port)
		for i := 0; i < 5; i++ {
			time.Sleep(1 * time.Second)
			ln, err = net.Listen("tcp", fmt.Sprintf(":%d", port))
			if err == nil {
				echo(fmt.Sprintf("Kill vecchia istanza sulla porta %d", port))
				break
			}
		}
		if err != nil {
			echo(fmt.Sprintf("Porta %d occupata, provo %d...", port, port+1))
			port++
			ln, err = net.Listen("tcp", fmt.Sprintf(":%d", port))
			if err != nil {
				log.Fatalf("Nessuna porta libera: %v", err)
			}
		}
	}
	ln.Close()

	// Handler HTTP
	var fileServer http.Handler
	if *devFlag {
		echo("Modalita sviluppo: leggo i file da disco")
		fileServer = http.FileServer(http.Dir("."))
	} else {
		subFS, _ := fs.Sub(assets, ".")
		fileServer = http.FileServer(http.FS(subFS))
	}

	// Listener con SO_REUSEADDR
	lc := net.ListenConfig{
		Control: func(network, address string, c syscall.RawConn) error {
			return c.Control(reuseAddrControl)
		},
	}
	listener, err := lc.Listen(nil, "tcp", fmt.Sprintf(":%d", port))
	if err != nil {
		log.Fatalf("listen: %v", err)
	}

	server := &http.Server{
		Handler:  fileServer,
		ErrorLog: log.New(logWriter{}, "", 0),
	}

	// Stampa info
	fmt.Print(logo)
	fmt.Println()
	url := fmt.Sprintf("http://localhost:%d", port)
	echo("Apri il browser: " + url)
	echo("Clicca 'Connetti' per ricevere dati MQTT.")
	echo("Ctrl+C per fermare.")
	fmt.Println("")

	// Canale per attendere l'arresto
	done := make(chan struct{}, 1)

	// Signal handler
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sig
		fmt.Println("\n  Arresto... Ciao!")
		server.Close()
		close(done)
	}()

	// Avvia server HTTP in goroutine (NON blocca)
	go func() {
		err := server.Serve(listener)
		if err != nil && err != http.ErrServerClosed {
			log.Printf("server error: %v", err)
		}
	}()

	// Test MQTT (se richiesto) — parte DOPO che il server e' su
	if *testFlag {
		args := flag.Args()
		clientName := "rpi-zero-1"
		count := 10
		if len(args) > 0 && !strings.HasPrefix(args[0], "-") {
			clientName = args[0]
		}
		if len(args) > 1 && !strings.HasPrefix(args[1], "-") {
			if c, err := strconv.Atoi(args[1]); err == nil {
				count = c
			}
		}

		echo(fmt.Sprintf("Pubblico %d messaggi per '%s'...", count, clientName))
		echo("Ctrl+C per interrompere.")
		fmt.Println("")

		// Test in goroutine — non blocca il server HTTP
		go pubblicaTest(clientName, count)
	}

	// Apri browser
	go func() {
		time.Sleep(500 * time.Millisecond)
		apriBrowser(url)
	}()

	// Blocca fino a Ctrl+C
	<-done
}
