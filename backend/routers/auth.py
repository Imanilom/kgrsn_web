"""Auth router - login dan manajemen user."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import date
import models, schemas, auth
from database import get_db

router = APIRouter()


@router.post("/login", response_model=schemas.TokenResponse)
def login(request: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == request.username).first()
    if not user or not auth.verify_password(request.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Username atau password salah")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Akun tidak aktif")
    role_val = user.role.value if hasattr(user.role, 'value') else str(user.role)
    token = auth.create_access_token({"sub": str(user.id), "role": role_val})
    return {"access_token": token, "token_type": "bearer", "user": user}


@router.get("/me", response_model=schemas.UserOut)
def get_me(current_user: models.User = Depends(auth.get_current_user)):
    return current_user


@router.get("/users", response_model=list[schemas.UserOut])
def get_users(
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(models.UserRole.super_admin, models.UserRole.admin)),
):
    return db.query(models.User).all()


@router.post("/users", response_model=schemas.UserOut)
def create_user(
    payload: schemas.UserCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(models.UserRole.super_admin, models.UserRole.admin)),
):
    if db.query(models.User).filter(models.User.username == payload.username).first():
        raise HTTPException(status_code=400, detail="Username sudah dipakai")
    user = models.User(
        username=payload.username,
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=auth.hash_password(payload.password),
        role=payload.role,
        dapur_id=payload.dapur_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/users/{user_id}", response_model=schemas.UserOut)
def update_user(
    user_id: int,
    payload: schemas.UserUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")
    # super_admin bisa update siapa saja; admin bisa update selain super_admin; user bisa update dirinya sendiri
    is_admin_or_above = current_user.role in (models.UserRole.super_admin, models.UserRole.admin)
    if not is_admin_or_above and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Akses ditolak")
    # Gunakan model_dump tanpa exclude_none agar dapur_id=None bisa di-clear eksplisit
    update_data = payload.model_dump(exclude={"password"}, exclude_unset=True)
    print(f"DEBUG update_data: {update_data}")
    for field, value in update_data.items():
        setattr(user, field, value)
    if payload.password:
        user.hashed_password = auth.hash_password(payload.password)
    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(auth.require_roles(models.UserRole.super_admin)),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")
    db.delete(user)
    db.commit()
    return {"message": "User berhasil dihapus"}
