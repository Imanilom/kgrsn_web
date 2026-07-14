"""
Invoice PDF Generator menggunakan fpdf2.
Generate invoice profesional dalam format PDF.
Fixed: multi-cell untuk nama item panjang, proper page break.
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
        "", "Januari", "Februari", "Maret", "April", "Mei", "Juni",
        "Juli", "Agustus", "September", "Oktober", "November", "Desember"
    ]
    try:
        return f"{d.day} {BULAN[d.month]} {d.year}"
    except Exception:
        return str(d)


class InvoicePDF(FPDF):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._header_printed = False

    def header(self):
        pass  # Custom header handled in generate_invoice

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(150, 150, 150)
        self.cell(0, 10, f"Halaman {self.page_no()} | Dokumen Resmi - {settings.COMPANY_NAME}", align="C")


def _draw_page_header(pdf: InvoicePDF, invoice_data: dict):
    """Gambar header perusahaan + info invoice (hanya halaman pertama)."""
    # ── Header Perusahaan ───────────────────────────────────────────────────────
    pdf.set_fill_color(30, 41, 59)     # Dark navy
    pdf.rect(0, 0, 210, 42, "F")

    pdf.set_xy(15, 10)
    pdf.set_font("Helvetica", "B", 18)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(100, 10, settings.COMPANY_NAME, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf.set_font("Helvetica", "", 9)
    pdf.set_x(15)
    pdf.set_text_color(200, 210, 220)
    pdf.cell(100, 5, settings.COMPANY_ADDRESS)
    pdf.set_x(15)
    pdf.set_y(pdf.get_y() + 5)
    pdf.cell(100, 5, f"Telp: {settings.COMPANY_PHONE}")

    # Label INVOICE
    pdf.set_xy(150, 10)
    pdf.set_font("Helvetica", "B", 24)
    is_draft = invoice_data.get("is_draft", False)
    pdf.set_text_color(99, 102, 241) if not is_draft else pdf.set_text_color(251, 146, 60)
    pdf.cell(45, 12, "DRAFT" if is_draft else "INVOICE", align="R")

    pdf.set_xy(150, 24)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(200, 210, 220)
    pdf.cell(45, 5, invoice_data.get("nomor_invoice", ""), align="R")

    # ── Info Invoice & Tagihan ─────────────────────────────────────────────────
    pdf.set_y(50)
    pdf.set_text_color(30, 41, 59)

    # Tagihan Ke
    pdf.set_fill_color(248, 250, 252)
    pdf.rect(15, 50, 85, 42, "F")
    pdf.set_xy(18, 53)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_text_color(100, 116, 139)
    pdf.cell(0, 5, "TAGIHAN KE")
    pdf.set_xy(18, 60)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(30, 41, 59)
    nama = invoice_data.get("dapur_nama", "")
    # Multi-line untuk nama panjang
    pdf.multi_cell(78, 6, nama)
    pdf.set_xy(18, pdf.get_y() + 1)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(71, 85, 105)
    pdf.multi_cell(78, 5, invoice_data.get("dapur_alamat", "-") or "-")
    pdf.set_xy(18, pdf.get_y())
    pdf.cell(78, 5, f"Kontak: {invoice_data.get('dapur_kontak', '-') or '-'}")

    # Info Tanggal
    pdf.set_fill_color(248, 250, 252)
    pdf.rect(110, 50, 85, 42, "F")
    pdf.set_xy(113, 53)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_text_color(100, 116, 139)
    pdf.cell(0, 5, "INFORMASI INVOICE")

    # Nomor referensi jika ada
    ref = invoice_data.get("nomor_realisasi") or invoice_data.get("nomor_po")

    info_rows = [
        ("Nomor Invoice", invoice_data.get("nomor_invoice", "")),
        ("Tanggal Invoice", format_tanggal(invoice_data.get("tanggal_invoice"))),
        ("Jatuh Tempo", format_tanggal(invoice_data.get("jatuh_tempo"))),
        ("Status", invoice_data.get("status", "UNPAID").upper()),
    ]
    if ref:
        info_rows.insert(1, ("Ref. Dokumen", ref))

    y_pos = 60
    for label, value in info_rows:
        if y_pos > 88:
            break
        pdf.set_xy(113, y_pos)
        pdf.set_font("Helvetica", "", 8)
        pdf.set_text_color(100, 116, 139)
        pdf.cell(35, 5, label + ":")
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_text_color(30, 41, 59)
        pdf.cell(40, 5, str(value)[:30])
        y_pos += 7

    return 100  # Y position after header


def _draw_table_header(pdf: InvoicePDF, headers: list):
    """Gambar header tabel di posisi saat ini."""
    pdf.set_fill_color(30, 41, 59)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_x(15)
    for header, width in headers:
        pdf.cell(width, 8, header, border=0, align="C", fill=True)
    pdf.ln()


def generate_invoice_pdf(invoice_data: dict, output_dir: str = None) -> str:
    """
    Generate file PDF invoice.

    invoice_data: {
        "nomor_invoice": str,
        "tanggal_invoice": date,
        "jatuh_tempo": date,
        "dapur_nama": str,
        "dapur_alamat": str,
        "dapur_kontak": str,
        "details": [{"nama_item", "qty", "satuan", "harga_beli", "harga_jual", "subtotal"}],
        "subtotal": float,
        "total": float,
        "catatan": str,
        "nomor_realisasi": str (optional),
    }

    Returns: path ke file PDF
    """
    if output_dir is None:
        output_dir = os.path.join(settings.GENERATED_DIR, "invoices")
    os.makedirs(output_dir, exist_ok=True)

    pdf = InvoicePDF(orientation="P", unit="mm", format="A4")
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=25)

    # Header halaman pertama
    _draw_page_header(pdf, invoice_data)

    # ── Tabel Item ─────────────────────────────────────────────────────────────
    pdf.set_y(102)

    # Kolom: No(10) | Nama Item(85) | Qty(15) | Satuan(18) | Harga(30) | Subtotal(40)
    headers = [
        ("No", 10), ("Nama Item", 85), ("Qty", 15), ("Satuan", 18),
        ("Harga", 30), ("Subtotal", 40)
    ]
    _draw_table_header(pdf, headers)

    details = invoice_data.get("details", [])
    for i, detail in enumerate(details):
        # Cek apakah perlu tambah halaman
        if pdf.get_y() > 240:
            pdf.add_page()
            pdf.set_y(20)
            # Header halaman baru (lebih ringkas)
            pdf.set_fill_color(30, 41, 59)
            pdf.set_text_color(255, 255, 255)
            pdf.set_font("Helvetica", "B", 9)
            pdf.set_x(15)
            pdf.cell(0, 7, f"INVOICE {invoice_data.get('nomor_invoice', '')} (lanjutan)", fill=True, align="C")
            pdf.ln(10)
            _draw_table_header(pdf, headers)

        bg = i % 2 == 0
        if bg:
            pdf.set_fill_color(248, 250, 252)
        else:
            pdf.set_fill_color(255, 255, 255)

        pdf.set_text_color(30, 41, 59)
        pdf.set_x(15)

        nama_item = str(detail.get("nama_item", ""))

        # Hitung tinggi baris berdasarkan panjang nama item (max 45 char per baris)
        nama_lines = [nama_item[j:j+45] for j in range(0, len(nama_item), 45)] if len(nama_item) > 45 else [nama_item]
        row_h = max(7, len(nama_lines) * 6)

        # Gambar kolom-kolom dengan tinggi yang sama
        y_start = pdf.get_y()
        col_data = [
            (str(i + 1), 10, "C"),
            (None, 85, "L"),   # Nama item — special handling
            (f"{float(detail.get('qty', 0)):,.2f}", 15, "C"),
            (str(detail.get("satuan", "")), 18, "C"),
            (format_rupiah(detail.get("harga_jual", 0)), 30, "R"),
            (format_rupiah(detail.get("subtotal", 0)), 40, "R"),
        ]

        x = 15
        for j, (text, width, align) in enumerate(col_data):
            if text is None:  # Nama item — multi_cell
                pdf.set_xy(x, y_start)
                pdf.set_font("Helvetica", "", 8)
                pdf.set_fill_color(248, 250, 252) if bg else pdf.set_fill_color(255, 255, 255)
                # Draw background rect
                pdf.rect(x, y_start, width, row_h, "F")
                pdf.set_xy(x + 1, y_start + 1)
                pdf.multi_cell(width - 2, 5.5, nama_item, border=0, align="L")
            else:
                pdf.set_xy(x, y_start)
                pdf.set_font("Helvetica", "", 8)
                pdf.set_fill_color(248, 250, 252) if bg else pdf.set_fill_color(255, 255, 255)
                pdf.cell(width, row_h, text, border=0, align=align, fill=True)
            x += width

        pdf.set_y(y_start + row_h)

    # ── Total ──────────────────────────────────────────────────────────────────
    pdf.ln(3)
    # Garis pemisah
    pdf.set_draw_color(226, 232, 240)
    pdf.line(15, pdf.get_y(), 195, pdf.get_y())
    pdf.ln(4)

    pdf.set_x(120)
    pdf.set_fill_color(30, 41, 59)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(45, 11, "TOTAL TAGIHAN", fill=True, align="C")
    pdf.set_fill_color(99, 102, 241)
    pdf.cell(30, 11, format_rupiah(invoice_data.get("total", 0)), fill=True, align="R")
    pdf.ln()

    # ── Catatan ────────────────────────────────────────────────────────────────
    if invoice_data.get("catatan"):
        pdf.ln(5)
        pdf.set_x(15)
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_text_color(100, 116, 139)
        pdf.cell(0, 5, "Catatan:")
        pdf.ln()
        pdf.set_x(15)
        pdf.set_font("Helvetica", "", 8)
        pdf.set_text_color(71, 85, 105)
        pdf.multi_cell(180, 5, invoice_data.get("catatan", ""))

    # ── Tanda Tangan — selalu di bagian bawah ──────────────────────────────────
    # Pastikan tidak overflow dengan set_y positional
    sig_y = max(pdf.get_y() + 10, 240)
    pdf.set_y(sig_y)
    pdf.set_x(15)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(71, 85, 105)
    pdf.cell(80, 5, "Dibuat oleh,")
    pdf.set_x(130)
    pdf.cell(65, 5, "Disetujui oleh,")
    pdf.ln(25)
    pdf.set_x(15)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(30, 41, 59)
    pdf.cell(80, 5, "(______________________)")
    pdf.set_x(130)
    pdf.cell(65, 5, "(______________________)")
    pdf.ln()
    pdf.set_x(15)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(100, 116, 139)
    pdf.cell(80, 4, settings.COMPANY_NAME)
    pdf.set_x(130)
    pdf.cell(65, 4, invoice_data.get("dapur_nama", ""))

    # Simpan file
    filename = f"INV_{invoice_data.get('nomor_invoice', 'unknown').replace('/', '-')}.pdf"
    filepath = os.path.join(output_dir, filename)
    pdf.output(filepath)
    return filepath
