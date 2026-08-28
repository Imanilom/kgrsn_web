"""
Price Service - kalkulasi otomatis harga jual dari harga beli.
Margin dapat diubah dinamis via konfigurasi sistem (tabel KonfigurasiSystem).
"""
from decimal import Decimal, ROUND_HALF_UP
from config import settings


def hitung_harga_jual(
    harga_beli: Decimal,
    margin: Decimal = None,
    db=None,
) -> Decimal:
    """
    Hitung harga jual berdasarkan margin.
    Jika margin None, default ke 0 (harga jual = harga beli).
    """
    if margin is None:
        margin = Decimal("0.0")
        
    harga_jual = Decimal(str(harga_beli)) * (1 + margin)
    return harga_jual.quantize(Decimal("1"), rounding=ROUND_HALF_UP)


def hitung_keuntungan(harga_beli: Decimal, harga_jual: Decimal) -> dict:
    """Hitung ringkasan profit dari pasangan harga beli dan jual."""
    keuntungan = harga_jual - harga_beli
    margin_aktual = (keuntungan / harga_jual * 100) if harga_jual > 0 else Decimal(0)
    markup_persen = (keuntungan / harga_beli * 100) if harga_beli > 0 else Decimal(0)
    return {
        "harga_beli": float(harga_beli),
        "harga_jual": float(harga_jual),
        "keuntungan": float(keuntungan),
        "margin_persen": float(margin_aktual.quantize(Decimal("0.01"))),
        "markup_persen": float(markup_persen.quantize(Decimal("0.01"))),
    }


def hitung_total_po(details: list) -> Decimal:
    """Hitung total nilai PO dari list detail."""
    return sum(
        Decimal(str(d.qty)) * Decimal(str(d.harga_satuan))
        for d in details
    )


def hitung_total_invoice(details: list) -> Decimal:
    """Hitung total invoice dari list detail (menggunakan harga_jual)."""
    return sum(Decimal(str(d.subtotal)) for d in details)
