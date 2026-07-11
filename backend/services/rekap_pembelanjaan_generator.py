"""
Rekap Pembelanjaan PDF Generator menggunakan fpdf2.
Generate laporan pembelanjaan bahan baku purchasing dalam format PDF.
"""
from fpdf import FPDF
from fpdf.enums import XPos, YPos
from datetime import date
from config import settings
import os


def format_rupiah(value) -> str:
    try:
        val = float(value)
        return f"Rp {val:,.0f}".replace(",", ".")
    except (ValueError, TypeError):
        return "Rp 0"


def format_tanggal(d) -> str:
    if not d:
        return "-"
    BULAN = [
        "", "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
        "Jul", "Ags", "Sep", "Okt", "Nov", "Des"
    ]
    try:
        if isinstance(d, str):
            parts = d.split("-")
            if len(parts) == 3:
                return f"{int(parts[2])} {BULAN[int(parts[1])]} {parts[0]}"
        return f"{d.day} {BULAN[d.month]} {d.year}"
    except Exception:
        return str(d)


class RekapPDF(FPDF):
    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(150, 150, 150)
        self.cell(0, 10, f"Halaman {self.page_no()} | Dokumen ini digenerate secara otomatis", align="C")


def generate_rekap_pembelanjaan_pdf(rekap_data: dict, output_dir: str = None) -> str:
    """
    Generate PDF laporan rekap pembelanjaan purchasing.

    rekap_data: {
        "nomor_rekap": str,
        "periode": str,
        "tanggal_mulai": date,
        "tanggal_selesai": date,
        "jenis": str,        # otomatis | manual
        "total_pembelian": float,
        "total_item": int,
        "catatan": str,
        "details": [{"tanggal", "nama_item", "supplier", "satuan", "qty", "harga_satuan", "subtotal"}],
    }

    Returns: path ke file PDF
    """
    if output_dir is None:
        output_dir = os.path.join(settings.GENERATED_DIR, "rekap_pembelanjaan")
    os.makedirs(output_dir, exist_ok=True)

    pdf = RekapPDF(orientation="L", unit="mm", format="A4")  # Landscape untuk tabel lebar
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=20)

    # ── Header ─────────────────────────────────────────────────────────────────
    pdf.set_fill_color(15, 23, 42)   # Dark slate
    pdf.rect(0, 0, 297, 38, "F")

    pdf.set_xy(10, 8)
    pdf.set_font("Helvetica", "B", 17)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(140, 10, settings.COMPANY_NAME)

    pdf.set_xy(10, 21)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(148, 163, 184)
    pdf.cell(140, 5, settings.COMPANY_ADDRESS)

    # Label kanan
    pdf.set_xy(170, 6)
    pdf.set_font("Helvetica", "B", 18)
    pdf.set_text_color(34, 197, 94)    # Emerald
    pdf.cell(117, 12, "REKAP PEMBELANJAAN", align="R")

    pdf.set_xy(170, 20)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(148, 163, 184)
    pdf.cell(117, 5, rekap_data.get("nomor_rekap", ""), align="R")

    jenis_label = "OTOMATIS (dari PO)" if rekap_data.get("jenis") == "otomatis" else "MANUAL INPUT"
    pdf.set_xy(170, 27)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_text_color(251, 191, 36)   # Amber
    pdf.cell(117, 5, jenis_label, align="R")

    # ── Info Kotak ──────────────────────────────────────────────────────────────
    pdf.set_y(45)
    # Kotak periode
    pdf.set_fill_color(241, 245, 249)
    pdf.rect(10, 45, 135, 32, "F")
    pdf.set_xy(13, 48)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_text_color(100, 116, 139)
    pdf.cell(0, 4, "PERIODE PEMBELANJAAN")
    pdf.set_xy(13, 54)
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(0, 6, rekap_data.get("periode", ""))
    pdf.set_xy(13, 63)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(71, 85, 105)
    tgl_mulai = format_tanggal(rekap_data.get("tanggal_mulai"))
    tgl_selesai = format_tanggal(rekap_data.get("tanggal_selesai"))
    pdf.cell(0, 5, f"{tgl_mulai}  s/d  {tgl_selesai}")

    # Kotak total
    pdf.set_fill_color(15, 23, 42)
    pdf.rect(155, 45, 135, 32, "F")
    pdf.set_xy(158, 48)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_text_color(148, 163, 184)
    pdf.cell(0, 4, "TOTAL PEMBELANJAAN")
    pdf.set_xy(158, 55)
    pdf.set_font("Helvetica", "B", 14)
    pdf.set_text_color(34, 197, 94)
    pdf.cell(0, 8, format_rupiah(rekap_data.get("total_pembelian", 0)))
    pdf.set_xy(158, 66)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(148, 163, 184)
    pdf.cell(0, 5, f"{rekap_data.get('total_item', 0)} baris item")

    # ── Tabel ──────────────────────────────────────────────────────────────────
    pdf.set_y(85)

    headers = [
        ("No", 10), ("Tanggal", 22), ("Nama Item / Bahan", 80),
        ("Supplier", 45), ("Qty", 18), ("Satuan", 18),
        ("Harga Satuan", 35), ("Subtotal", 35),
    ]

    pdf.set_fill_color(15, 23, 42)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_x(10)
    for header, width in headers:
        pdf.cell(width, 8, header, border=0, align="C", fill=True)
    pdf.ln()

    details = rekap_data.get("details", [])
    total_check = 0.0
    for i, d in enumerate(details):
        # Check page overflow
        if pdf.get_y() > 175:
            pdf.add_page()
            pdf.set_fill_color(15, 23, 42)
            pdf.set_text_color(255, 255, 255)
            pdf.set_font("Helvetica", "B", 8)
            pdf.set_x(10)
            for header, width in headers:
                pdf.cell(width, 8, header, border=0, align="C", fill=True)
            pdf.ln()

        if i % 2 == 0:
            pdf.set_fill_color(248, 250, 252)
        else:
            pdf.set_fill_color(255, 255, 255)

        pdf.set_text_color(15, 23, 42)
        pdf.set_font("Helvetica", "", 8)
        pdf.set_x(10)

        nama_item = str(d.get("nama_item", ""))
        supplier = str(d.get("supplier", "-"))

        row_data = [
            (str(i + 1), 10, "C"),
            (str(d.get("tanggal", "")), 22, "C"),
            (nama_item[:48] if len(nama_item) > 48 else nama_item, 80, "L"),
            (supplier[:28] if len(supplier) > 28 else supplier, 45, "L"),
            (f"{float(d.get('qty', 0)):,.2f}", 18, "R"),
            (str(d.get("satuan", "")), 18, "C"),
            (format_rupiah(d.get("harga_satuan", 0)), 35, "R"),
            (format_rupiah(d.get("subtotal", 0)), 35, "R"),
        ]
        for text, width, align in row_data:
            pdf.cell(width, 7, text, border=0, align=align, fill=True)
        pdf.ln()
        total_check += float(d.get("subtotal", 0))

    # Garis pemisah
    pdf.set_draw_color(226, 232, 240)
    pdf.line(10, pdf.get_y(), 287, pdf.get_y())
    pdf.ln(3)

    # ── Total ─────────────────────────────────────────────────────────────────
    pdf.set_x(152)
    pdf.set_fill_color(15, 23, 42)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 10)
    pdf.cell(100, 10, "TOTAL PEMBELANJAAN", fill=True, align="C")
    pdf.set_fill_color(34, 197, 94)
    pdf.cell(35, 10, format_rupiah(rekap_data.get("total_pembelian", 0)), fill=True, align="R")
    pdf.ln()

    # ── Catatan ───────────────────────────────────────────────────────────────
    if rekap_data.get("catatan"):
        pdf.ln(5)
        pdf.set_x(10)
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_text_color(100, 116, 139)
        pdf.cell(0, 5, "Catatan:")
        pdf.ln()
        pdf.set_x(10)
        pdf.set_font("Helvetica", "", 8)
        pdf.set_text_color(71, 85, 105)
        pdf.multi_cell(277, 5, rekap_data.get("catatan", ""))

    # ── Tanda Tangan ──────────────────────────────────────────────────────────
    pdf.set_y(175)
    pdf.set_x(10)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(71, 85, 105)
    pdf.cell(90, 5, "Dibuat oleh (Purchasing),")
    pdf.set_x(120)
    pdf.cell(90, 5, "Diverifikasi oleh (Finance),")
    pdf.set_x(220)
    pdf.cell(67, 5, "Disetujui oleh,")
    pdf.ln(25)
    pdf.set_x(10)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(90, 5, "(__________________)")
    pdf.set_x(120)
    pdf.cell(90, 5, "(__________________)")
    pdf.set_x(220)
    pdf.cell(67, 5, "(__________________)")

    # Simpan
    filename = f"RP_{rekap_data.get('nomor_rekap', 'unknown').replace('/', '-')}.pdf"
    filepath = os.path.join(output_dir, filename)
    pdf.output(filepath)
    return filepath
