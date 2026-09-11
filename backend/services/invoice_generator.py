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
    HARI = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"]
    try:
        if isinstance(d, str):
            try:
                from datetime import datetime
                d_obj = datetime.strptime(d[:10], "%Y-%m-%d")
                d = d_obj
            except ValueError:
                pass
                
        if hasattr(d, "weekday") and hasattr(d, "day"):
            hari = HARI[d.weekday()]
            return f"{hari}, {d.day} {BULAN[d.month]} {d.year}"
            
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
    pdf.rect(0, 0, 210, 32, "F")

    # Green bottom border strip
    _set_color(pdf, accent, "fill")
    pdf.rect(0, 29, 210, 3, "F")

    # Logo koperasi (kiri)
    logo_path = os.path.abspath(settings.LOGO_PATH)
    if os.path.exists(logo_path):
        pdf.image(logo_path, x=13, y=4, h=22)  # logo 22mm tinggi
        text_x = 42  # geser teks ke kanan
    else:
        text_x = 15

    # Company name
    pdf.set_xy(text_x, 6)
    pdf.set_font("Helvetica", "B", 15)
    _set_color(pdf, C_GREEN_DK, "text")
    pdf.cell(110 - (text_x - 15), 8, settings.COMPANY_NAME)

    # Company sub-info
    pdf.set_xy(text_x, 15)
    pdf.set_font("Helvetica", "", 7.5)
    _set_color(pdf, C_SLATE, "text")
    pdf.cell(110 - (text_x - 15), 4, settings.COMPANY_ADDRESS or "")
    pdf.set_xy(text_x, 20)
    if settings.COMPANY_PHONE:
        pdf.cell(110 - (text_x - 15), 4, f"Telp: {settings.COMPANY_PHONE}")

    # INVOICE / DRAFT label (right)
    pdf.set_xy(130, 5)
    pdf.set_font("Helvetica", "B", 22)
    _set_color(pdf, accent, "text")
    pdf.cell(65, 12, "DRAFT" if is_draft else "INVOICE", align="R")


def _draw_info_boxes(pdf: InvoicePDF, data: dict):
    """Two side-by-side info boxes: Tagihan Ke | Informasi Invoice."""
    BOX_TOP  = 35
    BOX_H    = 32
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
    pdf.set_xy(LEFT_X + 3, BOX_TOP + 8)
    pdf.set_font("Helvetica", "B", 9.5)
    _set_color(pdf, C_TEXT, "text")
    pdf.multi_cell(LEFT_W - 6, 5, data.get("dapur_nama", "-"))

    pdf.set_xy(LEFT_X + 3, min(pdf.get_y() + 0.5, BOX_TOP + 22))
    pdf.set_font("Helvetica", "", 7.5)
    _set_color(pdf, C_SLATE, "text")
    alamat = data.get("dapur_alamat", "") or ""
    pdf.multi_cell(LEFT_W - 6, 4, alamat[:60] if len(alamat) > 60 else alamat)

    kontak = data.get("dapur_kontak", "") or ""
    pdf.set_xy(LEFT_X + 3, min(pdf.get_y(), BOX_TOP + 32))
    pdf.set_font("Helvetica", "", 7.5)
    if kontak:
        pdf.cell(LEFT_W - 6, 4, f"Telp: {kontak}")

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

    y_r = BOX_TOP + 8
    for label, val in rows:
        if y_r > BOX_TOP + BOX_H - 4:
            break
        pdf.set_xy(RIGHT_X + 3, y_r)
        pdf.set_font("Helvetica", "", 7)
        _set_color(pdf, C_MUTED, "text")
        pdf.cell(26, 4.5, label + ":")
        pdf.set_font("Helvetica", "B", 7)
        if label == "Status":
            _set_color(pdf, (16, 185, 129) if status_str == "PAID" else (245, 158, 11), "text")
        else:
            _set_color(pdf, C_TEXT, "text")
        pdf.cell(50, 4.5, str(val)[:25])
        y_r += 5.5

    return BOX_TOP + BOX_H + 4  # Y after boxes


# ── SECTION: Table ────────────────────────────────────────────────────────────

def _draw_table_header_row(pdf: InvoicePDF):
    _set_color(pdf, C_GREEN, "fill")
    _set_color(pdf, C_WHITE, "text")
    pdf.set_font("Helvetica", "B", 7.5)
    pdf.set_x(15)
    for label, width, align in COLS:
        pdf.cell(width, 7, label, border=0, align=align, fill=True)
    pdf.ln()
    # Thin green line below header
    _set_color(pdf, C_GREEN_LT, "draw")
    pdf.line(15, pdf.get_y(), 15 + COL_TOTAL, pdf.get_y())


def _draw_item_row(pdf: InvoicePDF, i: int, detail: dict):
    nama_item = str(detail.get("nama_item", ""))

    # Estimate rows needed for nama_item in col width 77
    max_chars = 46
    estimated_lines = max(1, -(-len(nama_item) // max_chars))  # ceiling division
    row_h = max(5.5, estimated_lines * 4.2)

    bg = (i % 2 == 0)
    bg_color = C_BG_GREEN if bg else C_WHITE  # light green alt row
    y_start = pdf.get_y()

    pdf.set_font("Helvetica", "", 7)
    _set_color(pdf, C_TEXT, "text")

    x = 15
    for j, (_, width, align) in enumerate(COLS):
        _set_color(pdf, bg_color, "fill")
        if j == 1:  # Nama Item — multi_cell
            pdf.rect(x, y_start, width, row_h, "F")
            pdf.set_xy(x + 1.5, y_start + 1.2)
            pdf.multi_cell(width - 3, 4.0, nama_item, border=0, align="L")
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
    pdf.ln(10)


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
    pdf.ln(5)
    pdf.set_x(17)
    pdf.set_font("Helvetica", "", 8)
    _set_color(pdf, C_SLATE, "text")
    pdf.multi_cell(COL_TOTAL - 4, 4.5, catatan)
    pdf.ln(2)


def _draw_signature(pdf: InvoicePDF, data: dict):
    sig_y = max(pdf.get_y() + 6, 210)
    pdf.set_y(sig_y)

    # Thin divider line
    _set_color(pdf, C_BORDER, "draw")
    pdf.line(15, pdf.get_y(), 15 + COL_TOTAL, pdf.get_y())
    pdf.ln(4)

    COL1_X  = 25
    COL2_X  = 135
    SIG_W   = 50

    # City & Date line
    tgl_str = format_tanggal(data.get("tanggal_invoice"))
    pdf.set_font("Helvetica", "", 8.5)
    _set_color(pdf, C_SLATE, "text")
    pdf.set_x(COL1_X)
    pdf.cell(SIG_W, 4, f"Kota Cirebon, {tgl_str}", align="C")
    pdf.set_x(COL2_X)
    pdf.cell(SIG_W, 4, f"Kota Cirebon, {tgl_str}", align="C")
    pdf.ln(5)

    # Labels
    pdf.set_font("Helvetica", "", 8.5)
    _set_color(pdf, C_SLATE, "text")
    pdf.set_x(COL1_X)
    pdf.cell(SIG_W, 5, "Dibuat oleh,", align="C")
    pdf.set_x(COL2_X)
    pdf.cell(SIG_W, 5, "Disetujui oleh,", align="C")

    # Signature lines
    pdf.ln(13)
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


class InvoicePDF(FPDF):
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
    pdf.set_margins(left=15, top=12, right=15)
    pdf.set_auto_page_break(auto=True, margin=10)
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
        if pdf.get_y() > 262:
            pdf.add_page()
            pdf.set_y(12)
            # Compact continuation header
            _set_color(pdf, C_GREEN_DK, "fill")
            pdf.rect(0, 0, 210, 18, "F")
            pdf.set_xy(15, 4)
            pdf.set_font("Helvetica", "B", 10)
            _set_color(pdf, C_WHITE, "text")
            pdf.cell(0, 10, f"{settings.COMPANY_NAME}  -  {invoice_data.get('nomor_invoice', '')} (lanjutan)")
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


# ── Kolom untuk PDF versi margin (admin) ─────────────────────────────────────
COLS_MARGIN = [
    ("No",         8,  "C"),
    ("Nama Item",  48, "L"),
    ("Qty",        10, "C"),
    ("Sat",        11, "C"),
    ("H. Beli",    24, "R"),
    ("H. Jual",    24, "R"),
    ("Sub. Beli",  26, "R"),
    ("Sub. Jual",  26, "R"),
    ("Margin",     23, "R"),
]
COL_TOTAL_MARGIN = sum(w for _, w, _ in COLS_MARGIN)   # 200


def _draw_table_header_margin(pdf: InvoicePDF):
    _set_color(pdf, C_GREEN, "fill")
    _set_color(pdf, C_WHITE, "text")
    pdf.set_font("Helvetica", "B", 6.5)
    pdf.set_x(5)
    for label, width, align in COLS_MARGIN:
        pdf.cell(width, 7, label, border=0, align=align, fill=True)
    pdf.ln()
    _set_color(pdf, C_GREEN_LT, "draw")
    pdf.line(5, pdf.get_y(), 5 + COL_TOTAL_MARGIN, pdf.get_y())


def _draw_item_row_margin(pdf: InvoicePDF, i: int, detail: dict):
    nama_item = str(detail.get("nama_item", ""))
    max_chars = 30
    estimated_lines = max(1, -(-len(nama_item) // max_chars))
    row_h = max(5.5, estimated_lines * 4.0)

    bg = (i % 2 == 0)
    bg_color = C_BG_GREEN if bg else C_WHITE
    y_start = pdf.get_y()

    pdf.set_font("Helvetica", "", 6.5)
    _set_color(pdf, C_TEXT, "text")

    margin_nom = detail.get("margin_nominal", 0)
    margin_pct = detail.get("margin_persen", 0)

    x = 5
    for j, (_, width, align) in enumerate(COLS_MARGIN):
        _set_color(pdf, bg_color, "fill")
        if j == 1:  # Nama Item
            pdf.rect(x, y_start, width, row_h, "F")
            pdf.set_xy(x + 1.5, y_start + 1.2)
            pdf.multi_cell(width - 3, 3.8, nama_item, border=0, align="L")
        elif j == 8:  # Margin — 2 baris kecil
            mc = (16, 185, 129) if margin_pct >= 15 else (245, 158, 11) if margin_pct >= 10 else (239, 68, 68)
            _set_color(pdf, bg_color, "fill")
            pdf.rect(x, y_start, width, row_h, "F")
            pdf.set_xy(x, y_start + 0.5)
            pdf.set_font("Helvetica", "B", 7)
            _set_color(pdf, mc, "text")
            pdf.cell(width, row_h / 2, f"{margin_pct}%", border=0, align="R", fill=False)
            pdf.set_xy(x, y_start + row_h / 2)
            pdf.set_font("Helvetica", "", 5.8)
            pdf.cell(width, row_h / 2, format_rupiah(margin_nom), border=0, align="R", fill=False)
            pdf.set_font("Helvetica", "", 6.5)
            _set_color(pdf, C_TEXT, "text")
        else:
            if j == 0:
                text = str(i + 1)
            elif j == 2:
                qty_val = detail.get("qty", 0)
                text = f"{float(qty_val):,.2f}".rstrip("0").rstrip(".")
            elif j == 3:
                text = str(detail.get("satuan", ""))
            elif j == 4:
                text = format_rupiah(detail.get("harga_beli", 0))
            elif j == 5:
                text = format_rupiah(detail.get("harga_jual", 0))
            elif j == 6:
                text = format_rupiah(detail.get("subtotal_beli", 0))
            else:  # j == 7 Sub. Jual
                text = format_rupiah(detail.get("subtotal_jual", detail.get("subtotal", 0)))

            pdf.set_xy(x, y_start)
            if j == 7:
                pdf.set_font("Helvetica", "B", 7)
            pdf.cell(width, row_h, text, border=0, align=align, fill=True)
            pdf.set_font("Helvetica", "", 6.5)
            _set_color(pdf, C_TEXT, "text")
        x += width

    pdf.set_y(y_start + row_h)
    _set_color(pdf, C_DIVIDER, "draw")
    pdf.line(5, pdf.get_y(), 5 + COL_TOTAL_MARGIN, pdf.get_y())


def _draw_totals_margin(pdf: InvoicePDF, data: dict, margin_info: dict):
    pdf.ln(2)
    _set_color(pdf, C_BORDER, "draw")
    pdf.line(5, pdf.get_y(), 5 + COL_TOTAL_MARGIN, pdf.get_y())
    pdf.ln(4)

    label_w = 48
    value_w = 42
    right_x = 5 + COL_TOTAL_MARGIN - label_w - value_w

    def _kv(label, value, lc=None, vc=None, bold=False):
        pdf.set_xy(right_x, pdf.get_y())
        pdf.set_font("Helvetica", "B" if bold else "", 8)
        _set_color(pdf, lc or C_SLATE, "text")
        pdf.cell(label_w, 7, label, align="L")
        _set_color(pdf, vc or C_TEXT, "text")
        pdf.cell(value_w, 7, value, align="R")
        pdf.ln(7)

    _kv("Total Modal (Beli):", format_rupiah(margin_info.get("total_harga_beli", 0)))
    _kv("Total Tagihan (Jual):", format_rupiah(margin_info.get("total_harga_jual", data.get("total", 0))))

    margin_pct = margin_info.get("margin_persen_total", 0)
    margin_nom = margin_info.get("total_margin_nominal", 0)
    mc = (16, 185, 129) if margin_pct >= 15 else (245, 158, 11) if margin_pct >= 10 else (239, 68, 68)

    bx, by, bw = right_x, pdf.get_y(), label_w + value_w
    _set_color(pdf, mc, "fill")
    pdf.rect(bx, by, bw, 10, "F")
    pdf.set_xy(bx + 2, by + 1)
    pdf.set_font("Helvetica", "B", 8.5)
    _set_color(pdf, C_WHITE, "text")
    pdf.cell(label_w, 8, "Keuntungan / Margin:")
    pct_text = f"{margin_pct}%"
    nom_text = f"({format_rupiah(margin_nom)})"
    pdf.cell(value_w, 8, f"{pct_text}  {nom_text}", align="R")
    pdf.ln(13)

    _set_color(pdf, C_GREEN_DK, "fill")
    pdf.set_xy(right_x, pdf.get_y())
    pdf.set_font("Helvetica", "B", 9.5)
    _set_color(pdf, C_WHITE, "text")
    pdf.cell(label_w, 12, "TOTAL TAGIHAN", fill=True, align="C")
    _set_color(pdf, C_GREEN, "fill")
    pdf.cell(value_w, 12, format_rupiah(data.get("total", 0)), fill=True, align="R")
    pdf.ln(14)


def generate_invoice_pdf_with_margin(invoice_data: dict, margin_info: dict, output_dir: str = None) -> str:
    """
    Generate PDF Invoice VERSI ADMIN (A4 Landscape) dengan kolom H.Beli, H.Jual, Margin per item.
    Hanya untuk admin — bersifat konfidensial.

    Args:
        invoice_data: dict standar invoice (sama dengan generate_invoice_pdf)
        margin_info:  dict dari endpoint /{id}/margin
        output_dir:   direktori output

    Returns: absolute path ke file PDF.
    """
    if output_dir is None:
        output_dir = os.path.join(settings.GENERATED_DIR, "invoices_margin")
    os.makedirs(output_dir, exist_ok=True)

    pdf = InvoicePDF(orientation="L", unit="mm", format="A4")
    pdf.set_margins(left=5, top=12, right=5)
    pdf.set_auto_page_break(auto=True, margin=10)
    pdf.add_page()
    pdf.set_left_margin(5)
    pdf.set_right_margin(5)

    # ── 1. Header (landscape 297mm) ────────────────────────────────────────────
    is_draft = invoice_data.get("is_draft", False)
    accent = C_ORANGE if is_draft else C_GREEN
    _set_color(pdf, C_WHITE, "fill")
    pdf.rect(0, 0, 297, 32, "F")
    _set_color(pdf, accent, "fill")
    pdf.rect(0, 29, 297, 3, "F")

    logo_path = os.path.abspath(settings.LOGO_PATH)
    if os.path.exists(logo_path):
        pdf.image(logo_path, x=7, y=4, h=22)
        text_x = 36
    else:
        text_x = 7

    pdf.set_xy(text_x, 6)
    pdf.set_font("Helvetica", "B", 14)
    _set_color(pdf, C_GREEN_DK, "text")
    pdf.cell(120, 8, settings.COMPANY_NAME)
    pdf.set_xy(text_x, 15)
    pdf.set_font("Helvetica", "", 7.5)
    _set_color(pdf, C_SLATE, "text")
    pdf.cell(120, 4, settings.COMPANY_ADDRESS or "")

    pdf.set_xy(175, 5)
    pdf.set_font("Helvetica", "B", 20)
    _set_color(pdf, accent, "text")
    pdf.cell(100, 10, "DRAFT" if is_draft else "INVOICE", align="R")

    # Badge konfidensial
    pdf.set_xy(190, 18)
    _set_color(pdf, (234, 88, 12), "fill")
    pdf.set_font("Helvetica", "B", 7.5)
    _set_color(pdf, C_WHITE, "text")
    pdf.cell(82, 7, "  \u2605 ADMIN COPY \u2014 KONFIDENSIAL \u2605  ", fill=True, align="C")
    _set_color(pdf, C_TEXT, "text")

    # ── 2. Info boxes (landscape: 3 kotak) ────────────────────────────────────
    BOX_TOP = 35
    BOX_H   = 28

    def _box(x, w, title, rows_fn):
        _set_color(pdf, C_WHITE, "fill")
        _set_color(pdf, C_BORDER, "draw")
        pdf.rect(x, BOX_TOP, w, BOX_H, "DF")
        _set_color(pdf, C_GREEN, "fill")
        pdf.rect(x, BOX_TOP, w, 7, "F")
        pdf.set_xy(x + 3, BOX_TOP + 1)
        pdf.set_font("Helvetica", "B", 7)
        _set_color(pdf, C_WHITE, "text")
        pdf.cell(w - 4, 5, title)
        rows_fn(x, w)

    # Box 1: Tagihan Ke
    def rows_tagihan(x, w):
        pdf.set_xy(x + 3, BOX_TOP + 9)
        pdf.set_font("Helvetica", "B", 9)
        _set_color(pdf, C_TEXT, "text")
        pdf.multi_cell(w - 6, 5, invoice_data.get("dapur_nama", "-"))
        pdf.set_xy(x + 3, min(pdf.get_y() + 1, BOX_TOP + 22))
        pdf.set_font("Helvetica", "", 7)
        _set_color(pdf, C_SLATE, "text")
        alamat = invoice_data.get("dapur_alamat", "") or ""
        pdf.multi_cell(w - 6, 4, alamat[:80])

    _box(5, 90, "TAGIHAN KEPADA", rows_tagihan)

    # Box 2: Info Invoice
    status_str = invoice_data.get("status", "unpaid").upper()
    ref = invoice_data.get("nomor_realisasi") or invoice_data.get("nomor_po", "")
    info_rows = [
        ("No. Invoice", invoice_data.get("nomor_invoice", "-")),
        ("Tanggal",     format_tanggal(invoice_data.get("tanggal_invoice"))),
        ("Jatuh Tempo", format_tanggal(invoice_data.get("jatuh_tempo"))),
        ("Status",      status_str),
    ]
    if ref:
        info_rows.insert(2, ("Ref.", ref))

    def rows_info(x, w):
        y_r = BOX_TOP + 9
        for label, val in info_rows:
            if y_r > BOX_TOP + BOX_H - 4:
                break
            pdf.set_xy(x + 3, y_r)
            pdf.set_font("Helvetica", "", 7)
            _set_color(pdf, C_MUTED, "text")
            pdf.cell(28, 4.5, label + ":")
            pdf.set_font("Helvetica", "B", 7)
            _set_color(pdf, C_TEXT, "text")
            pdf.cell(w - 34, 4.5, str(val)[:35])
            y_r += 5.2

    _box(100, 95, "INFORMASI INVOICE", rows_info)

    # Box 3: Margin Summary
    mp = margin_info.get("margin_persen_total", 0)
    mc_color = (16, 185, 129) if mp >= 15 else (245, 158, 11) if mp >= 10 else (239, 68, 68)

    def rows_margin(x, w):
        items_def = [
            ("Total Modal:",   format_rupiah(margin_info.get("total_harga_beli", 0)),   C_SLATE),
            ("Total Tagihan:", format_rupiah(margin_info.get("total_harga_jual", invoice_data.get("total", 0))), C_SLATE),
        ]
        y_r = BOX_TOP + 9
        for label, val, lc in items_def:
            pdf.set_xy(x + 3, y_r)
            pdf.set_font("Helvetica", "", 7)
            _set_color(pdf, lc, "text")
            pdf.cell(30, 4.5, label)
            pdf.set_font("Helvetica", "B", 7)
            _set_color(pdf, C_TEXT, "text")
            pdf.cell(w - 36, 4.5, val, align="R")
            y_r += 5.5
        # Margin highlight
        bx2, by2 = x + 3, y_r
        _set_color(pdf, mc_color, "fill")
        pdf.rect(bx2, by2, w - 6, 9, "F")
        pdf.set_xy(bx2 + 1, by2 + 1)
        pdf.set_font("Helvetica", "B", 8)
        _set_color(pdf, C_WHITE, "text")
        pdf.cell(28, 7, "Keuntungan:")
        pdf.cell(w - 38, 7, f"{mp}%  ({format_rupiah(margin_info.get('total_margin_nominal', 0))})", align="R")

    _box(200, 92, "RINGKASAN MARGIN", rows_margin)

    # ── 3. Tabel item ──────────────────────────────────────────────────────────
    pdf.set_y(BOX_TOP + BOX_H + 4)
    _draw_table_header_margin(pdf)

    margin_items_by_id = {
        mi["detail_id"]: mi
        for mi in margin_info.get("items", [])
        if mi.get("detail_id") is not None
    }
    details = invoice_data.get("details", [])
    for i, detail in enumerate(details):
        if pdf.get_y() > 180:
            pdf.add_page()
            pdf.set_y(12)
            _set_color(pdf, C_GREEN_DK, "fill")
            pdf.rect(0, 0, 297, 18, "F")
            pdf.set_xy(5, 4)
            pdf.set_font("Helvetica", "B", 10)
            _set_color(pdf, C_WHITE, "text")
            pdf.cell(0, 10, f"{settings.COMPANY_NAME}  \u2014  {invoice_data.get('nomor_invoice', '')} (lanjutan) \u2014 ADMIN COPY")
            pdf.set_y(22)
            _draw_table_header_margin(pdf)

        mi = margin_items_by_id.get(detail.get("detail_id"), {})
        enriched = {
            **detail,
            "harga_beli":    mi.get("harga_beli",    detail.get("harga_beli", 0)),
            "harga_jual":    mi.get("harga_jual",    detail.get("harga_jual", 0)),
            "subtotal_beli": mi.get("subtotal_beli", 0),
            "subtotal_jual": mi.get("subtotal_jual", detail.get("subtotal", 0)),
            "margin_nominal": mi.get("margin_nominal", 0),
            "margin_persen":  mi.get("margin_persen",  0),
        }
        _draw_item_row_margin(pdf, i, enriched)

    # ── 4. Totals + Margin ────────────────────────────────────────────────────
    _draw_totals_margin(pdf, invoice_data, margin_info)

    # ── 5. Notes ──────────────────────────────────────────────────────────────
    catatan = invoice_data.get("catatan", "") or ""
    if catatan:
        pdf.set_x(5)
        _set_color(pdf, C_GREEN_LT, "fill")
        _set_color(pdf, C_BORDER, "draw")
        pdf.rect(5, pdf.get_y(), COL_TOTAL_MARGIN, 5, "F")
        pdf.set_xy(7, pdf.get_y() + 0.5)
        pdf.set_font("Helvetica", "B", 7)
        _set_color(pdf, C_GREEN_DK, "text")
        pdf.cell(0, 4, "CATATAN")
        pdf.ln(5)
        pdf.set_x(7)
        pdf.set_font("Helvetica", "", 8)
        _set_color(pdf, C_SLATE, "text")
        pdf.multi_cell(COL_TOTAL_MARGIN - 4, 4.5, catatan)
        pdf.ln(2)

    # ── 6. Footer konfidensial ─────────────────────────────────────────────────
    sig_y = max(pdf.get_y() + 4, 165)
    pdf.set_y(sig_y)
    _set_color(pdf, C_BORDER, "draw")
    pdf.line(5, pdf.get_y(), 5 + COL_TOTAL_MARGIN, pdf.get_y())
    pdf.ln(3)
    pdf.set_font("Helvetica", "I", 7.5)
    _set_color(pdf, C_MUTED, "text")
    pdf.cell(0, 5, "\u2605 Dokumen ini bersifat KONFIDENSIAL dan hanya untuk keperluan internal manajemen. \u2605", align="C")

    # ── Save ──────────────────────────────────────────────────────────────────
    nomor = invoice_data.get("nomor_invoice", "unknown").replace("/", "-")
    filename = f"INV_{nomor}_MARGIN.pdf"
    filepath = os.path.join(output_dir, filename)
    pdf.output(filepath)
    return filepath


# ── Invoice Kendaraan ─────────────────────────────────────────────────────────

def _draw_header_kendaraan(pdf: InvoicePDF, data: dict):
    # Header bar
    pdf.set_y(0)
    _set_color(pdf, C_GREEN_DK, "fill")
    pdf.rect(0, 0, 210, 25, "F")
    
    pdf.set_xy(15, 6)
    pdf.set_font("Helvetica", "B", 18)
    _set_color(pdf, C_WHITE, "text")
    pdf.cell(0, 10, "INVOICE KENDARAAN")
    
    pdf.set_xy(15, 14)
    pdf.set_font("Helvetica", "B", 10)
    pdf.cell(0, 10, settings.COMPANY_NAME)
    
    status = str(data.get("status", "UNPAID")).upper()
    pdf.set_xy(160, 6)
    pdf.set_font("Helvetica", "B", 12)
    if status == "PAID":
        _set_color(pdf, (255, 255, 255), "text")
        pdf.cell(35, 12, "LUNAS", align="R")
    else:
        _set_color(pdf, (254, 202, 202), "text")  # red-200
        pdf.cell(35, 12, status, align="R")
        
    pdf.set_y(32)

def _draw_info_boxes_kendaraan(pdf: InvoicePDF, data: dict) -> float:
    # 2 boxes layout
    box_w = 85
    gap = 10
    h_box = 32
    x1, x2 = 15, 15 + box_w + gap
    y = pdf.get_y()

    def _box(x, title, lines):
        _set_color(pdf, C_GREEN_LT, "fill")
        _set_color(pdf, C_BORDER, "draw")
        pdf.rect(x, y, box_w, 6, "FD")  # Header
        pdf.set_xy(x + 2, y + 1)
        pdf.set_font("Helvetica", "B", 7)
        _set_color(pdf, C_GREEN_DK, "text")
        pdf.cell(box_w - 4, 4, title)

        _set_color(pdf, C_WHITE, "fill")
        pdf.rect(x, y + 6, box_w, h_box - 6, "FD")  # Body
        curr_y = y + 8
        for k, v in lines:
            pdf.set_xy(x + 3, curr_y)
            pdf.set_font("Helvetica", "", 7.5)
            _set_color(pdf, C_MUTED, "text")
            pdf.cell(25, 4, k)
            pdf.set_xy(x + 28, curr_y)
            pdf.set_font("Helvetica", "B", 7.5)
            _set_color(pdf, C_TEXT, "text")
            pdf.cell(box_w - 30, 4, v)
            curr_y += 5

    # Box 1: Info Dapur
    dapur_lines = [
        ("Nama Dapur", str(data.get("dapur_nama", "-"))),
        ("Alamat", str(data.get("dapur_alamat", "-"))),
        ("Kontak", str(data.get("dapur_kontak", "-"))),
    ]
    _box(x1, "TAGIHAN KEPADA", dapur_lines)

    # Box 2: Info Invoice
    tgl_str = format_tanggal(data.get("tanggal_invoice"))
    inv_lines = [
        ("Nomor Invoice", str(data.get("nomor_invoice", "-"))),
        ("Tanggal", tgl_str),
    ]
    _box(x2, "INFORMASI INVOICE", inv_lines)

    return y + h_box + 8

def _draw_table_kendaraan(pdf: InvoicePDF, data: dict):
    # Table Header
    COLS_KND = [
        ("No", 10, "C"),
        ("Kendaraan", 80, "L"),
        ("Satuan Waktu", 25, "C"),
        ("Kuantitas", 15, "C"),
        ("Harga Satuan", 25, "R"),
        ("Subtotal", 25, "R"),
    ]
    COL_TOTAL_KND = sum(w for _, w, _ in COLS_KND)

    _set_color(pdf, C_GREEN_DK, "fill")
    _set_color(pdf, C_WHITE, "text")
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_x(15)
    for label, width, align in COLS_KND:
        pdf.cell(width, 9, label, border=0, align=align, fill=True)
    pdf.ln()

    # Table Row
    pdf.set_font("Helvetica", "", 8)
    _set_color(pdf, C_TEXT, "text")
    _set_color(pdf, C_WHITE, "fill")
    pdf.set_x(15)
    
    qty_val = float(data.get("kuantitas", 0))
    qty_str = f"{qty_val:,.2f}".rstrip("0").rstrip(".")

    for j, (_, width, align) in enumerate(COLS_KND):
        if j == 0: text = "1"
        elif j == 1: text = data.get("kendaraan", "")
        elif j == 2: text = data.get("satuan_waktu", "").title()
        elif j == 3: text = qty_str
        elif j == 4: text = format_rupiah(data.get("harga_satuan", 0))
        elif j == 5: text = format_rupiah(data.get("total_harga", 0))

        pdf.cell(width, 10, text, border="B", align=align, fill=True)
    pdf.ln()
    
    # Totals
    pdf.ln(2)
    label_w = 48
    value_w = 32
    right_x = 15 + COL_TOTAL_KND - label_w - value_w

    _set_color(pdf, C_GREEN_DK, "fill")
    pdf.set_xy(right_x, pdf.get_y())
    pdf.set_font("Helvetica", "B", 9.5)
    _set_color(pdf, C_WHITE, "text")
    pdf.cell(label_w, 12, "TOTAL TAGIHAN", fill=True, align="C")

    _set_color(pdf, C_GREEN, "fill")
    pdf.set_font("Helvetica", "B", 9.5)
    _set_color(pdf, C_WHITE, "text")
    pdf.cell(value_w, 12, format_rupiah(data.get("total_harga", 0)), fill=True, align="R")
    pdf.ln(15)


def generate_invoice_kendaraan_pdf(invoice_data: dict, output_dir: str = None) -> str:
    """Generate PDF khusus Invoice Kendaraan."""
    if output_dir is None:
        output_dir = os.path.join(settings.GENERATED_DIR, "invoices_kendaraan")
    os.makedirs(output_dir, exist_ok=True)

    pdf = InvoicePDF(orientation="P", unit="mm", format="A4")
    pdf.set_margins(left=15, top=12, right=15)
    pdf.set_auto_page_break(auto=True, margin=10)
    pdf.add_page()

    _draw_header_kendaraan(pdf, invoice_data)
    y_after_boxes = _draw_info_boxes_kendaraan(pdf, invoice_data)
    pdf.set_y(y_after_boxes)
    
    _draw_table_kendaraan(pdf, invoice_data)
    _draw_notes(pdf, invoice_data.get("catatan", ""))
    _draw_signature(pdf, invoice_data)

    nomor = invoice_data.get("nomor_invoice", "unknown").replace("/", "-")
    filename = f"INV-KND_{nomor}.pdf"
    filepath = os.path.join(output_dir, filename)
    pdf.output(filepath)
    return filepath
