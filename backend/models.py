"""
Semua model SQLAlchemy untuk sistem PO Management.
"""
from sqlalchemy import (
    Column, Integer, String, Text, DateTime, Date,
    Numeric, Boolean, ForeignKey, Enum as SAEnum, JSON, UniqueConstraint
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import enum


# ─── Enums ────────────────────────────────────────────────────────────────────

class UserRole(str, enum.Enum):
    super_admin = "super_admin"
    admin = "admin"
    finance = "finance"
    akuntan = "akuntan"    # Dapat buat PO, PO Realisasi, terima invoice
    operator = "operator"  # Legacy


class POStatus(str, enum.Enum):
    draft = "draft"
    approved = "approved"
    delivered = "delivered"
    invoiced = "invoiced"
    cancelled = "cancelled"


class InvoiceStatus(str, enum.Enum):
    unpaid = "unpaid"
    paid = "paid"
    cancelled = "cancelled"


class SJStatus(str, enum.Enum):
    pending = "pending"
    sent = "sent"
    received = "received"


class RABStatus(str, enum.Enum):
    draft = "draft"
    approved = "approved"
    closed = "closed"


class RealisasiStatus(str, enum.Enum):
    draft = "draft"
    submitted = "submitted"   # Diajukan ke admin
    approved = "approved"     # Disetujui admin
    rejected = "rejected"


class RekapStatus(str, enum.Enum):
    draft = "draft"
    final = "final"           # Sudah jadi draft invoice


class HutangStatus(str, enum.Enum):
    belum_lunas = "belum_lunas"
    sebagian = "sebagian"
    lunas = "lunas"


class PiutangStatus(str, enum.Enum):
    belum_lunas = "belum_lunas"
    sebagian = "sebagian"
    lunas = "lunas"


class RekapPembeljanStatus(str, enum.Enum):
    draft = "draft"
    final = "final"


class KategoriOperasional(str, enum.Enum):
    gaji = "gaji"
    utilitas = "utilitas"        # Listrik, air, gas
    transport = "transport"
    sewa = "sewa"
    perawatan = "perawatan"
    marketing = "marketing"
    lainnya = "lainnya"


class JenisPorsi(str, enum.Enum):
    kecil = "kecil"  # Rp 8.000 / penerima manfaat
    besar = "besar"  # Rp 10.000 / penerima manfaat


# ─── Models ───────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(100), unique=True, nullable=True)
    full_name = Column(String(100), nullable=True)
    hashed_password = Column(String(255), nullable=False)
    role = Column(SAEnum(UserRole), default=UserRole.operator, nullable=False)
    dapur_id = Column(Integer, ForeignKey("dapur.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    dapur = relationship("Dapur")


class Dapur(Base):
    __tablename__ = "dapur"

    id = Column(Integer, primary_key=True, index=True)
    kode = Column(String(20), unique=True, nullable=False, index=True)
    nama = Column(String(100), nullable=False)
    alamat = Column(Text, nullable=True)
    kontak = Column(String(50), nullable=True)
    email = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    purchase_orders = relationship("PurchaseOrder", back_populates="dapur")
    invoices = relationship("Invoice", back_populates="dapur")
    rab_list = relationship("RAB", back_populates="dapur")
    jadwal_pm = relationship("JadwalPM", back_populates="dapur")
    realisasi_list = relationship("PORealisasi", back_populates="dapur")


class MasterItem(Base):
    __tablename__ = "master_item"

    id = Column(Integer, primary_key=True, index=True)
    kode_item = Column(String(50), unique=True, nullable=False, index=True)
    nama_item = Column(String(200), nullable=False, index=True)
    satuan = Column(String(20), nullable=True)         # kg, pcs, liter, dll
    kategori = Column(String(50), nullable=True)       # groceries, perishable, dll
    deskripsi = Column(Text, nullable=True)
    alias = Column(Text, nullable=True)                # JSON list of alternative names
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    harga_list = relationship("MasterHarga", back_populates="item")
    po_details = relationship("PODetail", back_populates="item")


class MasterHarga(Base):
    __tablename__ = "master_harga"

    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(Integer, ForeignKey("master_item.id"), nullable=False)
    harga_beli = Column(Numeric(15, 2), nullable=False, default=0)
    harga_jual = Column(Numeric(15, 2), nullable=False, default=0)  # Auto: harga_beli * 1.15
    margin_persen = Column(Numeric(5, 2), default=15.00)
    supplier = Column(String(100), nullable=True)
    berlaku_dari = Column(Date, nullable=False)
    berlaku_sampai = Column(Date, nullable=True)
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    # Relationships
    item = relationship("MasterItem", back_populates="harga_list")
    updated_by_user = relationship("User")


class PurchaseOrder(Base):
    __tablename__ = "purchase_order"

    id = Column(Integer, primary_key=True, index=True)
    nomor_po = Column(String(50), unique=True, nullable=False, index=True)
    dapur_id = Column(Integer, ForeignKey("dapur.id"), nullable=False)
    tanggal_po = Column(Date, nullable=False)
    tanggal_kirim = Column(Date, nullable=True)
    status = Column(SAEnum(POStatus), default=POStatus.draft)
    pdf_path = Column(String(500), nullable=True)            # Path ke file PDF asli
    total_nilai = Column(Numeric(15, 2), default=0)
    # Budget breakdown for PM (Penerima Manfaat)
    jumlah_pm_kecil = Column(Integer, default=0)             # Jumlah PM porsi kecil
    jumlah_pm_besar = Column(Integer, default=0)             # Jumlah PM porsi besar
    budget_kecil = Column(Numeric(15, 2), default=0)         # Rp 8.000 × jumlah_pm_kecil
    budget_besar = Column(Numeric(15, 2), default=0)         # Rp 10.000 × jumlah_pm_besar
    catatan = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    dapur = relationship("Dapur", back_populates="purchase_orders")
    details = relationship("PODetail", back_populates="po", cascade="all, delete-orphan")
    invoices = relationship("Invoice", back_populates="po")
    surat_jalan = relationship("SuratJalan", back_populates="po")
    realisasi_list = relationship("PORealisasi", back_populates="po")
    created_by_user = relationship("User", foreign_keys=[created_by])
    approved_by_user = relationship("User", foreign_keys=[approved_by])


class PODetail(Base):
    __tablename__ = "po_detail"

    id = Column(Integer, primary_key=True, index=True)
    po_id = Column(Integer, ForeignKey("purchase_order.id"), nullable=False)
    item_id = Column(Integer, ForeignKey("master_item.id"), nullable=True)  # Nullable sebelum di-map
    nama_item_raw = Column(String(200), nullable=True)    # Nama asli dari PDF
    qty = Column(Numeric(10, 3), default=0)
    satuan = Column(String(20), nullable=True)
    harga_satuan = Column(Numeric(15, 2), default=0)
    subtotal = Column(Numeric(15, 2), default=0)
    catatan = Column(Text, nullable=True)

    # Relationships
    po = relationship("PurchaseOrder", back_populates="details")
    item = relationship("MasterItem", back_populates="po_details")


class Invoice(Base):
    __tablename__ = "invoice"

    id = Column(Integer, primary_key=True, index=True)
    nomor_invoice = Column(String(50), unique=True, nullable=False, index=True)
    po_id = Column(Integer, ForeignKey("purchase_order.id"), nullable=True)  # Nullable jika dari rekap
    realisasi_id = Column(Integer, ForeignKey("po_realisasi.id"), nullable=True)  # Invoice dari realisasi
    dapur_id = Column(Integer, ForeignKey("dapur.id"), nullable=True)  # Nullable jika invoice konsolidasi
    tanggal_invoice = Column(Date, nullable=False)
    jatuh_tempo = Column(Date, nullable=True)
    subtotal = Column(Numeric(15, 2), default=0)
    total = Column(Numeric(15, 2), default=0)    # Sama dengan subtotal (no pajak)
    status = Column(SAEnum(InvoiceStatus), default=InvoiceStatus.unpaid)
    pdf_path = Column(String(500), nullable=True)
    catatan = Column(Text, nullable=True)
    is_draft = Column(Boolean, default=False)    # True = draft invoice / penawaran harga
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    paid_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    po = relationship("PurchaseOrder", back_populates="invoices")
    realisasi = relationship("PORealisasi", back_populates="invoices")
    dapur = relationship("Dapur", back_populates="invoices")
    details = relationship("InvoiceDetail", back_populates="invoice", cascade="all, delete-orphan")
    created_by_user = relationship("User")


class InvoiceDetail(Base):
    __tablename__ = "invoice_detail"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoice.id"), nullable=False)
    po_detail_id = Column(Integer, ForeignKey("po_detail.id"), nullable=True)
    nama_item = Column(String(200), nullable=False)
    qty = Column(Numeric(10, 3), default=0)
    qty_po = Column(Numeric(10, 3), nullable=True)         # Qty dari PO asli
    qty_realisasi = Column(Numeric(10, 3), nullable=True)  # Qty aktual realisasi
    satuan = Column(String(20), nullable=True)
    harga_jual = Column(Numeric(15, 2), default=0)    # harga beli × 1.15
    harga_beli = Column(Numeric(15, 2), default=0)
    subtotal = Column(Numeric(15, 2), default=0)

    # Relationships
    invoice = relationship("Invoice", back_populates="details")
    po_detail = relationship("PODetail")


class SuratJalan(Base):
    __tablename__ = "surat_jalan"

    id = Column(Integer, primary_key=True, index=True)
    nomor_sj = Column(String(50), unique=True, nullable=False, index=True)
    po_id = Column(Integer, ForeignKey("purchase_order.id"), nullable=False)
    dapur_id = Column(Integer, ForeignKey("dapur.id"), nullable=False)
    tanggal_kirim = Column(Date, nullable=False)
    pengirim = Column(String(100), nullable=True)
    penerima = Column(String(100), nullable=True)
    status = Column(SAEnum(SJStatus), default=SJStatus.pending)
    pdf_path = Column(String(500), nullable=True)
    catatan = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    po = relationship("PurchaseOrder", back_populates="surat_jalan")
    dapur = relationship("Dapur")
    details = relationship("SuratJalanDetail", back_populates="surat_jalan", cascade="all, delete-orphan")
    created_by_user = relationship("User")


class SuratJalanDetail(Base):
    __tablename__ = "surat_jalan_detail"

    id = Column(Integer, primary_key=True, index=True)
    sj_id = Column(Integer, ForeignKey("surat_jalan.id"), nullable=False)
    po_detail_id = Column(Integer, ForeignKey("po_detail.id"), nullable=True)
    nama_item = Column(String(200), nullable=False)
    qty = Column(Numeric(10, 3), default=0)
    satuan = Column(String(20), nullable=True)
    keterangan = Column(Text, nullable=True)

    # Relationships
    surat_jalan = relationship("SuratJalan", back_populates="details")


class RAB(Base):
    __tablename__ = "rab"

    id = Column(Integer, primary_key=True, index=True)
    dapur_id = Column(Integer, ForeignKey("dapur.id"), nullable=False)
    periode_bulan = Column(Integer, nullable=False)   # 1-12
    periode_tahun = Column(Integer, nullable=False)
    total_anggaran = Column(Numeric(15, 2), default=0)
    total_realisasi = Column(Numeric(15, 2), default=0)
    status = Column(SAEnum(RABStatus), default=RABStatus.draft)
    catatan = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    dapur = relationship("Dapur", back_populates="rab_list")
    details = relationship("RABDetail", back_populates="rab", cascade="all, delete-orphan")
    created_by_user = relationship("User")


class RABDetail(Base):
    __tablename__ = "rab_detail"

    id = Column(Integer, primary_key=True, index=True)
    rab_id = Column(Integer, ForeignKey("rab.id"), nullable=False)
    item_id = Column(Integer, ForeignKey("master_item.id"), nullable=True)
    nama_item = Column(String(200), nullable=False)
    qty_anggaran = Column(Numeric(10, 3), default=0)
    harga_anggaran = Column(Numeric(15, 2), default=0)
    subtotal_anggaran = Column(Numeric(15, 2), default=0)
    qty_realisasi = Column(Numeric(10, 3), default=0)
    harga_realisasi = Column(Numeric(15, 2), default=0)
    subtotal_realisasi = Column(Numeric(15, 2), default=0)

    # Relationships
    rab = relationship("RAB", back_populates="details")
    item = relationship("MasterItem")


class JadwalPM(Base):
    """Jadwal Penerima Manfaat per hari per dapur — dasar perhitungan pagu.
    
    Satu dapur dapat memiliki dua jenis porsi (kecil & besar) per hari.
    Pagu total harian = pagu_kecil + pagu_besar.
    """
    __tablename__ = "jadwal_pm"
    __table_args__ = (
        UniqueConstraint("dapur_id", "tanggal", "jenis_porsi", name="uq_jadwal_pm_dapur_tanggal_porsi"),
    )

    id = Column(Integer, primary_key=True, index=True)
    dapur_id = Column(Integer, ForeignKey("dapur.id"), nullable=False)
    tanggal = Column(Date, nullable=False)
    jumlah_pm = Column(Integer, nullable=False, default=0)
    jenis_porsi = Column(SAEnum(JenisPorsi), nullable=False, default=JenisPorsi.kecil)
    pagu_harian = Column(Numeric(15, 2), nullable=False, default=0)  # jumlah_pm × tarif
    catatan = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    # Relationships
    dapur = relationship("Dapur", back_populates="jadwal_pm")
    created_by_user = relationship("User")


class PORealisasi(Base):
    """
    Realisasi PO: qty aktual yang benar-benar dikirim/diterima.
    Dibuat oleh akuntan berdasarkan PO asli (qty bisa berubah).
    Invoice di-generate dari PO Realisasi (bukan PO asli).
    """
    __tablename__ = "po_realisasi"

    id = Column(Integer, primary_key=True, index=True)
    nomor_realisasi = Column(String(50), unique=True, nullable=False, index=True)
    po_id = Column(Integer, ForeignKey("purchase_order.id"), nullable=False)
    dapur_id = Column(Integer, ForeignKey("dapur.id"), nullable=False)
    tanggal_realisasi = Column(Date, nullable=False)
    status = Column(SAEnum(RealisasiStatus), default=RealisasiStatus.draft)
    total_nilai = Column(Numeric(15, 2), default=0)   # Harga beli (dari PO)
    total_nilai_jual = Column(Numeric(15, 2), default=0)  # Harga jual (×1.15)
    catatan = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    po = relationship("PurchaseOrder", back_populates="realisasi_list")
    dapur = relationship("Dapur", back_populates="realisasi_list")
    details = relationship("PORealisasiDetail", back_populates="realisasi", cascade="all, delete-orphan")
    invoices = relationship("Invoice", back_populates="realisasi")
    created_by_user = relationship("User", foreign_keys=[created_by])
    approved_by_user = relationship("User", foreign_keys=[approved_by])


class PORealisasiDetail(Base):
    __tablename__ = "po_realisasi_detail"

    id = Column(Integer, primary_key=True, index=True)
    realisasi_id = Column(Integer, ForeignKey("po_realisasi.id"), nullable=False)
    po_detail_id = Column(Integer, ForeignKey("po_detail.id"), nullable=True)  # Referensi ke PO asli
    item_id = Column(Integer, ForeignKey("master_item.id"), nullable=True)
    nama_item_raw = Column(String(200), nullable=True)
    qty_po = Column(Numeric(10, 3), default=0)         # Qty dari PO asli
    qty_realisasi = Column(Numeric(10, 3), default=0)  # Qty aktual
    satuan = Column(String(20), nullable=True)
    harga_satuan = Column(Numeric(15, 2), default=0)   # Harga beli
    harga_jual = Column(Numeric(15, 2), default=0)     # Harga jual (×1.15)
    subtotal = Column(Numeric(15, 2), default=0)       # qty_realisasi × harga_satuan
    subtotal_jual = Column(Numeric(15, 2), default=0)  # qty_realisasi × harga_jual
    catatan = Column(Text, nullable=True)

    # Relationships
    realisasi = relationship("PORealisasi", back_populates="details")
    po_detail = relationship("PODetail")
    item = relationship("MasterItem")


class RekapMinggu(Base):
    """
    Rekap konsolidasi semua PO Realisasi dalam satu minggu dari semua dapur.
    Admin membuat rekap ini lalu generate draft invoice/penawaran harga.
    """
    __tablename__ = "rekap_minggu"

    id = Column(Integer, primary_key=True, index=True)
    nomor_rekap = Column(String(50), unique=True, nullable=False, index=True)
    tanggal_mulai = Column(Date, nullable=False)   # Senin
    tanggal_selesai = Column(Date, nullable=False)  # Minggu
    status = Column(SAEnum(RekapStatus), default=RekapStatus.draft)
    total_nilai_beli = Column(Numeric(15, 2), default=0)
    total_nilai_jual = Column(Numeric(15, 2), default=0)
    catatan = Column(Text, nullable=True)
    invoice_path = Column(String(500), nullable=True)   # PDF draft invoice
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    details = relationship("RekapMingguDetail", back_populates="rekap", cascade="all, delete-orphan")
    created_by_user = relationship("User")


class RekapMingguDetail(Base):
    """Satu baris rekap = satu item × satu tanggal × satu dapur."""
    __tablename__ = "rekap_minggu_detail"

    id = Column(Integer, primary_key=True, index=True)
    rekap_id = Column(Integer, ForeignKey("rekap_minggu.id"), nullable=False)
    tanggal = Column(Date, nullable=False)
    dapur_id = Column(Integer, ForeignKey("dapur.id"), nullable=False)
    item_id = Column(Integer, ForeignKey("master_item.id"), nullable=True)
    nama_item = Column(String(200), nullable=False)
    satuan = Column(String(20), nullable=True)
    qty_total = Column(Numeric(10, 3), default=0)      # Total qty semua dapur
    harga_beli = Column(Numeric(15, 2), default=0)     # Dari master_harga saat ini
    harga_jual = Column(Numeric(15, 2), default=0)     # harga_beli × 1.15
    subtotal_beli = Column(Numeric(15, 2), default=0)
    subtotal_jual = Column(Numeric(15, 2), default=0)

    # Relationships
    rekap = relationship("RekapMinggu", back_populates="details")
    dapur = relationship("Dapur")
    item = relationship("MasterItem")


# ─── Supplier ─────────────────────────────────────────────────────────────────

class Supplier(Base):
    """Master data supplier/vendor bahan baku."""
    __tablename__ = "supplier"

    id = Column(Integer, primary_key=True, index=True)
    kode = Column(String(20), unique=True, nullable=False, index=True)
    nama = Column(String(150), nullable=False)
    alamat = Column(Text, nullable=True)
    kontak = Column(String(50), nullable=True)
    email = Column(String(100), nullable=True)
    kategori = Column(String(50), nullable=True)   # Bahan pokok, sembako, dll
    terms_pembayaran = Column(Integer, default=0)   # Jatuh tempo dalam hari
    rekening = Column(String(100), nullable=True)   # No rekening bank
    nama_bank = Column(String(50), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    hutang_list = relationship("HutangSupplier", back_populates="supplier")


class HutangSupplier(Base):
    """Hutang perusahaan ke supplier setelah menerima barang."""
    __tablename__ = "hutang_supplier"

    id = Column(Integer, primary_key=True, index=True)
    nomor_hutang = Column(String(50), unique=True, nullable=False, index=True)
    supplier_id = Column(Integer, ForeignKey("supplier.id"), nullable=False)
    po_id = Column(Integer, ForeignKey("purchase_order.id"), nullable=True)  # Referensi PO
    tanggal = Column(Date, nullable=False)
    jatuh_tempo = Column(Date, nullable=True)
    jumlah = Column(Numeric(15, 2), nullable=False, default=0)          # Total hutang
    jumlah_terbayar = Column(Numeric(15, 2), default=0)
    sisa = Column(Numeric(15, 2), default=0)                             # jumlah - terbayar
    status = Column(SAEnum(HutangStatus), default=HutangStatus.belum_lunas)
    deskripsi = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    supplier = relationship("Supplier", back_populates="hutang_list")
    po = relationship("PurchaseOrder")
    pembayaran_list = relationship("PembayaranHutang", back_populates="hutang", cascade="all, delete-orphan")
    created_by_user = relationship("User")


class PembayaranHutang(Base):
    """Riwayat pembayaran hutang ke supplier."""
    __tablename__ = "pembayaran_hutang"

    id = Column(Integer, primary_key=True, index=True)
    hutang_id = Column(Integer, ForeignKey("hutang_supplier.id"), nullable=False)
    tanggal_bayar = Column(Date, nullable=False)
    jumlah_bayar = Column(Numeric(15, 2), nullable=False)
    metode = Column(String(50), nullable=True)   # Transfer, tunai, cek
    referensi = Column(String(100), nullable=True)  # No. transfer / cek
    catatan = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    # Relationships
    hutang = relationship("HutangSupplier", back_populates="pembayaran_list")
    created_by_user = relationship("User")


class PiutangDapur(Base):
    """Piutang dari dapur — tagihan yang belum dibayar dapur."""
    __tablename__ = "piutang_dapur"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoice.id"), nullable=False, unique=True)
    dapur_id = Column(Integer, ForeignKey("dapur.id"), nullable=False)
    jumlah = Column(Numeric(15, 2), nullable=False, default=0)
    jumlah_terbayar = Column(Numeric(15, 2), default=0)
    sisa = Column(Numeric(15, 2), default=0)
    status = Column(SAEnum(PiutangStatus), default=PiutangStatus.belum_lunas)
    jatuh_tempo = Column(Date, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    invoice = relationship("Invoice")
    dapur = relationship("Dapur")


class OperasionalCost(Base):
    """Pengeluaran operasional bulanan (gaji, utilitas, transport, dll)."""
    __tablename__ = "operasional_cost"

    id = Column(Integer, primary_key=True, index=True)
    tanggal = Column(Date, nullable=False)
    kategori = Column(SAEnum(KategoriOperasional), nullable=False)
    deskripsi = Column(String(200), nullable=False)
    jumlah = Column(Numeric(15, 2), nullable=False)
    periode_bulan = Column(Integer, nullable=False)    # 1-12
    periode_tahun = Column(Integer, nullable=False)
    catatan = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    created_by_user = relationship("User")


# ─── Rekap Pembelanjaan Purchasing ────────────────────────────────────────────

class RekapPembelanjaan(Base):
    """
    Rekap konsolidasi pembelanjaan / pengeluaran bahan baku oleh purchasing.
    Bisa otomatis (dari PO approved/delivered) atau manual input.
    """
    __tablename__ = "rekap_pembelanjaan"

    id = Column(Integer, primary_key=True, index=True)
    nomor_rekap = Column(String(50), unique=True, nullable=False, index=True)
    periode_bulan = Column(Integer, nullable=False)    # 1-12
    periode_tahun = Column(Integer, nullable=False)
    tanggal_mulai = Column(Date, nullable=False)
    tanggal_selesai = Column(Date, nullable=False)
    jenis = Column(String(20), nullable=False, default="otomatis")  # otomatis | manual
    total_pembelian = Column(Numeric(15, 2), default=0)   # Total nilai beli
    total_item = Column(Integer, default=0)
    status = Column(SAEnum(RekapPembeljanStatus), default=RekapPembeljanStatus.draft)
    catatan = Column(Text, nullable=True)
    pdf_path = Column(String(500), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    details = relationship("RekapPembeljanDetail", back_populates="rekap", cascade="all, delete-orphan")
    created_by_user = relationship("User")


class RekapPembeljanDetail(Base):
    """Satu baris rekap pembelanjaan = satu item pada satu tanggal/PO."""
    __tablename__ = "rekap_pembeljan_detail"

    id = Column(Integer, primary_key=True, index=True)
    rekap_id = Column(Integer, ForeignKey("rekap_pembelanjaan.id"), nullable=False)
    tanggal = Column(Date, nullable=False)
    po_id = Column(Integer, ForeignKey("purchase_order.id"), nullable=True)   # Null jika manual
    supplier_id = Column(Integer, ForeignKey("supplier.id"), nullable=True)
    item_id = Column(Integer, ForeignKey("master_item.id"), nullable=True)
    nama_item = Column(String(200), nullable=False)
    satuan = Column(String(20), nullable=True)
    qty = Column(Numeric(10, 3), default=0)
    harga_satuan = Column(Numeric(15, 2), default=0)
    subtotal = Column(Numeric(15, 2), default=0)
    sumber = Column(String(20), default="po")   # po | manual
    catatan = Column(Text, nullable=True)

    # Relationships
    rekap = relationship("RekapPembelanjaan", back_populates="details")
    po = relationship("PurchaseOrder")
    supplier = relationship("Supplier")
    item = relationship("MasterItem")


# ─── Price History (untuk analisis tren harga) ───────────────────────────────

class PriceSumber(str, enum.Enum):
    excel_import  = "excel_import"
    po_realisasi  = "po_realisasi"
    manual        = "manual"


class PriceHistory(Base):
    """
    Histori harga pembelian per item per tanggal.
    Diisi dari:
    1. Import Excel (Rekap Mei-Juni 2026)
    2. Otomatis dari PO Realisasi yang diapprove
    3. Input manual
    """
    __tablename__ = "price_history"

    id          = Column(Integer, primary_key=True, index=True)
    item_id     = Column(Integer, ForeignKey("master_item.id"), nullable=True)
    nama_item   = Column(String(200), nullable=False, index=True)   # ternormalisasi
    tanggal     = Column(Date, nullable=False, index=True)
    harga_beli  = Column(Numeric(15, 2), nullable=True)
    harga_jual  = Column(Numeric(15, 2), nullable=True)
    qty         = Column(Numeric(10, 3), nullable=True)
    satuan      = Column(String(30), nullable=True)
    dapur       = Column(String(100), nullable=True)
    sumber      = Column(SAEnum(PriceSumber), default=PriceSumber.manual)
    created_at  = Column(DateTime, server_default=func.now())

    # Relationship
    item = relationship("MasterItem", foreign_keys=[item_id])


class HetCache(Base):
    """Cache hasil scraping HET dari Kepokmas agar tidak scrape setiap request."""
    __tablename__ = "het_cache"

    id              = Column(Integer, primary_key=True)
    nama_item       = Column(String(200), nullable=False, unique=True, index=True)
    nama_kepokmas   = Column(String(200), nullable=True)
    komoditas_id    = Column(Integer, nullable=True)
    het_harga       = Column(Numeric(15, 2), nullable=True)
    match_score     = Column(Numeric(5, 2), nullable=True)
    updated_at      = Column(DateTime, server_default=func.now(), onupdate=func.now())

