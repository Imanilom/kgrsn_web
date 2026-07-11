from pydantic_settings import BaseSettings
from typing import Optional
import os


class Settings(BaseSettings):
    # Database
    DB_HOST: str = "localhost"
    DB_PORT: int = 3306
    DB_USER: str = "root"
    DB_PASSWORD: str = ""
    DB_NAME: str = "kgrsn_db"

    # JWT
    SECRET_KEY: str = "ganti-ini-dengan-random-string-yang-sangat-panjang"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8 jam

    # Directories
    UPLOAD_DIR: str = "uploads"
    GENERATED_DIR: str = "generated"

    # Business Logic
    MARGIN_PERSEN: float = 0.15  # 15% margin harga jual
    TARIF_PORSI_KECIL: int = 8000   # Rp 8.000 per penerima manfaat (porsi kecil)
    TARIF_PORSI_BESAR: int = 10000  # Rp 10.000 per penerima manfaat (porsi besar)


    # Company Info (untuk dokumen)
    COMPANY_NAME: str = "KGRSN Supply Management"
    COMPANY_ADDRESS: str = "Jakarta, Indonesia"
    COMPANY_PHONE: str = "+62-xxx-xxxx-xxxx"

    @property
    def DATABASE_URL(self) -> str:
        return (
            f"mysql+pymysql://{self.DB_USER}:{self.DB_PASSWORD}"
            f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
        )

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()

# Buat direktori jika belum ada
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(settings.GENERATED_DIR, exist_ok=True)
os.makedirs(os.path.join(settings.GENERATED_DIR, "invoices"), exist_ok=True)
os.makedirs(os.path.join(settings.GENERATED_DIR, "surat_jalan"), exist_ok=True)
