"""
Surat Jalan PDF Generator menggunakan fpdf2.
Fixed: multi-cell nama item panjang, multi-page support, tanda tangan 3 pihak.
"""
from fpdf import FPDF
from fpdf.enums import XPos, YPos
from config import settings
import os


def format_rupiah(value) -> str:
    try:
        return f"Rp {float(value):,.0f}".replace(",", ".")
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


class SJPDF(FPDF):
    def normalize_text(self, text):
        if not text:
            return ""
        s = str(text)
        s = s.replace("–", "-").replace("—", "-")
        s = s.replace("’", "'").replace("‘", "'")
        s = s.replace("“", '"').replace("”", '"')
        s = s.replace("…", "...")
        try:
            return super().normalize_text(s)
        except Exception:
            return s.encode("latin-1", "replace").decode("latin-1")

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(150, 150, 150)
        self.cell(0, 10, f"Halaman {self.page_no()} | {settings.COMPANY_NAME}", align="C")


def _draw_sj_table_header(pdf: SJPDF, headers: list):
    pdf.set_fill_color(16, 185, 129)   # Emerald
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_x(15)
    for header, width in headers:
        pdf.cell(width, 8, header, border=0, align="C", fill=True)
    pdf.ln()


def generate_surat_jalan_pdf(sj_data: dict, output_dir: str = None) -> str:
    """
    Generate file PDF surat jalan.

    sj_data: {
        "nomor_sj": str,
        "tanggal_kirim": date,
        "pengirim": str,
        "penerima": str,
        "dapur_nama": str,
        "dapur_alamat": str,
        "nomor_po": str,
        "details": [{"nama_item", "qty", "satuan", "keterangan"}],
        "catatan": str,
    }

    Returns: path ke file PDF
    """
    if output_dir is None:
        output_dir = os.path.join(settings.GENERATED_DIR, "surat_jalan")
    os.makedirs(output_dir, exist_ok=True)

    pdf = SJPDF(orientation="P", unit="mm", format="A4")
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=25)

    # ── Header ─────────────────────────────────────────────────────────────────
    pdf.set_fill_color(16, 185, 129)   # Emerald
    pdf.rect(0, 0, 210, 36, "F")

    # Logo koperasi (kiri)
    logo_path = os.path.abspath(settings.LOGO_PATH)
    if os.path.exists(logo_path):
        pdf.image(logo_path, x=13, y=4, h=26)
        text_x = 46
    else:
        text_x = 15

    pdf.set_xy(text_x, 8)
    pdf.set_font("Helvetica", "B", 16)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(100 - (text_x - 15), 10, settings.COMPANY_NAME)

    pdf.set_xy(text_x, 21)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(209, 250, 229)
    pdf.cell(100 - (text_x - 15), 5, settings.COMPANY_ADDRESS)

    pdf.set_xy(130, 8)
    pdf.set_font("Helvetica", "B", 18)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(65, 12, "SURAT JALAN", align="R")

    pdf.set_xy(130, 22)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(209, 250, 229)
    pdf.cell(65, 5, sj_data.get("nomor_sj", ""), align="R")

    # ── Info Panel ─────────────────────────────────────────────────────────────
    pdf.set_y(43)
    pdf.set_fill_color(248, 250, 252)

    # Dari
    pdf.set_draw_color(209, 213, 219)
    pdf.rect(15, 43, 85, 38, "DF")
    pdf.set_xy(18, 46)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_text_color(100, 116, 139)
    pdf.cell(0, 4, "DARI")
    pdf.set_xy(18, 52)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(30, 41, 59)
    pdf.cell(0, 5, settings.COMPANY_NAME)
    pdf.set_xy(18, 59)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(71, 85, 105)
    pdf.multi_cell(78, 4, settings.COMPANY_ADDRESS or "")
    pdf.set_xy(18, pdf.get_y())
    pdf.cell(0, 4, f"Pengirim: {sj_data.get('pengirim', '-')}")

    # Ke
    pdf.set_draw_color(209, 213, 219)
    pdf.rect(108, 43, 85, 38, "DF")
    pdf.set_xy(111, 46)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_text_color(100, 116, 139)
    pdf.cell(0, 4, "KEPADA")
    pdf.set_xy(111, 52)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(30, 41, 59)
    pdf.cell(0, 5, sj_data.get("dapur_nama", ""))
    pdf.set_xy(111, 59)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(71, 85, 105)
    alamat = sj_data.get("dapur_alamat", "-") or "-"
    pdf.multi_cell(78, 4, alamat[:80] if len(alamat) > 80 else alamat)
    pdf.set_xy(111, pdf.get_y())
    pdf.cell(0, 4, f"Penerima: {sj_data.get('penerima', '-')}")

    # Info baris detail
    pdf.set_y(88)
    pdf.set_x(15)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(100, 116, 139)
    pdf.cell(30, 6, "Tanggal Kirim:")
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(30, 41, 59)
    pdf.cell(50, 6, format_tanggal(sj_data.get("tanggal_kirim")))
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(100, 116, 139)
    pdf.cell(25, 6, "Ref. PO:")
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(30, 41, 59)
    pdf.cell(70, 6, sj_data.get("nomor_po", "-"))
    pdf.ln(10)

    # ── Tabel Item ─────────────────────────────────────────────────────────────
    # Kolom: No(10) | Nama Item(88) | Qty(20) | Satuan(22) | Keterangan(40)
    headers = [("No", 10), ("Nama Item / Barang", 88), ("Qty", 20), ("Satuan", 22), ("Keterangan", 40)]
    _draw_sj_table_header(pdf, headers)

    details = sj_data.get("details", [])
    for i, detail in enumerate(details):
        # Cek halaman
        if pdf.get_y() > 250:
            pdf.add_page()
            pdf.set_y(20)
            pdf.set_fill_color(16, 185, 129)
            pdf.set_text_color(255, 255, 255)
            pdf.set_font("Helvetica", "B", 9)
            pdf.set_x(15)
            pdf.cell(0, 7, f"SURAT JALAN {sj_data.get('nomor_sj', '')} (lanjutan)", fill=True, align="C")
            pdf.ln(10)
            _draw_sj_table_header(pdf, headers)

        bg = i % 2 == 0
        if bg:
            pdf.set_fill_color(240, 253, 244)   # Light emerald
        else:
            pdf.set_fill_color(255, 255, 255)

        y_start = pdf.get_y()

        nama_item = str(detail.get("nama_item", ""))
        keterangan = str(detail.get("keterangan", "") or "")

        # Estimasi tinggi baris
        nama_lines = max(1, (len(nama_item) + 43) // 44)
        ket_lines = max(1, (len(keterangan) + 38) // 39)
        row_h = max(7, max(nama_lines, ket_lines) * 5.5)

        pdf.set_text_color(30, 41, 59)
        pdf.set_font("Helvetica", "", 8)

        # No
        pdf.set_xy(15, y_start)
        pdf.set_fill_color(240, 253, 244) if bg else pdf.set_fill_color(255, 255, 255)
        pdf.cell(10, row_h, str(i + 1), border=0, align="C", fill=True)

        # Nama item
        pdf.set_xy(25, y_start)
        pdf.rect(25, y_start, 88, row_h, "F")
        pdf.set_xy(26, y_start + 1)
        pdf.multi_cell(86, 5.5, nama_item, border=0, align="L")

        # Qty
        pdf.set_xy(113, y_start)
        pdf.cell(20, row_h, f"{float(detail.get('qty', 0)):,.2f}", border=0, align="C", fill=True)

        # Satuan
        pdf.set_xy(133, y_start)
        pdf.cell(22, row_h, str(detail.get("satuan", "")), border=0, align="C", fill=True)

        # Keterangan
        pdf.set_xy(155, y_start)
        pdf.rect(155, y_start, 40, row_h, "F")
        pdf.set_xy(156, y_start + 1)
        pdf.multi_cell(38, 5.5, keterangan, border=0, align="L")

        pdf.set_y(y_start + row_h)

        # Garis tipis antar baris
        pdf.set_draw_color(241, 245, 249)
        pdf.line(15, pdf.get_y(), 195, pdf.get_y())

    # Garis bawah tabel
    pdf.set_draw_color(203, 213, 225)
    pdf.line(15, pdf.get_y(), 195, pdf.get_y())

    # ── Catatan ────────────────────────────────────────────────────────────────
    if sj_data.get("catatan"):
        pdf.ln(5)
        pdf.set_x(15)
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_text_color(100, 116, 139)
        pdf.cell(0, 5, "Catatan:")
        pdf.ln()
        pdf.set_x(15)
        pdf.set_font("Helvetica", "", 8)
        pdf.set_text_color(71, 85, 105)
        pdf.multi_cell(180, 5, sj_data.get("catatan", ""))

    # ── Tanda Tangan 3 pihak ───────────────────────────────────────────────────
    sig_y = max(pdf.get_y() + 15, 240)
    pdf.set_y(sig_y)

    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(71, 85, 105)
    pdf.set_x(15)
    pdf.cell(55, 5, "Diserahkan oleh,", align="C")
    pdf.set_x(75)
    pdf.cell(60, 5, "Pengantar / Supir,", align="C")
    pdf.set_x(140)
    pdf.cell(55, 5, "Diterima oleh,", align="C")

    pdf.ln(25)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(30, 41, 59)
    pdf.set_x(20)
    pdf.cell(45, 5, "", border="B")
    pdf.set_x(82)
    pdf.cell(45, 5, "", border="B")
    pdf.set_x(145)
    pdf.cell(45, 5, "", border="B")
    
    pdf.ln(6)
    pdf.set_x(15)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(100, 116, 139)
    pdf.cell(55, 4, settings.COMPANY_NAME, align="C")
    pdf.set_x(75)
    pdf.cell(60, 4, "", align="C")
    pdf.set_x(140)
    pdf.cell(55, 4, sj_data.get("dapur_nama", ""), align="C")

    # Simpan
    filename = f"SJ_{sj_data.get('nomor_sj', 'unknown').replace('/', '-')}.pdf"
    filepath = os.path.join(output_dir, filename)
    pdf.output(filepath)
    return filepath
