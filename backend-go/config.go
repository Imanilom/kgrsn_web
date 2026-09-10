package main

import (
	"os"
	"strconv"
)

type Config struct {
	Host            string
	Port            string
	User            string
	Password        string
	Database        string
	HTTPPort        string
	JWTSecret       string
	JWTExpiryHours  int
	AllowedOrigin   string
}

func loadConfig() Config {
	return Config{
		Host:           env("DB_HOST", "localhost"),
		Port:           env("DB_PORT", "3306"),
		User:           env("DB_USER", "root"),
		Password:       env("DB_PASSWORD", ""),
		Database:       env("DB_NAME", "kgrsn_db"),
		HTTPPort:       env("HTTP_PORT", "8080"),
		JWTSecret:      env("SECRET_KEY", "ganti-ini-dengan-random-string-yang-sangat-panjang"),
		JWTExpiryHours: envInt("ACCESS_TOKEN_EXPIRE_HOURS", 8),
		AllowedOrigin:  env("CORS_ORIGIN", "http://localhost:3000"),
	}
}

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func envInt(key string, fallback int) int {
	value, err := strconv.Atoi(env(key, ""))
	if err != nil || value <= 0 {
		return fallback
	}
	return value
}
