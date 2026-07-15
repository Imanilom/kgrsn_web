"""
Invoice PDF Generator - Premium Design
Layout profesional dengan header berwarna, info box, tabel bersih, dan tanda tangan.
"""
from fpdf import FPDF
from fpdf.enums import XPos, YPos
from datetime import date
from config import settings
import os


# ── Color Palette (Light theme, green accent — sesuai logo koperasi hijau) ─────
C_GREEN      = (22, 163, 74)     # Primary green (sama dengan logo koperasi)
C_GREEN_DK   = (15, 118, 55)     # Dark green (header bar)
C_GREEN_LT   = (220, 252, 231)   # Light green bg (info box header, accent bg)
C_GREEN_LINE = (134, 239, 172)   # Green divider line
C_SLATE      = (71, 85, 105)     # Secondary text
C_MUTED      = (100, 116, 139)   # Muted labels
C_BG_LIGHT   = (249, 250, 251)   # Table row alt bg
C_BG_GREEN   = (240, 253, 244)   # Very light green row
C_BORDER     = (209, 250, 229)   # Soft green border
C_DIVIDER    = (243, 244, 246)   # Thin divider (gray-100)
C_WHITE      = (255, 255, 255)
C_TEXT       = (17, 24, 39)      # Dark text
C_ORANGE     = (234, 88, 12)     # Draft color

# ── Column widths (sum = 180mm fits A4 with 15mm margins) ─────────────────────
COLS = [
    ("No",        10, "C"),
    ("Nama Item", 77, "L"),
    ("Qty",       15, "C"),
    ("Satuan",    15, "C"),
    ("Harga",     30, "R"),
    ("Subtotal",  33, "R"),
]
COL_TOTAL = sum(w for _, w, _ in COLS)   # 180


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
        if hasattr(d, "day"):
            return f"{d.day} {BULAN[d.month]} {d.year}"
        parts = str(d).split("-")
        if len(parts) == 3:
            return f"{int(parts[2])} {BULAN[int(parts[1])]} {parts[0]}"
        return str(d)
    except Exception:
        return str(d)


def _set_color(pdf: FPDF, color: tuple, target: str = "text"):
    """Helper to set text / draw / fill color."""
    r, g, b = color
    if target == "text":
        pdf.set_text_color(r, g, b)
    elif target == "fill":
        pdf.set_fill_color(r, g, b)
    elif target == "draw":
        pdf.set_draw_color(r, g, b)


class InvoicePDF(FPDF):
    def header(self):
        pass  # drawn manually

    def footer(self):
        self.set_y(-14)
        _set_color(self, C_BORDER, "draw")
        self.line(15, self.get_y(), 195, self.get_y())
        self.set_y(-12)
        self.set_font("Helvetica", "I", 7.5)
        _set_color(self, C_MUTED, "text")
        self.cell(0, 6,
            f"Halaman {self.page_no()}  |  Dokumen Resmi  |  {settings.COMPANY_NAME}",
            align="C")


# ── SECTION: Page Header ───────────────────────────────────────────────────────

def _draw_header(pdf: InvoicePDF, data: dict):
    """Clean white header with green bottom border + logo."""
    is_draft = data.get("is_draft", False)
    accent = C_ORANGE if is_draft else C_GREEN

    # White header background
    _set_color(pdf, C_WHITE, "fill")
    pdf.rect(0, 0, 210, 40, "F")

    # Green bottom border strip
    _set_color(pdf, accent, "fill")
    pdf.rect(0, 37, 210, 3, "F")

    # Logo koperasi (kiri)
    logo_path = os.path.abspath(settings.LOGO_PATH)
    if os.path.exists(logo_path):
        pdf.image(logo_path, x=13, y=5, h=28)  # logo 28mm tinggi
        text_x = 48  # geser teks ke kanan
    else:
        text_x = 15

    # Company name
    pdf.set_xy(text_x, 9)
    pdf.set_font("Helvetica", "B", 17)
    _set_color(pdf, C_GREEN_DK, "text")
    pdf.cell(110 - (text_x - 15), 10, settings.COMPANY_NAME)

    # Company sub-info
    pdf.set_xy(text_x, 21)
    pdf.set_font("Helvetica", "", 8)
    _set_color(pdf, C_SLATE, "text")
    pdf.cell(110 - (text_x - 15), 5, settings.COMPANY_ADDRESS or "")
    pdf.set_xy(text_x, 27)
    if settings.COMPANY_PHONE:
        pdf.cell(110 - (text_x - 15), 5, f"Telp: {settings.COMPANY_PHONE}")

    # INVOICE / DRAFT label (right)
    pdf.set_xy(130, 7)
    pdf.set_font("Helvetica", "B", 26)
    _set_color(pdf, accent, "text")
    pdf.cell(65, 14, "DRAFT" if is_draft else "INVOICE", align="R")

    # Invoice number under label
    pdf.set_xy(130, 23)
    pdf.set_font("Helvetica", "", 8.5)
    _set_color(pdf, C_MUTED, "text")
    pdf.cell(65, 5, data.get("nomor_invoice", ""), align="R")


def _draw_info_boxes(pdf: InvoicePDF, data: dict):
    """Two side-by-side info boxes: Tagihan Ke | Informasi Invoice."""
    BOX_TOP  = 46
    BOX_H    = 44
    LEFT_W   = 88
    RIGHT_W  = 87
    LEFT_X   = 15
    RIGHT_X  = 108

    # ── Left box: Tagihan Ke ───────────────────────────────────────────────────
    _set_color(pdf, C_WHITE, "fill")
    _set_color(pdf, C_BORDER, "draw")
    pdf.rect(LEFT_X, BOX_TOP, LEFT_W, BOX_H, "DF")

    # Label header inside box (green)
    pdf.set_xy(LEFT_X, BOX_TOP)
    _set_color(pdf, C_GREEN, "fill")
    pdf.rect(LEFT_X, BOX_TOP, LEFT_W, 7, "F")
    pdf.set_xy(LEFT_X + 3, BOX_TOP + 1)
    pdf.set_font("Helvetica", "B", 7)
    _set_color(pdf, C_WHITE, "text")
    pdf.cell(LEFT_W - 4, 5, "TAGIHAN KEPADA")

    # Content
    pdf.set_xy(LEFT_X + 3, BOX_TOP + 10)
    pdf.set_font("Helvetica", "B", 10.5)
    _set_color(pdf, C_TEXT, "text")
    pdf.multi_cell(LEFT_W - 6, 6, data.get("dapur_nama", "-"))

    pdf.set_xy(LEFT_X + 3, min(pdf.get_y() + 1, BOX_TOP + 26))
    pdf.set_font("Helvetica", "", 8)
    _set_color(pdf, C_SLATE, "text")
    alamat = data.get("dapur_alamat", "") or ""
    pdf.multi_cell(LEFT_W - 6, 4.5, alamat[:60] if len(alamat) > 60 else alamat)

    kontak = data.get("dapur_kontak", "") or ""
    pdf.set_xy(LEFT_X + 3, min(pdf.get_y(), BOX_TOP + 37))
    pdf.set_font("Helvetica", "", 8)
    if kontak:
        pdf.cell(LEFT_W - 6, 4.5, f"Telp: {kontak}")

    # ── Right box: Info Invoice ────────────────────────────────────────────────
    _set_color(pdf, C_WHITE, "fill")
    _set_color(pdf, C_BORDER, "draw")
    pdf.rect(RIGHT_X, BOX_TOP, RIGHT_W, BOX_H, "DF")

    # Label header inside box (green)
    _set_color(pdf, C_GREEN, "fill")
    pdf.rect(RIGHT_X, BOX_TOP, RIGHT_W, 7, "F")
    pdf.set_xy(RIGHT_X + 3, BOX_TOP + 1)
    pdf.set_font("Helvetica", "B", 7)
    _set_color(pdf, C_WHITE, "text")
    pdf.cell(RIGHT_W - 4, 5, "INFORMASI INVOICE")

    is_draft = data.get("is_draft", False)
    status_str = data.get("status", "unpaid").upper()
    ref = data.get("nomor_realisasi") or data.get("nomor_po", "")

    rows = [
        ("No. Invoice",   data.get("nomor_invoice", "-")),
        ("Tanggal",       format_tanggal(data.get("tanggal_invoice"))),
        ("Jatuh Tempo",   format_tanggal(data.get("jatuh_tempo"))),
        ("Status",        status_str),
    ]
    if ref:
        rows.insert(2, ("Ref. Dokumen", ref))

    y_r = BOX_TOP + 10
    for label, val in rows:
        if y_r > BOX_TOP + BOX_H - 6:
            break
        pdf.set_xy(RIGHT_X + 3, y_r)
        pdf.set_font("Helvetica", "", 7.5)
        _set_color(pdf, C_MUTED, "text")
        pdf.cell(30, 5, label + ":")
        pdf.set_font("Helvetica", "B", 7.5)
        if label == "Status":
            _set_color(pdf, (16, 185, 129) if status_str == "PAID" else (245, 158, 11), "text")
        else:
            _set_color(pdf, C_TEXT, "text")
        pdf.cell(50, 5, str(val)[:25])
        y_r += 6.5

    return BOX_TOP + BOX_H + 6  # Y after boxes


# ── SECTION: Table ────────────────────────────────────────────────────────────

def _draw_table_header_row(pdf: InvoicePDF):
    _set_color(pdf, C_GREEN, "fill")
    _set_color(pdf, C_WHITE, "text")
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_x(15)
    for label, width, align in COLS:
        pdf.cell(width, 9, label, border=0, align=align, fill=True)
    pdf.ln()
    # Thin green line below header
    _set_color(pdf, C_GREEN_LT, "draw")
    pdf.line(15, pdf.get_y(), 15 + COL_TOTAL, pdf.get_y())


def _draw_item_row(pdf: InvoicePDF, i: int, detail: dict):
    nama_item = str(detail.get("nama_item", ""))

    # Estimate rows needed for nama_item in col width 77
    max_chars = 38
    estimated_lines = max(1, -(-len(nama_item) // max_chars))  # ceiling division
    row_h = max(8, estimated_lines * 5.5)

    bg = (i % 2 == 0)
    bg_color = C_BG_GREEN if bg else C_WHITE  # light green alt row
    y_start = pdf.get_y()

    pdf.set_font("Helvetica", "", 8)
    _set_color(pdf, C_TEXT, "text")

    x = 15
    for j, (_, width, align) in enumerate(COLS):
        _set_color(pdf, bg_color, "fill")
        if j == 1:  # Nama Item — multi_cell
            pdf.rect(x, y_start, width, row_h, "F")
            pdf.set_xy(x + 1.5, y_start + 1.5)
            pdf.multi_cell(width - 3, 5.2, nama_item, border=0, align="L")
        else:
            if j == 0:
                text = str(i + 1)
            elif j == 2:
                qty_val = detail.get("qty", 0)
                text = f"{float(qty_val):,.2f}".rstrip("0").rstrip(".")
            elif j == 3:
                text = str(detail.get("satuan", ""))
            elif j == 4:
                text = format_rupiah(detail.get("harga_jual", 0))
            else:
                text = format_rupiah(detail.get("subtotal", 0))
            pdf.set_xy(x, y_start)
            if j == 5:  # Subtotal — slightly bolder
                pdf.set_font("Helvetica", "B", 8)
            pdf.cell(width, row_h, text, border=0, align=align, fill=True)
            pdf.set_font("Helvetica", "", 8)
        x += width

    pdf.set_y(y_start + row_h)
    # Thin row divider
    _set_color(pdf, C_DIVIDER, "draw")
    pdf.line(15, pdf.get_y(), 15 + COL_TOTAL, pdf.get_y())


# ── SECTION: Totals ───────────────────────────────────────────────────────────

def _draw_totals(pdf: InvoicePDF, data: dict):
    pdf.ln(2)
    _set_color(pdf, C_BORDER, "draw")
    pdf.line(15, pdf.get_y(), 15 + COL_TOTAL, pdf.get_y())
    pdf.ln(4)

    # Total Tagihan - right aligned block
    total_label_w = 48
    total_value_w = 32
    right_x = 15 + COL_TOTAL - total_label_w - total_value_w

    _set_color(pdf, C_GREEN_DK, "fill")
    pdf.set_xy(right_x, pdf.get_y())
    pdf.set_font("Helvetica", "B", 9.5)
    _set_color(pdf, C_WHITE, "text")
    pdf.cell(total_label_w, 12, "TOTAL TAGIHAN", fill=True, align="C")

    _set_color(pdf, C_GREEN, "fill")
    pdf.set_font("Helvetica", "B", 9.5)
    _set_color(pdf, C_WHITE, "text")
    pdf.cell(total_value_w, 12, format_rupiah(data.get("total", 0)), fill=True, align="R")
    pdf.ln(14)


# ── SECTION: Notes & Signature ────────────────────────────────────────────────

def _draw_notes(pdf: InvoicePDF, catatan: str):
    if not catatan:
        return
    pdf.set_x(15)
    _set_color(pdf, C_GREEN_LT, "fill")
    _set_color(pdf, C_BORDER, "draw")
    pdf.rect(15, pdf.get_y(), COL_TOTAL, 5, "F")  # label bar
    pdf.set_xy(17, pdf.get_y() + 0.5)
    pdf.set_font("Helvetica", "B", 7.5)
    _set_color(pdf, C_GREEN_DK, "text")
    pdf.cell(0, 4, "CATATAN")
    pdf.ln(6)
    pdf.set_x(17)
    pdf.set_font("Helvetica", "", 8)
    _set_color(pdf, C_SLATE, "text")
    pdf.multi_cell(COL_TOTAL - 4, 5, catatan)
    pdf.ln(3)


def _draw_signature(pdf: InvoicePDF, data: dict):
    sig_y = max(pdf.get_y() + 10, 235)
    pdf.set_y(sig_y)

    # Thin divider line
    _set_color(pdf, C_BORDER, "draw")
    pdf.line(15, pdf.get_y(), 15 + COL_TOTAL, pdf.get_y())
    pdf.ln(8)

    COL1_X  = 25
    COL2_X  = 135
    SIG_W   = 50

    # Labels
    pdf.set_font("Helvetica", "", 8.5)
    _set_color(pdf, C_SLATE, "text")
    pdf.set_x(COL1_X)
    pdf.cell(SIG_W, 5, "Dibuat oleh,")
    pdf.set_x(COL2_X)
    pdf.cell(SIG_W, 5, "Disetujui oleh,")

    # Signature lines
    pdf.ln(22)
    _set_color(pdf, C_SLATE, "draw")
    pdf.line(COL1_X, pdf.get_y(), COL1_X + SIG_W, pdf.get_y())
    pdf.line(COL2_X, pdf.get_y(), COL2_X + SIG_W, pdf.get_y())

    pdf.ln(3)
    pdf.set_font("Helvetica", "B", 8)
    _set_color(pdf, C_TEXT, "text")
    pdf.set_x(COL1_X)
    pdf.cell(SIG_W, 5, settings.COMPANY_NAME, align="C")
    pdf.set_x(COL2_X)
    pdf.cell(SIG_W, 5, data.get("dapur_nama", ""), align="C")


# ── PUBLIC FUNCTION ───────────────────────────────────────────────────────────

def generate_invoice_pdf(invoice_data: dict, output_dir: str = None) -> str:
    """
    Generate PDF Invoice premium.

    Returns: absolute path ke file PDF yang disimpan.
    """
    if output_dir is None:
        output_dir = os.path.join(settings.GENERATED_DIR, "invoices")
    os.makedirs(output_dir, exist_ok=True)

    pdf = InvoicePDF(orientation="P", unit="mm", format="A4")
    pdf.set_margins(left=15, top=15, right=15)
    pdf.set_auto_page_break(auto=True, margin=22)
    pdf.add_page()

    # ── 1. Top Header ──────────────────────────────────────────────────────────
    _draw_header(pdf, invoice_data)

    # ── 2. Info Boxes ─────────────────────────────────────────────────────────
    y_after_boxes = _draw_info_boxes(pdf, invoice_data)
    pdf.set_y(y_after_boxes)

    # ── 3. Table ──────────────────────────────────────────────────────────────
    _draw_table_header_row(pdf)

    details = invoice_data.get("details", [])
    for i, detail in enumerate(details):
        # Page break
        if pdf.get_y() > 242:
            pdf.add_page()
            pdf.set_y(15)
            # Compact continuation header
            # pyrefly: ignore [unknown-name]
            _set_color(pdf, C_NAVY, "fill")
            pdf.rect(0, 0, 210, 18, "F")
            pdf.set_xy(15, 4)
            pdf.set_font("Helvetica", "B", 10)
            _set_color(pdf, C_WHITE, "text")
            pdf.cell(0, 10, f"{settings.COMPANY_NAME}  –  {invoice_data.get('nomor_invoice', '')} (lanjutan)")
            pdf.set_y(22)
            _draw_table_header_row(pdf)

        _draw_item_row(pdf, i, detail)

    # ── 4. Totals ─────────────────────────────────────────────────────────────
    _draw_totals(pdf, invoice_data)

    # ── 5. Notes ──────────────────────────────────────────────────────────────
    _draw_notes(pdf, invoice_data.get("catatan", "") or "")

    # ── 6. Signature ──────────────────────────────────────────────────────────
    _draw_signature(pdf, invoice_data)

    # ── Save ──────────────────────────────────────────────────────────────────
    nomor = invoice_data.get("nomor_invoice", "unknown").replace("/", "-")
    filename = f"INV_{nomor}.pdf"
    filepath = os.path.join(output_dir, filename)
    pdf.output(filepath)
    return filepath
