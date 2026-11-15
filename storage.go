package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

// Campione è un singolo messaggio MQTT salvato nell'archivio SQLite.
type Campione struct {
	ID           int64
	Timestamp    float64
	Topic        string
	Osservatorio string
	Sensore      string
	ClientID     string
	Payload      json.RawMessage
	Esportato    bool
	ReceivedAt   int64
}

// Statistiche riassume l'archivio filtrato per osservatorio/sensore.
type Statistiche struct {
	Totale     int64    `json:"totale"`
	Esportati  int64    `json:"esportati"`
	UltimoTS   *float64 `json:"ultimo_ts,omitempty"`
	Dimensione int64    `json:"dimensione"` // byte occupati dal database (incluso WAL)
}

// Store incapsula il database SQLite. Le scritture sono serializzate, le
// letture possono avvenire in parallelo (journal WAL).
type Store struct {
	db   *sql.DB
	path string
	mu   sync.Mutex
}

func apriStore(path string) (*Store, error) {
	if strings.TrimSpace(path) == "" {
		path = "mimosa.db"
	}
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("apertura database: %w", err)
	}
	db.SetMaxOpenConns(4)
	db.SetMaxIdleConns(2)
	for _, pragma := range []string{
		"PRAGMA journal_mode=WAL",
		"PRAGMA synchronous=NORMAL",
		"PRAGMA busy_timeout=5000",
	} {
		if _, err := db.Exec(pragma); err != nil {
			db.Close()
			return nil, fmt.Errorf("%s: %w", pragma, err)
		}
	}
	s := &Store{db: db, path: path}
	if err := s.migra(); err != nil {
		db.Close()
		return nil, err
	}
	return s, nil
}

func (s *Store) migra() error {
	const schema = `
CREATE TABLE IF NOT EXISTS campioni (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp     REAL    NOT NULL,
    topic         TEXT    NOT NULL,
    osservatorio  TEXT    NOT NULL,
    sensore       TEXT    NOT NULL,
    client_id     TEXT,
    payload       TEXT    NOT NULL,
    exported      INTEGER NOT NULL DEFAULT 0,
    received_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_campioni_osservatorio ON campioni(osservatorio);
CREATE INDEX IF NOT EXISTS idx_campioni_sensore ON campioni(sensore);
CREATE INDEX IF NOT EXISTS idx_campioni_ts ON campioni(timestamp);
CREATE INDEX IF NOT EXISTS idx_campioni_exported ON campioni(exported);
CREATE TABLE IF NOT EXISTS impostazioni (
    chiave TEXT PRIMARY KEY,
    valore TEXT NOT NULL
);`
	_, err := s.db.Exec(schema)
	return err
}

func (s *Store) chiudi() error {
	return s.db.Close()
}

// condizioniCampioni costruisce le condizioni WHERE per osservatorio/sensore.
// "+" e "*" come sensore significano "tutti i sensori".
func condizioniCampioni(osservatorio, sensore string) ([]string, []any) {
	var cond []string
	var args []any
	if osservatorio != "" && osservatorio != "*" {
		cond = append(cond, "osservatorio = ?")
		args = append(args, osservatorio)
	}
	if sensore != "" && sensore != "+" && sensore != "*" {
		cond = append(cond, "sensore = ?")
		args = append(args, sensore)
	}
	return cond, args
}

func whereCampioni(osservatorio, sensore string) (string, []any) {
	cond, args := condizioniCampioni(osservatorio, sensore)
	if len(cond) == 0 {
		return "", nil
	}
	return " WHERE " + strings.Join(cond, " AND "), args
}

func (s *Store) inserisciCampione(c Campione) (int64, error) {
	var clientID any
	if c.ClientID != "" {
		clientID = c.ClientID
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	res, err := s.db.Exec(
		`INSERT INTO campioni (timestamp, topic, osservatorio, sensore, client_id, payload, exported, received_at)
		 VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
		c.Timestamp, c.Topic, c.Osservatorio, c.Sensore, clientID, string(c.Payload), time.Now().UnixMilli(),
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// importaCampioni inserisce in blocco i record importati dal vecchio storage
// del browser.
func (s *Store) importaCampioni(campioni []Campione) (int, error) {
	if len(campioni) == 0 {
		return 0, nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	tx, err := s.db.Begin()
	if err != nil {
		return 0, err
	}
	stmt, err := tx.Prepare(
		`INSERT INTO campioni (timestamp, topic, osservatorio, sensore, client_id, payload, exported, received_at)
		 VALUES (?, ?, ?, ?, ?, ?, 0, ?)`)
	if err != nil {
		tx.Rollback()
		return 0, err
	}
	defer stmt.Close()
	now := time.Now().UnixMilli()
	inseriti := 0
	for _, c := range campioni {
		var clientID any
		if c.ClientID != "" {
			clientID = c.ClientID
		}
		if _, err := stmt.Exec(c.Timestamp, c.Topic, c.Osservatorio, c.Sensore, clientID, string(c.Payload), now); err != nil {
			tx.Rollback()
			return inseriti, err
		}
		inseriti++
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return inseriti, nil
}

func (s *Store) ultimiCampioni(osservatorio, sensore string, limite int) ([]Campione, error) {
	if limite <= 0 {
		limite = 50
	}
	if limite > 2000 {
		limite = 2000
	}
	where, args := whereCampioni(osservatorio, sensore)
	q := `SELECT id, timestamp, topic, osservatorio, sensore, COALESCE(client_id, ''), payload, exported, received_at
	      FROM campioni` + where + ` ORDER BY id DESC LIMIT ?`
	args = append(args, limite)
	rows, err := s.db.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Campione
	for rows.Next() {
		var c Campione
		var payload string
		var esportato int64
		if err := rows.Scan(&c.ID, &c.Timestamp, &c.Topic, &c.Osservatorio, &c.Sensore, &c.ClientID, &payload, &esportato, &c.ReceivedAt); err != nil {
			return nil, err
		}
		c.Payload = json.RawMessage(payload)
		c.Esportato = esportato != 0
		out = append(out, c)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	// dal più vecchio al più recente (comodo per la dashboard)
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	return out, nil
}

func (s *Store) statistiche(osservatorio, sensore string) (Statistiche, error) {
	where, args := whereCampioni(osservatorio, sensore)
	var st Statistiche
	if err := s.db.QueryRow(`SELECT COUNT(*), COALESCE(SUM(exported), 0) FROM campioni`+where, args...).
		Scan(&st.Totale, &st.Esportati); err != nil {
		return st, err
	}
	var ultimo sql.NullFloat64
	if err := s.db.QueryRow(`SELECT MAX(timestamp) FROM campioni`+where, args...).Scan(&ultimo); err != nil {
		return st, err
	}
	if ultimo.Valid {
		v := ultimo.Float64
		st.UltimoTS = &v
	}
	st.Dimensione = s.dimensioneFile()
	return st, nil
}

func (s *Store) dimensioneFile() int64 {
	var totale int64
	for _, suffisso := range []string{"", "-wal"} {
		if fi, err := os.Stat(s.path + suffisso); err == nil {
			totale += fi.Size()
		}
	}
	return totale
}

func (s *Store) massimoID() (int64, error) {
	var id int64
	err := s.db.QueryRow(`SELECT COALESCE(MAX(id), 0) FROM campioni`).Scan(&id)
	return id, err
}

// iteraPerExport scorre i campioni (dal più vecchio) fino a maxID compreso.
func (s *Store) iteraPerExport(osservatorio, sensore string, maxID int64, fn func(Campione) error) error {
	cond, args := condizioniCampioni(osservatorio, sensore)
	cond = append(cond, "id <= ?")
	args = append(args, maxID)
	q := `SELECT id, timestamp, topic, osservatorio, sensore, COALESCE(client_id, ''), payload, exported, received_at
	      FROM campioni WHERE ` + strings.Join(cond, " AND ") + ` ORDER BY id ASC`
	rows, err := s.db.Query(q, args...)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var c Campione
		var payload string
		var esportato int64
		if err := rows.Scan(&c.ID, &c.Timestamp, &c.Topic, &c.Osservatorio, &c.Sensore, &c.ClientID, &payload, &esportato, &c.ReceivedAt); err != nil {
			return err
		}
		c.Payload = json.RawMessage(payload)
		c.Esportato = esportato != 0
		if err := fn(c); err != nil {
			return err
		}
	}
	return rows.Err()
}

func (s *Store) segnaEsportati(osservatorio, sensore string, maxID int64) error {
	cond, args := condizioniCampioni(osservatorio, sensore)
	cond = append(cond, "id <= ?")
	args = append(args, maxID)
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := s.db.Exec(`UPDATE campioni SET exported = 1 WHERE `+strings.Join(cond, " AND "), args...)
	return err
}

func (s *Store) svuotaCampioni() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, err := s.db.Exec(`DELETE FROM campioni`); err != nil {
		return err
	}
	// riparte anche la numerazione degli id
	_, _ = s.db.Exec(`DELETE FROM sqlite_sequence WHERE name = 'campioni'`)
	return nil
}

func (s *Store) svuotaEsportati() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := s.db.Exec(`DELETE FROM campioni WHERE exported = 1`)
	return err
}

func (s *Store) salvaImpostazione(chiave, valore string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := s.db.Exec(
		`INSERT INTO impostazioni (chiave, valore) VALUES (?, ?)
		 ON CONFLICT(chiave) DO UPDATE SET valore = excluded.valore`, chiave, valore)
	return err
}

func (s *Store) leggiImpostazione(chiave string) (string, bool) {
	var valore string
	err := s.db.QueryRow(`SELECT valore FROM impostazioni WHERE chiave = ?`, chiave).Scan(&valore)
	if err != nil {
		return "", false
	}
	return valore, true
}
