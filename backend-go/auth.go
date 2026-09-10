package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

type User struct {
	ID       int     `json:"id"`
	Username string  `json:"username"`
	Email    *string `json:"email"`
	FullName *string `json:"full_name"`
	Role     string  `json:"role"`
	DapurID  *int    `json:"dapur_id"`
	IsActive bool    `json:"is_active"`
}

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type tokenResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	User        User   `json:"user"`
}

type claims struct {
	Role string `json:"role"`
	jwt.RegisteredClaims
}

type contextKey string

const userIDKey contextKey = "user_id"

func loginHandler(db *sql.DB, cfg Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			methodNotAllowed(w)
			return
		}
		var request loginRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil || request.Username == "" || request.Password == "" {
			writeError(w, http.StatusBadRequest, "Username dan password wajib diisi")
			return
		}

		user, passwordHash, err := findUser(r.Context(), db, request.Username)
		if err != nil || bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(request.Password)) != nil {
			writeError(w, http.StatusUnauthorized, "Username atau password salah")
			return
		}
		if !user.IsActive {
			writeError(w, http.StatusForbidden, "Akun tidak aktif")
			return
		}

		now := time.Now()
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims{
			Role: user.Role,
			RegisteredClaims: jwt.RegisteredClaims{
				Subject:   jsonInt(user.ID),
				IssuedAt:  jwt.NewNumericDate(now),
				ExpiresAt: jwt.NewNumericDate(now.Add(time.Duration(cfg.JWTExpiryHours) * time.Hour)),
			},
		})
		signed, err := token.SignedString([]byte(cfg.JWTSecret))
		if err != nil {
			writeError(w, http.StatusInternalServerError, "Gagal membuat token")
			return
		}
		writeJSON(w, http.StatusOK, tokenResponse{AccessToken: signed, TokenType: "bearer", User: user})
	}
}

func findUser(ctx context.Context, db *sql.DB, username string) (User, string, error) {
	var user User
	var passwordHash string
	err := db.QueryRowContext(ctx, `
		SELECT id, username, email, full_name, hashed_password, role, dapur_id, is_active
		FROM users WHERE username = ? LIMIT 1`, username).
		Scan(&user.ID, &user.Username, &user.Email, &user.FullName, &passwordHash, &user.Role, &user.DapurID, &user.IsActive)
	return user, passwordHash, err
}

func findUserByID(ctx context.Context, db *sql.DB, userID int) (User, string, error) {
	var user User
	var passwordHash string
	err := db.QueryRowContext(ctx, `
		SELECT id, username, email, full_name, hashed_password, role, dapur_id, is_active
		FROM users WHERE id = ? LIMIT 1`, userID).
		Scan(&user.ID, &user.Username, &user.Email, &user.FullName, &passwordHash, &user.Role, &user.DapurID, &user.IsActive)
	return user, passwordHash, err
}

func requireAuth(db *sql.DB, cfg Config, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			writeError(w, http.StatusUnauthorized, "Token tidak ditemukan")
			return
		}
		tokenString := strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
		parsed, err := jwt.ParseWithClaims(tokenString, &claims{}, func(token *jwt.Token) (any, error) {
			return []byte(cfg.JWTSecret), nil
		})
		if err != nil || !parsed.Valid {
			writeError(w, http.StatusUnauthorized, "Token tidak valid")
			return
		}
		jwtClaims, ok := parsed.Claims.(*claims)
		if !ok {
			writeError(w, http.StatusUnauthorized, "Token tidak valid")
			return
		}
		userID, err := strconv.Atoi(jwtClaims.Subject)
		if err != nil || userID <= 0 {
			writeError(w, http.StatusUnauthorized, "Token tidak valid")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), userIDKey, userID)))
	})
}

func jsonInt(value int) string {
	return strconv.Itoa(value)
}
