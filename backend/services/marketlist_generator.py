"""
Marketlist PDF Generator menggunakan fpdf2.
"""
from fpdf import FPDF
from datetime import date
from config import settings
import os

def format_tanggal(d) -> str:
    if not d:
        return "-"
    BULAN = [
        "", "Januari", "Februari", "Maret", "April", "Mei", "Juni",
        "Juli", "Agustus", "September", "Oktober", "November", "Desember"
    ]
    try:
        if isinstance(d, str):
            parts = d.split("-")
            if len(parts) == 3:
                return f"{int(parts[2])} {BULAN[int(parts[1])]} {parts[0]}"
        return f"{d.day} {BULAN[d.month]} {d.year}"
    except Exception:
        return str(d)

def format_qty(val) -> str:
    if val is None:
        return "0"
    try:
        f_val = float(val)
        if f_val % 1 == 0:
            return f"{int(f_val):,}"
        return f"{f_val:,.3f}".rstrip("0").rstrip(".")
    except Exception:
        return str(val)

class MarketlistPDF(FPDF):
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
        self.cell(0, 10, f"Halaman {self.page_no()} | Marketlist ini digenerate secara otomatis", align="C")

def _draw_table_header(pdf):
    pdf.set_fill_color(226, 232, 240)  # Slate 200
    pdf.rect(10, pdf.get_y(), 190, 8, "F")
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(51, 65, 85)  # Slate 700
    pdf.set_x(10)
    pdf.cell(120, 8, "  ITEM BAHAN", border=0)
    pdf.cell(70, 8, "TOTAL QTY  ", border=0, align="R")
    pdf.ln(10)

def generate_marketlist_pdf(marketlist_data: dict, output_dir: str = None) -> str:
    """
    Generate PDF Marketlist yang berisi rekap item, total qty dan breakdown per dapur.
    """
    if output_dir is None:
        output_dir = os.path.join(settings.GENERATED_DIR, "marketlist")
    os.makedirs(output_dir, exist_ok=True)

    pdf = MarketlistPDF(orientation="P", unit="mm", format="A4")  # Portrait
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=20)

    # ── Header ─────────────────────────────────────────────────────────────────
    pdf.set_fill_color(15, 23, 42)  # Slate 900
    pdf.rect(0, 0, 210, 38, "F")

    pdf.set_xy(10, 8)
    pdf.set_font("Helvetica", "B", 17)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(140, 10, settings.COMPANY_NAME)

    pdf.set_xy(10, 21)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(148, 163, 184)
    pdf.cell(140, 5, settings.COMPANY_ADDRESS)

    # Label kanan
    pdf.set_xy(100, 6)
    pdf.set_font("Helvetica", "B", 18)
    pdf.set_text_color(59, 130, 246)  # Blue
    pdf.cell(100, 12, "MARKETLIST", align="R")

    pdf.set_xy(100, 20)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(148, 163, 184)
    pdf.cell(100, 5, f"Tanggal PO: {format_tanggal(marketlist_data.get('tanggal'))}", align="R")

    pdf.set_xy(100, 26)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(251, 191, 36)  # Amber
    pdf.cell(100, 5, f"Dapur: {marketlist_data.get('dapur_name')}", align="R")

    # ── Header Tabel Item ───────────────────────────────────────────────────────
    pdf.set_y(45)
    _draw_table_header(pdf)

    items = marketlist_data.get("items", [])
    if not items:
        pdf.set_font("Helvetica", "I", 10)
        pdf.set_text_color(100, 116, 139)
        pdf.cell(190, 10, "Tidak ada item bahan pada tanggal ini.", align="C")

    for i, item in enumerate(items):
        breakdown = item.get("breakdown", {})
        num_breakdown = len(breakdown)
        needed_height = 8 + (num_breakdown * 5 if num_breakdown > 0 else 0) + 4

        if pdf.get_y() + needed_height > 270:
            pdf.add_page()
            _draw_table_header(pdf)

        cur_y = pdf.get_y()
        pdf.set_x(10)

        # Background baris utama item
        pdf.set_fill_color(248, 250, 252)  # Slate 50
        pdf.rect(10, cur_y, 190, 8, "F")

        # Line border
        pdf.set_draw_color(226, 232, 240)
        pdf.line(10, cur_y + 8, 200, cur_y + 8)

        # Nama Item
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(15, 23, 42)
        pdf.cell(120, 8, f"  {i+1}. {item.get('nama_item')}", border=0)

        # Total Qty & Satuan
        qty_total = item.get("qty_total", 0)
        satuan = item.get("satuan", "")
        qty_str = format_qty(qty_total)

        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(16, 185, 129)  # Emerald 600
        pdf.cell(70, 8, f"{qty_str} {satuan}  ", border=0, align="R")
        pdf.ln(9)

        # Breakdown Dapur
        if breakdown:
            for dpr, d_qty in breakdown.items():
                d_qty_str = format_qty(d_qty)
                pdf.set_x(18)
                pdf.set_text_color(100, 116, 139)  # Bullet color
                pdf.cell(5, 5, "-", border=0)
                pdf.set_text_color(51, 65, 85)  # Dapur name color
                pdf.set_font("Helvetica", "", 9)
                pdf.cell(60, 5, f"{dpr}", border=0)
                pdf.set_font("Helvetica", "B", 9)
                pdf.set_text_color(30, 41, 59)
                pdf.cell(105, 5, f"{d_qty_str} {satuan}", border=0, align="L")
                pdf.ln(5)
            pdf.ln(3)
        else:
            pdf.ln(2)

    # Simpan PDF
    tanggal_str = str(marketlist_data.get("tanggal", "unknown"))
    filename = f"Marketlist_{tanggal_str}.pdf"
    filepath = os.path.join(output_dir, filename)
    pdf.output(filepath)
    return filepath

