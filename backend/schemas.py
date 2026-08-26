"""
Pydantic schemas untuk request/response validation.
"""
from pydantic import BaseModel, ConfigDict, field_validator
from typing import Optional, List, Any
from datetime import date, datetime
from decimal import Decimal
import models


# ─── Auth ─────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


# ─── User ─────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    username: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    password: str
    role: models.UserRole = models.UserRole.operator
    dapur_id: Optional[int] = None
    rekening: Optional[str] = None
    nama_bank: Optional[str] = None
    nama_rekening: Optional[str] = None


class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[models.UserRole] = None
    dapur_id: Optional[int] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None
    rekening: Optional[str] = None
    nama_bank: Optional[str] = None
    nama_rekening: Optional[str] = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    email: Optional[str]
    full_name: Optional[str]
    role: models.UserRole
    dapur_id: Optional[int]
    is_active: bool
    rekening: Optional[str] = None
    nama_bank: Optional[str] = None
    nama_rekening: Optional[str] = None
    created_at: Optional[datetime]

    @field_validator("role", mode="before")
    @classmethod
    def coerce_role(cls, v):
        """Fallback ke 'operator' jika nilai role di DB tidak valid (data lama)."""
        try:
            return models.UserRole(v)
        except (ValueError, KeyError):
            return models.UserRole.operator


# ─── Dapur ────────────────────────────────────────────────────────────────────

class DapurCreate(BaseModel):
    kode: str
    nama: str
    alamat: Optional[str] = None
    kontak: Optional[str] = None
    email: Optional[str] = None


class DapurUpdate(BaseModel):
    nama: Optional[str] = None
    alamat: Optional[str] = None
    kontak: Optional[str] = None
    email: Optional[str] = None
    is_active: Optional[bool] = None


class DapurOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    kode: str
    nama: str
    alamat: Optional[str]
    kontak: Optional[str]
    email: Optional[str]
    is_active: bool
    created_at: Optional[datetime]


# ─── Jadwal PM ────────────────────────────────────────────────────────────────

class JadwalPMCreate(BaseModel):
    dapur_id: int
    tanggal: date
    jumlah_pm: int
    jenis_porsi: str = "kecil"  # "kecil" | "besar"
    catatan: Optional[str] = None


class JadwalPMBulkCreate(BaseModel):
    dapur_id: int
    dari_tanggal: date
    sampai_tanggal: date
    jumlah_pm: int
    jenis_porsi: str = "kecil"
    catatan: Optional[str] = None


class JadwalPMUpdate(BaseModel):
    jumlah_pm: Optional[int] = None
    jenis_porsi: Optional[str] = None
    catatan: Optional[str] = None


class JadwalPMOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    dapur_id: int
    dapur: Optional[DapurOut]
    tanggal: date
    jumlah_pm: int
    jenis_porsi: str
    pagu_harian: Decimal
    catatan: Optional[str]
    created_at: Optional[datetime]
    # Computed fields (not from DB, injected by endpoint)
    terpakai_harian: Optional[Decimal] = None
    sisa_pagu_harian: Optional[Decimal] = None


class PaguCheckOut(BaseModel):
    tanggal: date
    jadwal_ada: bool
    # Breakdown per jenis porsi
    jumlah_pm_kecil: int = 0
    jumlah_pm_besar: int = 0
    pagu_kecil: Decimal = Decimal(0)
    pagu_besar: Decimal = Decimal(0)
    # Combined daily (total kecil + besar)
    jumlah_pm: int = 0          # total semua PM
    jenis_porsi: str = "kecil"  # jenis utama (backward compat)
    pagu_harian: Decimal = Decimal(0)       # total = kecil + besar
    terpakai_harian: Decimal = Decimal(0)
    sisa_pagu_harian: Decimal = Decimal(0)
    over_harian: bool = False
    # Weekly stats
    minggu_dari: Optional[date] = None
    minggu_sampai: Optional[date] = None
    limit_mingguan: Decimal = Decimal(0)
    terpakai_mingguan: Decimal = Decimal(0)
    sisa_limit_mingguan: Decimal = Decimal(0)
    over_mingguan: bool = False


class WeeklySummaryDayOut(BaseModel):
    tanggal: date
    jumlah_pm_kecil: int = 0
    jumlah_pm_besar: int = 0
    pagu_kecil: Decimal = Decimal(0)
    pagu_besar: Decimal = Decimal(0)
    pagu_total: Decimal = Decimal(0)
    terpakai: Decimal = Decimal(0)
    sisa: Decimal = Decimal(0)
    over: bool = False


class WeeklySummaryDapurOut(BaseModel):
    dapur_id: int
    dapur_nama: str
    dapur_kode: str
    tanggal_mulai: date
    tanggal_selesai: date
    total_pagu: Decimal
    total_terpakai: Decimal
    total_sisa: Decimal
    persen_terpakai: float = 0.0
    days: List[WeeklySummaryDayOut] = []

# ─── Master Item ──────────────────────────────────────────────────────────────

class MasterItemCreate(BaseModel):
    kode_item: str
    nama_item: str
    satuan: Optional[str] = None
    kategori: Optional[str] = None
    deskripsi: Optional[str] = None
    alias: Optional[str] = None     # comma-separated alternative names


class MasterItemUpdate(BaseModel):
    nama_item: Optional[str] = None
    satuan: Optional[str] = None
    kategori: Optional[str] = None
    deskripsi: Optional[str] = None
    alias: Optional[str] = None
    is_active: Optional[bool] = None


class MasterItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    kode_item: str
    nama_item: str
    satuan: Optional[str]
    kategori: Optional[str]
    deskripsi: Optional[str]
    alias: Optional[str]
    is_active: bool
    created_at: Optional[datetime]


# ─── Master Harga ─────────────────────────────────────────────────────────────

class MasterHargaCreate(BaseModel):
    item_id: int
    harga_beli: Decimal
    harga_jual: Decimal
    supplier: Optional[str] = None
    berlaku_dari: date


class MasterHargaUpdate(BaseModel):
    harga_beli: Optional[Decimal] = None
    harga_jual: Optional[Decimal] = None
    supplier: Optional[str] = None
    berlaku_dari: Optional[date] = None
    berlaku_sampai: Optional[date] = None


class MasterHargaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    item_id: int
    item: Optional[MasterItemOut]
    harga_beli: Decimal
    harga_jual: Decimal
    margin_persen: Decimal
    supplier: Optional[str]
    berlaku_dari: date
    berlaku_sampai: Optional[date]
    created_at: Optional[datetime]


# ─── PO ───────────────────────────────────────────────────────────────────────

class PODetailCreate(BaseModel):
    item_id: Optional[int] = None
    nama_item_raw: Optional[str] = None
    qty: Decimal
    satuan: Optional[str] = None
    harga_satuan: Decimal
    harga_jual: Decimal = 0
    catatan: Optional[str] = None


class PODetailUpdate(BaseModel):
    item_id: Optional[int] = None
    nama_item_raw: Optional[str] = None
    qty: Optional[Decimal] = None
    satuan: Optional[str] = None
    harga_satuan: Optional[Decimal] = None
    harga_jual: Optional[Decimal] = None
    catatan: Optional[str] = None


class PODetailOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    po_id: int
    item_id: Optional[int]
    item: Optional[MasterItemOut]
    nama_item_raw: Optional[str]
    qty: Decimal
    satuan: Optional[str]
    harga_satuan: Decimal
    harga_jual: Decimal
    subtotal: Decimal
    catatan: Optional[str]


class POCreate(BaseModel):
    nomor_po: str
    dapur_id: int
    tanggal_po: date
    tanggal_kirim: Optional[date] = None
    catatan: Optional[str] = None
    jumlah_pm_kecil: int = 0
    jumlah_pm_besar: int = 0
    budget_kecil: Decimal = Decimal(0)
    budget_besar: Decimal = Decimal(0)
    jenis_po: Optional[str] = "bahan_baku"   # bahan_baku | ops
    details: List[PODetailCreate] = []


class POUpdate(BaseModel):
    tanggal_po: Optional[date] = None
    tanggal_kirim: Optional[date] = None
    catatan: Optional[str] = None
    status: Optional[models.POStatus] = None
    jumlah_pm_kecil: Optional[int] = None
    jumlah_pm_besar: Optional[int] = None
    budget_kecil: Optional[Decimal] = None
    budget_besar: Optional[Decimal] = None


class POOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    nomor_po: str
    dapur_id: int
    dapur: Optional[DapurOut]
    tanggal_po: date
    tanggal_kirim: Optional[date]
    status: models.POStatus
    pdf_path: Optional[str]
    total_nilai: Decimal
    jumlah_pm_kecil: int
    jumlah_pm_besar: int
    budget_kecil: Decimal
    budget_besar: Decimal
    catatan: Optional[str]
    jenis_po: Optional[str] = "bahan_baku"
    details: List[PODetailOut] = []
    created_at: Optional[datetime]
    updated_at: Optional[datetime]


class BudgetBreakdownOut(BaseModel):
    """Budget breakdown dari JadwalPM untuk dapur pada tanggal tertentu."""
    dapur_id: int
    tanggal: date
    jumlah_pm_kecil: int
    jumlah_pm_besar: int
    budget_kecil: Decimal
    budget_besar: Decimal
    total_budget_pm: Decimal


# ─── PO Realisasi ─────────────────────────────────────────────────────────────

class PORealisasiDetailCreate(BaseModel):
    po_detail_id: Optional[int] = None
    item_id: Optional[int] = None
    nama_item_raw: Optional[str] = None
    qty_realisasi: Decimal
    satuan: Optional[str] = None
    harga_satuan: Decimal
    catatan: Optional[str] = None


class PORealisasiDetailUpdate(BaseModel):
    qty_realisasi: Optional[Decimal] = None
    harga_satuan: Optional[Decimal] = None
    catatan: Optional[str] = None


class PORealisasiDetailOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    realisasi_id: int
    po_detail_id: Optional[int]
    item_id: Optional[int]
    item: Optional[MasterItemOut]
    nama_item_raw: Optional[str]
    qty_po: Decimal
    qty_realisasi: Decimal
    satuan: Optional[str]
    harga_satuan: Decimal
    harga_jual: Decimal
    subtotal: Decimal
    subtotal_jual: Decimal
    catatan: Optional[str]


class PORealisasiCreate(BaseModel):
    po_id: int
    tanggal_realisasi: date
    catatan: Optional[str] = None
    # Jika kosong, akan di-copy dari PO asli dengan qty_realisasi = qty_po
    details: Optional[List[PORealisasiDetailCreate]] = None


class PORealisasiUpdate(BaseModel):
    tanggal_realisasi: Optional[date] = None
    catatan: Optional[str] = None
    status: Optional[models.RealisasiStatus] = None


class PORealisasiOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    nomor_realisasi: str
    po_id: int
    po: Optional[POOut]
    dapur_id: int
    dapur: Optional[DapurOut]
    tanggal_realisasi: date
    status: models.RealisasiStatus
    total_nilai: Decimal
    total_nilai_jual: Decimal
    catatan: Optional[str]
    details: List[PORealisasiDetailOut] = []
    created_at: Optional[datetime]
    updated_at: Optional[datetime]


# ─── Rekap Minggu ─────────────────────────────────────────────────────────────

class RekapMingguDetailOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    rekap_id: int
    tanggal: date
    dapur_id: int
    dapur: Optional[DapurOut]
    item_id: Optional[int]
    item: Optional[MasterItemOut]
    nama_item: str
    satuan: Optional[str]
    qty_total: Decimal
    harga_beli: Decimal
    harga_jual: Decimal
    subtotal_beli: Decimal
    subtotal_jual: Decimal


class RekapMingguCreate(BaseModel):
    tanggal_mulai: date   # Harus Senin
    tanggal_selesai: date  # Harus Minggu
    catatan: Optional[str] = None


class RekapMingguOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    nomor_rekap: str
    tanggal_mulai: date
    tanggal_selesai: date
    status: models.RekapStatus
    total_nilai_beli: Decimal
    total_nilai_jual: Decimal
    catatan: Optional[str]
    invoice_path: Optional[str]
    details: List[RekapMingguDetailOut] = []
    created_at: Optional[datetime]


# ─── Invoice (Update) ─────────────────────────────────────────────────────────

class InvoiceCreate(BaseModel):
    po_id: Optional[int] = None
    realisasi_id: Optional[int] = None
    tanggal_invoice: date
    jatuh_tempo: Optional[date] = None
    catatan: Optional[str] = None
    is_draft: bool = False


class InvoiceUpdate(BaseModel):
    jatuh_tempo: Optional[date] = None
    catatan: Optional[str] = None
    status: Optional[models.InvoiceStatus] = None


class InvoiceDetailCreate(BaseModel):
    po_detail_id: Optional[int] = None
    nama_item: str
    qty: Decimal
    qty_po: Optional[Decimal] = None
    qty_realisasi: Optional[Decimal] = None
    satuan: Optional[str] = None
    harga_beli: Decimal = Decimal(0)
    harga_jual: Decimal = Decimal(0)


class InvoiceDetailUpdate(BaseModel):
    harga_jual: Optional[Decimal] = None
    harga_beli: Optional[Decimal] = None
    qty: Optional[Decimal] = None
    satuan: Optional[str] = None


class InvoiceDetailOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    invoice_id: int
    nama_item: str
    qty: Decimal
    qty_po: Optional[Decimal] = None
    qty_realisasi: Optional[Decimal] = None
    satuan: Optional[str]
    harga_beli: Decimal
    harga_jual: Decimal
    subtotal: Decimal

    @property
    def margin_persen(self) -> Optional[float]:
        if self.harga_beli and float(self.harga_beli) > 0:
            return round((float(self.harga_jual) - float(self.harga_beli)) / float(self.harga_beli) * 100, 2)
        return None


class InvoiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    nomor_invoice: str
    po_id: Optional[int]
    realisasi_id: Optional[int]
    dapur_id: Optional[int]
    dapur: Optional[DapurOut]
    tanggal_invoice: date
    jatuh_tempo: Optional[date]
    subtotal: Decimal
    total: Decimal
    status: models.InvoiceStatus
    is_draft: bool
    pdf_path: Optional[str]
    catatan: Optional[str]
    details: List[InvoiceDetailOut] = []
    created_at: Optional[datetime]


# ─── Surat Jalan ──────────────────────────────────────────────────────────────

class SJDetailOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    sj_id: int
    nama_item: str
    qty: Decimal
    satuan: Optional[str]
    keterangan: Optional[str]


class SuratJalanCreate(BaseModel):
    po_id: Optional[int] = None   # Tidak wajib — sudah ada di path URL (/generate/{po_id})
    tanggal_kirim: date
    pengirim: Optional[str] = None
    penerima: Optional[str] = None
    catatan: Optional[str] = None


class SuratJalanUpdate(BaseModel):
    tanggal_kirim: Optional[date] = None
    pengirim: Optional[str] = None
    penerima: Optional[str] = None
    status: Optional[models.SJStatus] = None
    catatan: Optional[str] = None


class SuratJalanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    nomor_sj: str
    po_id: int
    dapur_id: int
    dapur: Optional[DapurOut]
    tanggal_kirim: date
    pengirim: Optional[str]
    penerima: Optional[str]
    status: models.SJStatus
    pdf_path: Optional[str]
    catatan: Optional[str]
    details: List[SJDetailOut] = []
    created_at: Optional[datetime]


# ─── RAB ──────────────────────────────────────────────────────────────────────

class RABDetailCreate(BaseModel):
    item_id: Optional[int] = None
    nama_item: str
    qty_anggaran: Decimal
    harga_anggaran: Decimal


class RABDetailUpdate(BaseModel):
    qty_realisasi: Optional[Decimal] = None
    harga_realisasi: Optional[Decimal] = None


class RABDetailOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    rab_id: int
    item_id: Optional[int]
    item: Optional[MasterItemOut]
    nama_item: str
    qty_anggaran: Decimal
    harga_anggaran: Decimal
    subtotal_anggaran: Decimal
    qty_realisasi: Decimal
    harga_realisasi: Decimal
    subtotal_realisasi: Decimal


class RABCreate(BaseModel):
    dapur_id: int
    periode_bulan: int
    periode_tahun: int
    catatan: Optional[str] = None
    details: List[RABDetailCreate] = []


class RABUpdate(BaseModel):
    catatan: Optional[str] = None
    status: Optional[models.RABStatus] = None


class RABOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    dapur_id: int
    dapur: Optional[DapurOut]
    periode_bulan: int
    periode_tahun: int
    total_anggaran: Decimal
    total_realisasi: Decimal
    status: models.RABStatus
    catatan: Optional[str]
    details: List[RABDetailOut] = []
    created_at: Optional[datetime]


# ─── Supplier ─────────────────────────────────────────────────────────────────

class SupplierCreate(BaseModel):
    kode: str
    nama: str
    alamat: Optional[str] = None
    kontak: Optional[str] = None
    email: Optional[str] = None
    kategori: Optional[str] = None
    terms_pembayaran: int = 0
    rekening: Optional[str] = None
    nama_bank: Optional[str] = None


class SupplierUpdate(BaseModel):
    nama: Optional[str] = None
    alamat: Optional[str] = None
    kontak: Optional[str] = None
    email: Optional[str] = None
    kategori: Optional[str] = None
    terms_pembayaran: Optional[int] = None
    rekening: Optional[str] = None
    nama_bank: Optional[str] = None
    is_active: Optional[bool] = None


class SupplierOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    kode: str
    nama: str
    alamat: Optional[str]
    kontak: Optional[str]
    email: Optional[str]
    kategori: Optional[str]
    terms_pembayaran: int
    rekening: Optional[str]
    nama_bank: Optional[str]
    is_active: bool
    created_at: Optional[datetime]


# ─── Hutang Supplier ─────────────────────────────────────────────────────────

class HutangCreate(BaseModel):
    supplier_id: int
    po_id: Optional[int] = None
    tanggal: date
    jatuh_tempo: Optional[date] = None
    jumlah: Decimal
    deskripsi: Optional[str] = None


class HutangUpdate(BaseModel):
    jatuh_tempo: Optional[date] = None
    deskripsi: Optional[str] = None


class PembayaranHutangCreate(BaseModel):
    tanggal_bayar: date
    jumlah_bayar: Decimal
    metode: Optional[str] = None
    referensi: Optional[str] = None
    catatan: Optional[str] = None


class PembayaranHutangOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    hutang_id: int
    tanggal_bayar: date
    jumlah_bayar: Decimal
    metode: Optional[str]
    referensi: Optional[str]
    catatan: Optional[str]
    bukti_bayar_path: Optional[str] = None
    created_at: Optional[datetime]


class HutangOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    nomor_hutang: str
    supplier_id: int
    supplier: Optional[SupplierOut]
    po_id: Optional[int]
    tanggal: date
    jatuh_tempo: Optional[date]
    jumlah: Decimal
    jumlah_terbayar: Decimal
    sisa: Decimal
    status: models.HutangStatus
    deskripsi: Optional[str]
    pembayaran_list: List[PembayaranHutangOut] = []
    created_at: Optional[datetime]


# ─── Piutang Dapur ───────────────────────────────────────────────────────────

class PiutangCreate(BaseModel):
    invoice_id: int
    dapur_id: int
    jumlah: Decimal
    jatuh_tempo: Optional[date] = None


class PiutangBayarCreate(BaseModel):
    jumlah_bayar: Decimal
    catatan: Optional[str] = None


class PiutangOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    invoice_id: int
    dapur_id: int
    dapur: Optional[DapurOut]
    jumlah: Decimal
    jumlah_terbayar: Decimal
    sisa: Decimal
    status: models.PiutangStatus
    jatuh_tempo: Optional[date]
    created_at: Optional[datetime]


# ─── Operasional Cost ────────────────────────────────────────────────────────

class OperasionalCreate(BaseModel):
    tanggal: date
    kategori: models.KategoriOperasional
    deskripsi: str
    jumlah: Decimal
    periode_bulan: int
    periode_tahun: int
    catatan: Optional[str] = None


class OperasionalUpdate(BaseModel):
    deskripsi: Optional[str] = None
    jumlah: Optional[Decimal] = None
    catatan: Optional[str] = None


class OperasionalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    tanggal: date
    kategori: models.KategoriOperasional
    deskripsi: str
    jumlah: Decimal
    periode_bulan: int
    periode_tahun: int
    catatan: Optional[str]
    created_at: Optional[datetime]


# ─── Rekap Pembelanjaan ─────────────────────────────────────────────────────

class RekapPembeljanDetailCreate(BaseModel):
    tanggal: date
    po_id: Optional[int] = None
    supplier_id: Optional[int] = None
    item_id: Optional[int] = None
    nama_item: str
    satuan: Optional[str] = None
    qty: Decimal
    harga_satuan: Decimal
    catatan: Optional[str] = None


class RekapPembeljanDetailOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    rekap_id: int
    tanggal: date
    po_id: Optional[int]
    supplier_id: Optional[int]
    supplier: Optional[SupplierOut]
    item_id: Optional[int]
    nama_item: str
    satuan: Optional[str]
    qty: Decimal
    harga_satuan: Decimal
    subtotal: Decimal
    sumber: str
    catatan: Optional[str]


class RekapPembeljanCreate(BaseModel):
    periode_bulan: int
    periode_tahun: int
    tanggal_mulai: date
    tanggal_selesai: date
    jenis: str = "otomatis"    # otomatis | manual
    catatan: Optional[str] = None
    details: Optional[List[RekapPembeljanDetailCreate]] = None  # Untuk manual


class RekapPembeljanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    nomor_rekap: str
    periode_bulan: int
    periode_tahun: int
    tanggal_mulai: date
    tanggal_selesai: date
    jenis: str
    total_pembelian: Decimal
    total_item: int
    status: models.RekapPembeljanStatus
    catatan: Optional[str]
    pdf_path: Optional[str]
    details: List[RekapPembeljanDetailOut] = []
    created_at: Optional[datetime]


# ─── Reimbursement ───────────────────────────────────────────────────────────

class ReimbursementCreate(BaseModel):
    realisasi_id: int
    dapur_id: int
    supplier_id: Optional[int] = None
    nama_item: str
    satuan: Optional[str] = None
    qty: Decimal
    harga_satuan: Decimal
    catatan: Optional[str] = None


class ReimbursementUpdate(BaseModel):
    supplier_id: Optional[int] = None
    status: Optional[str] = None
    catatan: Optional[str] = None


class ReimbursementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    realisasi_id: int
    dapur_id: int
    dapur: Optional[DapurOut]
    supplier_id: Optional[int]
    supplier: Optional[SupplierOut]
    nama_item: str
    satuan: Optional[str]
    qty: Decimal
    harga_satuan: Decimal
    total: Decimal
    status: str
    catatan: Optional[str]
    bukti_path: Optional[str]
    rekening_relawan: Optional[str] = None
    nama_bank_relawan: Optional[str] = None
    nama_relawan: Optional[str] = None
    created_at: Optional[datetime]


# ─── Belanja Summary Harian ───────────────────────────────────────────────────

class BelanjaSummaryHarian(BaseModel):
    tanggal: date
    total: float
    jumlah_transaksi: int
    supplier_list: List[str] = []


# ─── Dashboard ────────────────────────────────────────────────────────────────

class DashboardSummary(BaseModel):
    total_po: int
    po_draft: int
    po_approved: int
    total_invoice: int
    invoice_unpaid: int
    total_invoice_value: Decimal
    total_po_value: Decimal
    total_dapur: int


# ─── Realisasi Geser Request ──────────────────────────────────────────────────

class RealisasiGeserRequest(BaseModel):
    detail_id: int
    qty_geser: Decimal
    tanggal_baru: date


# Update forward references
TokenResponse.model_rebuild()

