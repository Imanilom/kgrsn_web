from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import models, auth
from database import get_db
import requests

router = APIRouter(prefix="/notifikasi", tags=["Notifikasi"])

class NotificationOut(BaseModel):
    id: int
    title: str
    message: str
    is_read: bool
    notif_type: str
    link: Optional[str]
    created_at: datetime
    class Config:
        from_attributes = True

@router.get("/", response_model=List[NotificationOut])
def get_my_notifications(
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    notifs = (
        db.query(models.Notification)
        .filter(models.Notification.user_id == current_user.id)
        .order_by(models.Notification.created_at.desc())
        .limit(limit)
        .all()
    )
    return notifs

@router.put("/{notif_id}/read")
def mark_as_read(
    notif_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    notif = db.query(models.Notification).filter(models.Notification.id == notif_id, models.Notification.user_id == current_user.id).first()
    if notif:
        notif.is_read = True
        db.commit()
    return {"status": "ok"}

@router.put("/read-all")
def mark_all_as_read(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    db.query(models.Notification).filter(
        models.Notification.user_id == current_user.id,
        models.Notification.is_read == False
    ).update({"is_read": True})
    db.commit()
    return {"status": "ok"}

# ── Utility for sending notifications ─────────────────────────────────────
def send_notification(db: Session, user_id: int, title: str, message: str, notif_type: models.NotifType, link: str = None):
    new_notif = models.Notification(
        user_id=user_id,
        title=title,
        message=message,
        notif_type=notif_type,
        link=link
    )
    db.add(new_notif)
    db.commit()

    # Also try to send WhatsApp via wa-bot Gateway if user is admin or specified
    # Cek user
    user = db.query(models.User).filter(models.User.id == user_id).first()
    # Jika user ini admin/super_admin, atau ingin mengirim notif ke nomor tertentu, di sini tempatnya.
    # Harap perhatikan bahwa user perlu field no_wa atau semacamnya. Jika tidak ada, pakai default admin number atau simpan no HP di tabel user.
    # Karena tabel user belum ada no WA spesifik di kode saat ini, kita bisa mock ke endpoint wa-bot jika ada nomor WA.
    # Sebagai contoh, kita panggil secara sinkron/asinkron.
    # Untuk versi production, disarankan menggunakan background_tasks.
