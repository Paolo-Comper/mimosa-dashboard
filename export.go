package main

import (
	"encoding/json"
	"math"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Strutture usate solo per l'export: i puntatori distinguono i campi assenti o
// null (che nell'export restano vuoti) dai valori numerici.
type expPMS struct {
	PM1         *float64 `json:"pm1"`
	PM25        *float64 `json:"pm25"`
	PM10        *float64 `json:"pm10"`
	Temperature *float64 `json:"temperature"`
	Humidity    *float64 `json:"humidity"`
}

type expDHT struct {
	Temperature *float64 `json:"temperature"`
	Humidity    *float64 `json:"humidity"`
}

type expBME struct {
	Temperature *float64 `json:"temperature"`
	Humidity    *float64 `json:"humidity"`
	Pressure    *float64 `json:"pressure"`
}

type expVirtual struct {
	Temperature *float64 `json:"temperature"`
	Humidity    *float64 `json:"humidity"`
	Pressure    *float64 `json:"pressure"`
}

type expGPS struct {
	Lat   *float64 `json:"lat"`
	Lon   *float64 `json:"lon"`
	Alt   *float64 `json:"alt"`
	Sats  *float64 `json:"sats"`
	Valid *bool    `json:"valid"`
}

type expVirtualGPS struct {
	Lat       *float64 `json:"lat"`
	Lon       *float64 `json:"lon"`
	Alt       *float64 `json:"alt"`
	Sats      *float64 `json:"sats"`
	Valid     *bool    `json:"valid"`
	Source    string   `json:"source"`
	GPSHWPos  *int     `json:"GPS_HW_POS"`
	AccuracyM *float64 `json:"accuracy_m"`
}

type expGPSNetwork struct {
	Lat       *float64 `json:"lat"`
	Lon       *float64 `json:"lon"`
	Alt       *float64 `json:"alt"`
	Source    string   `json:"source"`
	AccuracyM *float64 `json:"accuracy_m"`
}

type expPayload struct {
	Timestamp  *float64       `json:"timestamp"`
	Topic      string         `json:"topic"`
	ClientID   string         `json:"client_id"`
	PMS        expPMS         `json:"pms"`
	DHT22      expDHT         `json:"dht22"`
	BME280     expBME         `json:"bme280"`
	Virtual    expVirtual     `json:"virtual"`
	GPS        expGPS         `json:"gps"`
	VirtualGPS *expVirtualGPS `json:"virtual_gps"`
	GPSNetwork *expGPSNetwork `json:"gps_network"`
	// bh1750 e altri rami non sono usati dalla dashboard
}

var intestazioneCSV = []string{
	"timestamp", "data_ora", "osservatorio", "sensore",
	"pm1", "pm25", "pm10",
	"temp_pms", "hum_pms",
	"temp_dht22", "hum_dht22",
	"temp_bme280", "hum_bme280",
	"temp_virtual", "hum_virtual",
	"pressure_hpa", "pressure_virtual_hpa",
	"lat", "lon", "alt", "sats", "gps_valid",
	"gps_source", "gps_accuracy_m", "gps_hw_pos",
}

type posizioneExport struct {
	lat, lon, alt, sats, accuracy *float64
	source                        string
	hwPos                         *int
	valid                         bool
}

// posizioneGPSExport replica la logica della dashboard: virtual_gps ha la
// precedenza, il vecchio ramo gps è il fallback.
func posizioneGPSExport(p expPayload) posizioneExport {
	if p.VirtualGPS != nil {
		v := p.VirtualGPS
		if (v.Valid != nil && !*v.Valid) || v.Lat == nil || v.Lon == nil {
			return posizioneExport{}
		}
		return posizioneExport{
			lat: v.Lat, lon: v.Lon, alt: v.Alt, sats: v.Sats,
			accuracy: v.AccuracyM, source: v.Source, hwPos: v.GPSHWPos, valid: true,
		}
	}
	if p.GPS.Valid != nil && *p.GPS.Valid && p.GPS.Lat != nil && p.GPS.Lon != nil {
		zero := 0
		return posizioneExport{
			lat: p.GPS.Lat, lon: p.GPS.Lon, alt: p.GPS.Alt, sats: p.GPS.Sats,
			source: "gps", hwPos: &zero, valid: true,
		}
	}
	return posizioneExport{}
}

func normalizzaPressioneVal(p float64) float64 {
	if math.Abs(p) > 5000 {
		return p / 100
	}
	return p
}

func formatNum(v float64) string {
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return ""
	}
	if v == math.Trunc(v) && math.Abs(v) < 1e15 {
		return strconv.FormatInt(int64(v), 10)
	}
	return strconv.FormatFloat(v, 'f', -1, 64)
}

func campoNum(v *float64) string {
	if v == nil {
		return ""
	}
	return formatNum(*v)
}

func campoNum1(v *float64) string {
	if v == nil {
		return ""
	}
	return strconv.FormatFloat(*v, 'f', 1, 64)
}

func campoPressione(v *float64) string {
	if v == nil {
		return ""
	}
	hpa := normalizzaPressioneVal(*v)
	return strconv.FormatFloat(hpa, 'f', 1, 64)
}

func (p posizioneExport) campoLat() string  { return campoNum(p.lat) }
func (p posizioneExport) campoLon() string  { return campoNum(p.lon) }
func (p posizioneExport) campoAlt() string  { return campoNum(p.alt) }
func (p posizioneExport) campoSats() string { return campoNum(p.sats) }
func (p posizioneExport) campoAcc() string  { return campoNum(p.accuracy) }

func (p posizioneExport) campoSource() string {
	if !p.valid {
		return ""
	}
	return p.source
}

func rigaCSV(c Campione) ([]string, error) {
	var p expPayload
	if err := json.Unmarshal(c.Payload, &p); err != nil {
		return nil, err
	}
	pos := posizioneGPSExport(p)
	dataOra := time.Unix(int64(c.Timestamp), 0).In(time.Local).Format("02/01/2006 15:04:05")
	valid := "false"
	if pos.valid {
		valid = "true"
	}
	hwPos := ""
	if pos.hwPos != nil {
		hwPos = strconv.Itoa(*pos.hwPos)
	}
	return []string{
		formatNum(c.Timestamp),
		dataOra,
		c.Osservatorio,
		c.Sensore,
		campoNum(p.PMS.PM1),
		campoNum(p.PMS.PM25),
		campoNum(p.PMS.PM10),
		campoNum(p.PMS.Temperature),
		campoNum(p.PMS.Humidity),
		campoNum(p.DHT22.Temperature),
		campoNum(p.DHT22.Humidity),
		campoNum(p.BME280.Temperature),
		campoNum(p.BME280.Humidity),
		campoNum(p.Virtual.Temperature),
		campoNum(p.Virtual.Humidity),
		campoPressione(p.BME280.Pressure),
		campoPressione(p.Virtual.Pressure),
		pos.campoLat(),
		pos.campoLon(),
		pos.campoAlt(),
		pos.campoSats(),
		valid,
		pos.campoSource(),
		pos.campoAcc(),
		hwPos,
	}, nil
}

// recordJSON produce un record nello stesso formato del vecchio export JSON.
func recordJSON(c Campione) ([]byte, error) {
	var payload map[string]any
	if err := json.Unmarshal(c.Payload, &payload); err != nil {
		return nil, err
	}
	rec := map[string]any{
		"timestamp":    c.Timestamp,
		"topic":        c.Topic,
		"osservatorio": c.Osservatorio,
		"sensore":      c.Sensore,
	}
	if c.ClientID != "" {
		rec["client_id"] = c.ClientID
	} else if v, ok := payload["client_id"]; ok {
		rec["client_id"] = v
	}
	for _, chiave := range []string{"pms", "dht22", "bme280", "virtual", "gps", "virtual_gps", "gps_network"} {
		if v, ok := payload[chiave]; ok && v != nil {
			rec[chiave] = v
		}
	}
	return json.Marshal(rec)
}

var slugRe = regexp.MustCompile(`[^a-zA-Z0-9_-]+`)

func slug(s string) string {
	out := strings.Trim(slugRe.ReplaceAllString(s, "-"), "-")
	if out == "" {
		return "dati"
	}
	return out
}

func nomeFileExport(osservatorio, sensore, ext string) string {
	if sensore == "" || sensore == "+" || sensore == "*" {
		sensore = "tutti"
	}
	return "mimosa_" + slug(osservatorio) + "_" + slug(sensore) + "." + ext
}
