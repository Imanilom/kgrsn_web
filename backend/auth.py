"""
JWT Authentication utilities.
"""
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from config import settings
from database import get_db
import models

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token tidak valid atau sudah expired",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> models.User:
    payload = decode_token(credentials.credentials)
    user_id: int = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=401, detail="Token tidak valid")
    user = db.query(models.User).filter(models.User.id == int(user_id)).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User tidak ditemukan atau tidak aktif")
    return user


def require_roles(*roles: models.UserRole):
    """Factory untuk dependency yang memeriksa role."""
    def checker(current_user: models.User = Depends(get_current_user)):
        if current_user.role not in roles and current_user.role != models.UserRole.super_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Akses ditolak. Role yang dibutuhkan: {[r.value for r in roles]}"
            )
        return current_user
    return checker


# Shorthand dependencies
require_admin = require_roles(models.UserRole.admin, models.UserRole.super_admin)
require_finance = require_roles(models.UserRole.finance, models.UserRole.admin, models.UserRole.super_admin)
# Akuntan = bisa buat PO, PO Realisasi, lihat invoice mereka
require_akuntan = require_roles(
    models.UserRole.akuntan, models.UserRole.operator,
    models.UserRole.finance, models.UserRole.admin, models.UserRole.super_admin
)
require_operator = require_akuntan   # Alias untuk backward compat
