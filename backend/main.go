package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/handlers"
	"github.com/gorilla/mux"
	"golang.org/x/crypto/bcrypt"

	_ "modernc.org/sqlite"
)

var db *sql.DB

// ---------- helpers ----------

func randomDigits(n int) (string, error) {
	if n <= 0 {
		return "", errors.New("invalid length")
	}
	b := make([]byte, n)
	_, err := rand.Read(b)
	if err != nil {
		return "", err
	}
	for i := range b {
		b[i] = '0' + (b[i] % 10)
	}
	return string(b), nil
}

func hashPlain(plain string) (string, error) {
	h, err := bcrypt.GenerateFromPassword([]byte(plain), bcrypt.DefaultCost)
	return string(h), err
}

func compareHash(hash, plain string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain))
	return err == nil
}

// ---------- DB helpers ----------

func createTables() {
	sqlStmt := `
	CREATE TABLE IF NOT EXISTS cards (
		id TEXT PRIMARY KEY,
		owner_profile_id TEXT,
		pin_hash TEXT,
		card_token TEXT UNIQUE,
		is_active INTEGER DEFAULT 0,
		activated_at DATETIME,
		activated_by TEXT
	);
	CREATE TABLE IF NOT EXISTS card_otps (
		id TEXT PRIMARY KEY,
		card_id TEXT,
		otp_hash TEXT,
		sent_to TEXT,
		channel TEXT,
		expires_at DATETIME,
		used INTEGER DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	`
	_, err := db.Exec(sqlStmt)
	if err != nil {
		log.Fatalf("Failed creating tables: %v", err)
	}
}

func createCard(ownerProfileID *string, pin string) (cardID string, cardToken string, err error) {
	pinHash, err := hashPlain(pin)
	if err != nil {
		return "", "", err
	}

	cardID = uuid.New().String()
	cardToken = uuid.New().String()

	_, err = db.Exec(`
		INSERT INTO cards (id, owner_profile_id, pin_hash, card_token)
		VALUES (?, ?, ?, ?)
	`, cardID, ownerProfileID, pinHash, cardToken)
	if err != nil {
		return "", "", err
	}
	return cardID, cardToken, nil
}

func getCardByToken(token string) (cardID string, pinHash string, ownerProfileID *string, err error) {
	row := db.QueryRow(`SELECT id, pin_hash, owner_profile_id FROM cards WHERE card_token = ?`, token)
	var owner sql.NullString
	err = row.Scan(&cardID, &pinHash, &owner)
	if err != nil {
		return "", "", nil, err
	}
	if owner.Valid {
		return cardID, pinHash, &owner.String, nil
	}
	return cardID, pinHash, nil, nil
}

func storeOTP(cardID, otpPlain, sentTo, channel string, ttlMinutes int) error {
	otpHash, err := hashPlain(otpPlain)
	if err != nil {
		return err
	}
	expiresAt := time.Now().Add(time.Duration(ttlMinutes) * time.Minute)
	otpID := uuid.New().String()

	_, err = db.Exec(`
		INSERT INTO card_otps (id, card_id, otp_hash, sent_to, channel, expires_at, used)
		VALUES (?, ?, ?, ?, ?, ?, 0)
	`, otpID, cardID, otpHash, sentTo, channel, expiresAt)
	return err
}

func getLatestUnusedOTP(cardID string) (otpID string, otpHash string, expiresAt time.Time, used bool, err error) {
	row := db.QueryRow(`
		SELECT id, otp_hash, expires_at, used
		FROM card_otps
		WHERE card_id = ?
		ORDER BY created_at DESC
		LIMIT 1
	`, cardID)
	var usedInt int
	err = row.Scan(&otpID, &otpHash, &expiresAt, &usedInt)
	if err != nil {
		return
	}
	used = usedInt != 0
	return
}

func markOTPUsed(otpID string) error {
	_, err := db.Exec(`UPDATE card_otps SET used = 1 WHERE id = ?`, otpID)
	return err
}

func activateCard(cardID string, activatedBy *string) error {
	if activatedBy != nil {
		_, err := db.Exec(`UPDATE cards SET is_active = 1, activated_at = CURRENT_TIMESTAMP, activated_by = ? WHERE id = ?`, *activatedBy, cardID)
		return err
	}
	_, err := db.Exec(`UPDATE cards SET is_active = 1, activated_at = CURRENT_TIMESTAMP WHERE id = ?`, cardID)
	return err
}

// ---------- Handlers ----------

type createCardReq struct {
	OwnerProfileID *string `json:"owner_profile_id,omitempty"`
	Pin            *string `json:"pin,omitempty"`
}
type createCardResp struct {
	CardID    string `json:"card_id"`
	CardToken string `json:"card_token"`
	Pin       string `json:"pin"` // show once to admin
}

func handleCreateCard(w http.ResponseWriter, r *http.Request) {
	var req createCardReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	pin := ""
	if req.Pin != nil && *req.Pin != "" {
		pin = *req.Pin
	} else {
		p, err := randomDigits(6)
		if err != nil {
			http.Error(w, "failed to generate pin", http.StatusInternalServerError)
			return
		}
		pin = p
	}

	cardID, cardToken, err := createCard(req.OwnerProfileID, pin)
	if err != nil {
		log.Println("createCard err:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	resp := createCardResp{
		CardID:    cardID,
		CardToken: cardToken,
		Pin:       pin,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

type requestOtpReq struct {
	CardToken string `json:"card_token"`
	Pin       string `json:"pin"`
	Channel   string `json:"channel"` // "email" or "sms"
	Email     string `json:"email,omitempty"`
	Phone     string `json:"phone,omitempty"`
}

var attemptStore = map[string]struct {
	count      int
	blockUntil time.Time
}{}

func handleRequestOTP(w http.ResponseWriter, r *http.Request) {
	var req requestOtpReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	if s, ok := attemptStore[req.CardToken]; ok && time.Now().Before(s.blockUntil) {
		http.Error(w, "temporarily blocked due to failed attempts", http.StatusTooManyRequests)
		return
	}

	cardID, pinHash, _, err := getCardByToken(req.CardToken)
	if err != nil {
		http.Error(w, "card not found", http.StatusNotFound)
		return
	}

	if !compareHash(pinHash, req.Pin) {
		s := attemptStore[req.CardToken]
		s.count++
		if s.count >= 5 {
			s.blockUntil = time.Now().Add(15 * time.Minute)
			s.count = 0
		}
		attemptStore[req.CardToken] = s
		http.Error(w, "invalid pin", http.StatusUnauthorized)
		return
	}
	delete(attemptStore, req.CardToken)

	sendTo := ""
	if req.Channel == "email" {
		if req.Email != "" {
			sendTo = req.Email
		} else {
			http.Error(w, "no email available", http.StatusBadRequest)
			return
		}
	} else if req.Channel == "sms" {
		if req.Phone != "" {
			sendTo = req.Phone
		} else {
			http.Error(w, "no phone available", http.StatusBadRequest)
			return
		}
	} else {
		http.Error(w, "invalid channel", http.StatusBadRequest)
		return
	}

	otp, err := randomDigits(6)
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}

	if err := storeOTP(cardID, otp, sendTo, req.Channel, 5); err != nil {
		log.Println("storeOTP err:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}

	if req.Channel == "email" {
		// في حالة استخدام بريد حقيقي، ضع كود الإرسال هنا.
		log.Printf("Email OTP to %s: %s\n", sendTo, otp)
	} else {
		// رسالة SMS placeholder
		log.Printf("SMS OTP to %s: %s\n", sendTo, otp)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"ok": true, "message": "OTP sent"})
}

type verifyReq struct {
	CardToken string `json:"card_token"`
	OTP       string `json:"otp"`
}

func handleVerifyOTP(w http.ResponseWriter, r *http.Request) {
	var req verifyReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	cardID, _, _, err := getCardByToken(req.CardToken)
	if err != nil {
		http.Error(w, "card not found", http.StatusNotFound)
		return
	}

	otpID, otpHash, expiresAt, used, err := getLatestUnusedOTP(cardID)
	if err != nil {
		http.Error(w, "no otp requested", http.StatusBadRequest)
		return
	}
	if used {
		http.Error(w, "otp already used", http.StatusBadRequest)
		return
	}
	if time.Now().After(expiresAt) {
		http.Error(w, "otp expired", http.StatusBadRequest)
		return
	}
	if !compareHash(otpHash, req.OTP) {
		http.Error(w, "invalid otp", http.StatusUnauthorized)
		return
	}

	if err := markOTPUsed(otpID); err != nil {
		log.Println("markOTPUsed:", err)
	}

	if err := activateCard(cardID, nil); err != nil {
		log.Println("activateCard:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"ok": true, "message": "card activated"})
}

// ---------- main ----------

func main() {
	var err error
	db, err = sql.Open("sqlite", "./cards.db")
	if err != nil {
		log.Fatalf("db open error: %v", err)
	}
	defer db.Close()

	createTables()

	r := mux.NewRouter()
	api := r.PathPrefix("/api").Subrouter()
	api.HandleFunc("/cards/create", handleCreateCard).Methods("POST")
	api.HandleFunc("/cards/request-otp", handleRequestOTP).Methods("POST")
	api.HandleFunc("/cards/verify", handleVerifyOTP).Methods("POST")

	// إعداد CORS للسماح لـ React في localhost:8081
	allowedOrigins := handlers.AllowedOrigins([]string{"http://localhost:8081"})
	allowedMethods := handlers.AllowedMethods([]string{"GET", "POST", "OPTIONS"})
	allowedHeaders := handlers.AllowedHeaders([]string{"Content-Type", "Authorization"})

	srv := &http.Server{
		Handler:      handlers.CORS(allowedOrigins, allowedMethods, allowedHeaders)(r),
		Addr:         ":8080",
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	log.Println("Listening on :8080")
	if err := srv.ListenAndServe(); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}
