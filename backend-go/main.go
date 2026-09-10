package main

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"kgrsn-backend-go/handlers"
)

func main() {
	cfg := loadConfig()
	db, err := openDatabase(cfg)
	if err != nil {
		log.Fatalf("database connection failed: %v", err)
	}
	defer db.Close()

	gormDB, err := openGormDB(db)
	if err != nil {
		log.Fatalf("gorm initialization failed: %v", err)
	}

	poHandler := handlers.NewPOHandler(gormDB)

	mux := http.NewServeMux()
	mux.HandleFunc("/health", healthHandler(db))
	mux.HandleFunc("/api/health", healthHandler(db))
	mux.HandleFunc("/api/auth/login", loginHandler(db, cfg))
	mux.Handle("/api/auth/me", requireAuth(db, cfg, http.HandlerFunc(meHandler(db))))
	mux.Handle("/api/po", requireAuth(db, cfg, http.HandlerFunc(poHandler.GetPOs)))

	server := &http.Server{
		Addr:              ":" + cfg.HTTPPort,
		Handler:           corsMiddleware(cfg.AllowedOrigin, mux),
		ReadHeaderTimeout: 5 * time.Second,
	}
	log.Printf("KGRSN Go backend listening on %s", server.Addr)
	log.Fatal(server.ListenAndServe())
}

func healthHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			methodNotAllowed(w)
			return
		}
		if err := db.PingContext(r.Context()); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "degraded", "database": "disconnected"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "healthy", "database": "connected"})
	}
}

func meHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := r.Context().Value(userIDKey).(int)
		if !ok {
			writeError(w, http.StatusUnauthorized, "Token tidak valid")
			return
		}
		user, _, err := findUserByID(r.Context(), db, userID)
		if err == sql.ErrNoRows {
			writeError(w, http.StatusNotFound, "User tidak ditemukan")
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "Gagal mengambil profile")
			return
		}
		writeJSON(w, http.StatusOK, user)
	}
}

func corsMiddleware(origin string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, detail string) {
	writeJSON(w, status, map[string]string{"detail": detail})
}

func methodNotAllowed(w http.ResponseWriter) {
	writeError(w, http.StatusMethodNotAllowed, "Method tidak diizinkan")
}
