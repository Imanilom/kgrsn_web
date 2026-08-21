from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
import models
import auth
from database import get_db, engine
from fastapi.encoders import jsonable_encoder
import json

router = APIRouter(prefix="/database", tags=["Database"])

@router.get("/export")
def export_database(_: models.User = Depends(auth.require_admin)):
    """Mengekspor seluruh database ke format JSON."""
    try:
        backup_data = []
        with engine.connect() as conn:
            # Sort tables by dependency (parents first)
            sorted_tables = models.Base.metadata.sorted_tables
            for table in sorted_tables:
                result = conn.execute(table.select())
                rows = [dict(row._mapping) for row in result]
                
                backup_data.append({
                    "table_name": table.name,
                    "rows": jsonable_encoder(rows)
                })
                
        return JSONResponse(
            content=backup_data,
            headers={"Content-Disposition": "attachment; filename=kgrsn_db_backup.json"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal mengekspor database: {str(e)}")

@router.post("/import")
async def import_database(
    file: UploadFile = File(...),
    _: models.User = Depends(auth.require_admin)
):
    """Mengimpor file JSON dan memulihkan database. (WARNING: TRUNCATE SEMUA TABEL)"""
    if not file.filename.endswith(".json"):
        raise HTTPException(status_code=400, detail="File harus berformat .json")
    
    try:
        content = await file.read()
        backup_data = json.loads(content)
        
        with engine.begin() as conn:
            # Matikan pengecekan foreign key
            conn.execute(text("SET FOREIGN_KEY_CHECKS = 0;"))
            
            # Hapus isi semua tabel agar bersih (Truncate/Delete All)
            sorted_tables = models.Base.metadata.sorted_tables
            for table in reversed(sorted_tables):
                conn.execute(table.delete())
            
            # Insert data berurutan
            for table_data in backup_data:
                table_name = table_data["table_name"]
                rows = table_data["rows"]
                
                # Temukan table object dari metadata
                target_table = None
                for t in sorted_tables:
                    if t.name == table_name:
                        target_table = t
                        break
                
                if target_table is not None and rows:
                    conn.execute(target_table.insert(), rows)
                    
            # Nyalakan pengecekan foreign key
            conn.execute(text("SET FOREIGN_KEY_CHECKS = 1;"))
            
        return {"message": "Database berhasil dipulihkan."}
        
    except Exception as e:
        # Coba nyalakan FK checks kembali jika terjadi error
        try:
            with engine.connect() as conn:
                conn.execute(text("SET FOREIGN_KEY_CHECKS = 1;"))
                conn.commit()
        except:
            pass
        raise HTTPException(status_code=500, detail=f"Gagal memulihkan database: {str(e)}")
