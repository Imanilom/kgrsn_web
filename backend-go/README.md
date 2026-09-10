# KGRSN Go Backend

Backend Go untuk migrasi bertahap dari FastAPI. Aplikasi ini menggunakan database MySQL yang sama dan tidak menjalankan migrasi schema otomatis.

## Prasyarat

- Go 1.21 atau lebih baru
- MySQL database KGRSN yang sudah berjalan

## Menjalankan

```powershell
$env:DB_HOST = "localhost"
$env:DB_PORT = "3306"
$env:DB_USER = "root"
$env:DB_PASSWORD = ""
$env:DB_NAME = "kgrsn_db"
$env:SECRET_KEY = "ganti-ini-dengan-secret-yang-sama-dengan-fastapi"
go mod tidy
go run .
```

Server berjalan di `http://localhost:8080`.

Endpoints yang tersedia pada fase fondasi:

- `GET /health`
- `POST /api/auth/login`
- `GET /api/auth/me` (terlindungi JWT)

Password hash bcrypt dan nilai `SECRET_KEY` harus sama dengan backend Python agar login dan token tetap kompatibel.
