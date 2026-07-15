"""
Price Service - kalkulasi otomatis harga jual dari harga beli.
Margin dapat diubah dinamis via konfigurasi sistem (tabel KonfigurasiSystem).
"""
from decimal import Decimal, ROUND_HALF_UP
from config import settings


def _default_margin() -> Decimal:
    """Baca margin default dari settings (fallback statis)."""
    return Decimal(str(settings.MARGIN_PERSEN))


def hitung_harga_jual(
    harga_beli: Decimal,
    margin: Decimal = None,
    db=None,
) -> Decimal:
    """
    Hitung harga jual berdasarkan margin.

    Harga Jual = Harga Beli × (1 + margin)

    Args:
        harga_beli: harga beli satuan
        margin: Decimal seperti 0.15 untuk 15%.
                Jika None dan db diberikan, baca dari KonfigurasiSystem di DB.
                Jika None dan db tidak diberikan, fallback ke settings.MARGIN_PERSEN.
        db: SQLAlchemy Session (opsional). Digunakan untuk membaca margin dinamis.
    """
    if margin is None:
        if db is not None:
            # Import di sini untuk menghindari circular import
            from routers.config import get_margin_persen
            margin = get_margin_persen(db)
        else:
            margin = _default_margin()
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
