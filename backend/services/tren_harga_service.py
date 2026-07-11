"""
Tren Harga Service — Analisis statistik, tren, dan forecast harga pembelian.

Pipeline:
1. Ambil histori harga dari price_history
2. Bersihkan data (deduplikasi, outlier)
3. Hitung statistik deskriptif
4. Hitung moving averages
5. Deteksi tren
6. Forecast harga
7. Tentukan margin dinamis
8. Validasi HET
9. Hitung skor rekomendasi
"""
import logging
import statistics
from datetime import date, timedelta
from typing import Optional

logger = logging.getLogger(__name__)


# ── Analisis Statistik ───────────────────────────────────────────────────────

def hitung_statistik(prices: list[float]) -> dict:
    """Hitung statistik deskriptif dari list harga."""
    if not prices:
        return {}
    n = len(prices)
    mean_val = statistics.mean(prices)
    std_val  = statistics.stdev(prices) if n >= 2 else 0.0
    cv       = (std_val / mean_val * 100) if mean_val > 0 else 0.0

    try:
        modus = statistics.mode(prices)
    except statistics.StatisticsError:
        modus = mean_val

    return {
        "n":      n,
        "mean":   round(mean_val, 2),
        "median": round(statistics.median(prices), 2),
        "modus":  round(modus, 2),
        "min":    round(min(prices), 2),
        "max":    round(max(prices), 2),
        "std":    round(std_val, 2),
        "cv":     round(cv, 2),   # coefficient of variation (%)
    }


# ── Moving Averages ──────────────────────────────────────────────────────────

def hitung_ma(prices: list[float], window: int) -> list[Optional[float]]:
    """Simple Moving Average."""
    result = []
    for i in range(len(prices)):
        if i < window - 1:
            result.append(None)
        else:
            result.append(round(statistics.mean(prices[i - window + 1 : i + 1]), 2))
    return result


def hitung_ema(prices: list[float], alpha: float = 0.3) -> list[float]:
    """Exponential Moving Average."""
    if not prices:
        return []
    ema = [prices[0]]
    for p in prices[1:]:
        ema.append(round(alpha * p + (1 - alpha) * ema[-1], 2))
    return ema


def hitung_wma(prices: list[float], window: int = 7) -> list[Optional[float]]:
    """Weighted Moving Average (bobot lebih besar untuk data terbaru)."""
    result = []
    weights = list(range(1, window + 1))
    total_w = sum(weights)
    for i in range(len(prices)):
        if i < window - 1:
            result.append(None)
        else:
            window_data = prices[i - window + 1 : i + 1]
            wma = sum(w * p for w, p in zip(weights, window_data)) / total_w
            result.append(round(wma, 2))
    return result


# ── Deteksi Tren ─────────────────────────────────────────────────────────────

def _linear_regression(x: list[float], y: list[float]) -> tuple[float, float]:
    """Linear regression sederhana. Returns (slope, intercept)."""
    n = len(x)
    if n < 2:
        return 0.0, y[0] if y else 0.0
    sum_x  = sum(x)
    sum_y  = sum(y)
    sum_xy = sum(xi * yi for xi, yi in zip(x, y))
    sum_xx = sum(xi ** 2 for xi in x)
    denom  = n * sum_xx - sum_x ** 2
    if denom == 0:
        return 0.0, sum_y / n
    slope     = (n * sum_xy - sum_x * sum_y) / denom
    intercept = (sum_y - slope * sum_x) / n
    return slope, intercept


def deteksi_tren(prices: list[float]) -> dict:
    """
    Deteksi tren harga.
    Returns: { status, slope, pct_change, arah, label_color }
    """
    if len(prices) < 2:
        return {"status": "stabil", "slope": 0, "pct_change": 0, "arah": "→"}

    x = list(range(len(prices)))
    slope, intercept = _linear_regression(x, prices)

    # Pct change dari harga awal ke harga akhir (keseluruhan periode)
    pct_change = ((prices[-1] - prices[0]) / prices[0] * 100) if prices[0] > 0 else 0
    pct_change = round(pct_change, 2)

    # Normalisasi slope ke persentase per transaksi
    slope_pct = (slope / prices[0] * 100) if prices[0] > 0 else 0

    if slope_pct > 0.5:
        status = "naik"
        arah = "↑"
    elif slope_pct < -0.5:
        status = "turun"
        arah = "↓"
    else:
        status = "stabil"
        arah = "→"

    return {
        "status":     status,
        "slope":      round(slope, 2),
        "slope_pct":  round(slope_pct, 2),
        "pct_change": pct_change,
        "arah":       arah,
    }


# ── Forecast ─────────────────────────────────────────────────────────────────

def _holt_linear(prices: list[float], alpha: float = 0.3, beta: float = 0.1) -> dict:
    """
    Holt's Linear Exponential Smoothing.
    Lebih akurat dari simple EMA untuk data dengan tren.
    """
    if len(prices) < 3:
        return None
    level = prices[0]
    trend = prices[1] - prices[0]

    for p in prices[1:]:
        prev_level = level
        level = alpha * p + (1 - alpha) * (level + trend)
        trend = beta * (level - prev_level) + (1 - beta) * trend

    return {
        "forecast_1":  round(level + trend, 2),       # 1 periode kedepan
        "forecast_7":  round(level + 7 * trend, 2),   # 7 periode (minggu depan)
        "forecast_30": round(level + 30 * trend, 2),  # 30 periode (bulan depan)
        "trend_val":   round(trend, 2),
    }


def forecast_harga(prices: list[float], dates: list[str] = None) -> dict:
    """
    Forecast menggunakan Linear Regression + Holt Linear.
    Returns: { minggu_depan, bulan_depan, metode, ci_lower, ci_upper }
    """
    if not prices:
        return {
            "minggu_depan": None, "bulan_depan": None,
            "metode": "tidak_cukup_data", "ci_lower": None, "ci_upper": None
        }

    n = len(prices)
    x = list(range(n))
    slope, intercept = _linear_regression(x, prices)

    lr_minggu = round(intercept + slope * (n + 6), 2)
    lr_bulan  = round(intercept + slope * (n + 29), 2)

    # Confidence interval (±1.5 * std)
    residuals = [prices[i] - (intercept + slope * i) for i in range(n)]
    std_res   = statistics.stdev(residuals) if n >= 2 else 0
    ci_half   = round(1.5 * std_res, 2)

    # Pilih metode terbaik
    if n >= 10:
        holt = _holt_linear(prices)
        if holt:
            minggu_depan = holt["forecast_7"]
            bulan_depan  = holt["forecast_30"]
            metode = "holt_linear"
        else:
            minggu_depan = lr_minggu
            bulan_depan  = lr_bulan
            metode = "linear_regression"
    else:
        minggu_depan = lr_minggu
        bulan_depan  = lr_bulan
        metode = "linear_regression"

    # Pastikan tidak negatif
    minggu_depan = max(minggu_depan, 0)
    bulan_depan  = max(bulan_depan, 0)

    return {
        "minggu_depan": minggu_depan,
        "bulan_depan":  bulan_depan,
        "ci_lower":     max(minggu_depan - ci_half, 0),
        "ci_upper":     minggu_depan + ci_half,
        "metode":       metode,
    }


# ── Margin Engine ─────────────────────────────────────────────────────────────

def hitung_margin_rekomendasi(trend: dict, statistik: dict) -> float:
    """
    Hitung margin dinamis berdasarkan tren dan volatilitas.
    Returns: margin persen (misal: 12.5 = 12.5%)
    """
    status    = trend.get("status", "stabil")
    pct_change = abs(trend.get("pct_change", 0))
    cv         = statistik.get("cv", 0)

    # Base margin berdasarkan tren
    if status == "turun":
        margin = 8.0
    elif status == "stabil":
        margin = 10.0
    elif status == "naik":
        if pct_change < 5:
            margin = 12.0
        elif pct_change < 10:
            margin = 15.0
        else:
            margin = 18.0
    else:
        margin = 10.0

    # Adjustment volatilitas
    if cv > 30:
        margin += 3.0   # Sangat volatil
    elif cv > 20:
        margin += 2.0   # Cukup volatil
    elif cv > 15:
        margin += 1.0   # Agak volatil

    return round(margin, 2)


def validasi_het(harga_beli: float, margin_pct: float, het: Optional[float]) -> dict:
    """
    Hitung harga jual dan validasi terhadap HET.
    Returns: { harga_jual, margin_aktual, status_het, capped }
    """
    harga_jual_raw = harga_beli * (1 + margin_pct / 100)

    if het is None or het <= 0:
        return {
            "harga_jual":     round(harga_jual_raw, 2),
            "margin_aktual":  round(margin_pct, 2),
            "status_het":     "tidak_ada_het",
            "capped":         False,
            "het":            None,
        }

    if harga_jual_raw > het:
        # Cap ke HET
        margin_aktual = ((het - harga_beli) / harga_beli * 100) if harga_beli > 0 else 0
        return {
            "harga_jual":     round(het, 2),
            "margin_aktual":  round(margin_aktual, 2),
            "status_het":     "melebihi",
            "capped":         True,
            "het":            round(het, 2),
        }

    # Tentukan status
    jarak_pct = ((het - harga_jual_raw) / het * 100) if het > 0 else 100
    if jarak_pct < 5:
        status_het = "mendekati"
    else:
        status_het = "aman"

    return {
        "harga_jual":    round(harga_jual_raw, 2),
        "margin_aktual": round(margin_pct, 2),
        "status_het":    status_het,
        "capped":        False,
        "het":           round(het, 2),
    }


# ── Skor Rekomendasi ─────────────────────────────────────────────────────────

def hitung_skor(trend: dict, statistik: dict, het_result: dict) -> int:
    """
    Skor 0-100 berdasarkan kualitas data dan kondisi harga.
    Skor tinggi = harga stabil, margin aman, jauh dari HET.
    """
    skor = 50  # Base score

    # Stabilitas harga (berdasarkan CV)
    cv = statistik.get("cv", 50)
    if cv < 5:
        skor += 20
    elif cv < 10:
        skor += 15
    elif cv < 20:
        skor += 8
    elif cv < 30:
        skor += 0
    else:
        skor -= 10

    # Tren harga
    status = trend.get("status", "stabil")
    pct_change = abs(trend.get("pct_change", 0))
    if status == "turun":
        skor += 15     # Harga turun = bagus untuk beli
    elif status == "stabil":
        skor += 10
    elif pct_change < 5:
        skor += 5
    elif pct_change < 10:
        skor -= 5
    else:
        skor -= 15

    # Status HET
    het_status = het_result.get("status_het", "tidak_ada_het")
    if het_status == "aman":
        skor += 15
    elif het_status == "mendekati":
        skor += 5
    elif het_status == "melebihi":
        skor -= 20

    # Jumlah data (data lebih banyak = lebih reliable)
    n = statistik.get("n", 0)
    if n >= 30:
        skor += 10
    elif n >= 15:
        skor += 5
    elif n < 5:
        skor -= 10

    return max(0, min(100, skor))


# ── Main Analisis ─────────────────────────────────────────────────────────────

def analisis_item_penuh(histori: list[dict], het_data: dict = None) -> dict:
    """
    Analisis lengkap satu item dari histori harga.
    histori: list dari { tanggal, harga_beli, harga_jual, ... }
    """
    # Filter data valid
    valid = [h for h in histori if h.get("harga_beli") and float(h["harga_beli"]) > 0]

    if not valid:
        return {
            "status": "tidak_ada_data",
            "pesan": "Tidak ada histori harga pembelian untuk item ini",
        }

    prices = [float(h["harga_beli"]) for h in valid]
    prices_jual = [float(h["harga_jual"]) for h in valid if h.get("harga_jual")]

    # Hapus outlier (IQR)
    if len(prices) >= 4:
        sorted_p = sorted(prices)
        n = len(sorted_p)
        q1, q3 = sorted_p[n // 4], sorted_p[(3 * n) // 4]
        iqr = q3 - q1
        prices = [p for p in prices if q1 - 1.5 * iqr <= p <= q3 + 1.5 * iqr]

    if not prices:
        return {"status": "tidak_ada_data"}

    tanggal_list = [h["tanggal"] for h in valid]

    # Statistik
    stat = hitung_statistik(prices)

    # Moving Averages
    ma7  = hitung_ma(prices, 7)
    ma30 = hitung_ma(prices, min(30, len(prices)))
    ema  = hitung_ema(prices)
    wma  = hitung_wma(prices, min(7, len(prices)))

    # Tren
    tren = deteksi_tren(prices)

    # Forecast
    fore = forecast_harga(prices, tanggal_list)

    # Harga terakhir dan forecast
    harga_terakhir = prices[-1]
    forecast_minggu = fore.get("minggu_depan") or harga_terakhir

    # Margin
    margin_pct = hitung_margin_rekomendasi(tren, stat)

    # Validasi HET
    het_harga = het_data.get("het") if het_data else None
    het_result = validasi_het(harga_terakhir, margin_pct, het_harga)

    # Skor
    skor = hitung_skor(tren, stat, het_result)

    # Sparkline (5 harga terakhir)
    sparkline = prices[-5:] if len(prices) >= 5 else prices

    return {
        "harga_terakhir":        round(harga_terakhir, 2),
        "statistik":             stat,
        "trend":                 tren,
        "moving_avg": {
            "ma7":  [v for v in ma7[-10:] if v is not None],
            "ma30": [v for v in ma30[-10:] if v is not None],
            "ema":  ema[-10:],
            "wma":  [v for v in wma[-10:] if v is not None],
        },
        "forecast":              fore,
        "het":                   het_data,
        "margin_rekomendasi":    margin_pct,
        "harga_result":          het_result,
        "skor":                  skor,
        "sparkline":             sparkline,
        "tanggal_list":          tanggal_list,
        "harga_list":            prices,
        "harga_jual_list":       prices_jual,
        "n_data":                len(prices),
    }


def analisis_mini(histori: list[dict], het_data: dict = None) -> dict:
    """
    Analisis ringkas untuk tooltip PO — lebih cepat.
    Returns dict yang kecil & cepat di-serialize.
    """
    valid = [h for h in histori if h.get("harga_beli") and float(h["harga_beli"]) > 0]
    if not valid:
        return {"status": "tidak_ada_data"}

    prices = [float(h["harga_beli"]) for h in valid]

    stat = hitung_statistik(prices)
    tren = deteksi_tren(prices)
    fore = forecast_harga(prices)

    harga_terakhir  = prices[-1]
    margin_pct      = hitung_margin_rekomendasi(tren, stat)
    het_harga       = het_data.get("het") if het_data else None
    het_result      = validasi_het(harga_terakhir, margin_pct, het_harga)
    skor            = hitung_skor(tren, stat, het_result)
    sparkline       = prices[-5:]

    return {
        "harga_terakhir":          round(harga_terakhir, 2),
        "trend":                   tren.get("status", "stabil"),
        "trend_pct":               tren.get("pct_change", 0),
        "trend_arah":              tren.get("arah", "→"),
        "forecast_minggu":         fore.get("minggu_depan"),
        "het":                     het_harga,
        "margin_rekomendasi":      margin_pct,
        "harga_jual_rekomendasi":  het_result.get("harga_jual"),
        "margin_aktual":           het_result.get("margin_aktual"),
        "status_het":              het_result.get("status_het"),
        "skor":                    skor,
        "sparkline":               sparkline,
        "n_data":                  len(prices),
    }
