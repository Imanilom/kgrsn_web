"""Local PO demand forecasting and budget-constrained quantity recommendations."""
from datetime import date, datetime
from decimal import Decimal, ROUND_DOWN
from math import cos, exp, pi, sin


MIN_MODEL_OBSERVATIONS = 12
WEIGHT_TO_KG = {
    "kg": Decimal("1"),
    "kilogram": Decimal("1"),
    "kilograms": Decimal("1"),
    "g": Decimal("0.001"),
    "gr": Decimal("0.001"),
    "gram": Decimal("0.001"),
    "grams": Decimal("0.001"),
    "ons": Decimal("0.1"),
    "hg": Decimal("0.1"),
}
VOLUME_TO_LITER = {
    "l": Decimal("1"),
    "liter": Decimal("1"),
    "litre": Decimal("1"),
    "ml": Decimal("0.001"),
    "mililiter": Decimal("0.001"),
}
UNIT_ALIASES = {"pc": "pcs", "buah": "pcs", "bh": "pcs", "unit": "pcs"}
WHOLE_UNITS = {"pcs", "pc", "buah", "bh", "ekor", "pack", "pak", "box", "dus"}


def _as_date(value):
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value))


def _features(pm_kecil, pm_besar, tanggal):
    weekday = _as_date(tanggal).weekday()
    angle = 2 * pi * weekday / 7
    return [float(pm_kecil), float(pm_besar), sin(angle), cos(angle)]


def predict_item_quantity(history, pm_kecil, pm_besar, tanggal, current_qty=0):
    """Forecast one selected item, using ML only when its history is sufficient."""
    observations = [
        row for row in history
        if float(row.get("qty") or 0) >= 0
        and (float(row.get("pm_kecil") or 0) + float(row.get("pm_besar") or 0)) > 0
    ]
    count = len(observations)
    if not observations:
        return {"qty": max(float(current_qty or 0), 0), "source": "qty_saat_ini", "observations": 0}

    if count >= MIN_MODEL_OBSERVATIONS:
        try:
            from sklearn.ensemble import RandomForestRegressor

            today = _as_date(tanggal)
            features = [
                _features(row["pm_kecil"], row["pm_besar"], row["tanggal"])
                for row in observations
            ]
            targets = [float(row["qty"]) for row in observations]
            sample_weights = [
                0.25 + exp(-max((today - _as_date(row["tanggal"])).days, 0) / 180)
                for row in observations
            ]
            model = RandomForestRegressor(
                n_estimators=120,
                min_samples_leaf=2,
                max_features=1.0,
                random_state=42,
                n_jobs=1,
            )
            model.fit(features, targets, sample_weight=sample_weights)
            prediction = float(model.predict([_features(pm_kecil, pm_besar, tanggal)])[0])
            return {"qty": max(prediction, 0), "source": "random_forest", "observations": count}
        except Exception:
            pass

    rates = []
    for row in observations:
        total_pm = float(row.get("pm_kecil") or 0) + float(row.get("pm_besar") or 0)
        age_days = max((_as_date(tanggal) - _as_date(row["tanggal"])).days, 0)
        weight = total_pm * (0.25 + exp(-age_days / 180))
        rates.append((float(row["qty"]) / total_pm, weight))

    rates.sort(key=lambda entry: entry[0])
    half_weight = sum(weight for _, weight in rates) / 2
    cumulative_weight = 0
    rate = rates[-1][0]
    for candidate, weight in rates:
        cumulative_weight += weight
        if cumulative_weight >= half_weight:
            rate = candidate
            break

    target_pm = float(pm_kecil) + float(pm_besar)
    return {"qty": max(rate * target_pm, 0), "source": "riwayat_berbobot", "observations": count}


def convert_quantity(qty, source_unit, target_unit):
    """Convert known weight/volume units, or identical count units; otherwise None."""
    source = (source_unit or "").strip().lower()
    target = (target_unit or "").strip().lower()
    source = UNIT_ALIASES.get(source, source)
    target = UNIT_ALIASES.get(target, target)
    amount = Decimal(str(qty or 0))
    if source == target:
        return amount
    if source in WEIGHT_TO_KG and target in WEIGHT_TO_KG:
        return amount * WEIGHT_TO_KG[source] / WEIGHT_TO_KG[target]
    if source in VOLUME_TO_LITER and target in VOLUME_TO_LITER:
        return amount * VOLUME_TO_LITER[source] / VOLUME_TO_LITER[target]
    return None


def cap_recommendations(lines, available_budget):
    """Scale all selected items evenly when their forecast exceeds the budget."""
    budget = max(Decimal(str(available_budget or 0)), Decimal(0))
    prepared = []
    raw_total = Decimal(0)
    for line in lines:
        qty = max(Decimal(str(line.get("qty") or 0)), Decimal(0))
        price = max(Decimal(str(line.get("unit_price") or 0)), Decimal(0))
        prepared.append({**line, "qty": qty, "unit_price": price})
        raw_total += qty * price

    limited = raw_total > budget
    scale = budget / raw_total if limited and raw_total > 0 else Decimal(1)
    result = []
    recommended_total = Decimal(0)
    for line in prepared:
        qty = line["qty"] * scale
        unit = (line.get("satuan") or "").strip().lower()
        if unit in WHOLE_UNITS:
            qty = qty.to_integral_value(rounding=ROUND_DOWN)
        else:
            qty = qty.quantize(Decimal("0.001"), rounding=ROUND_DOWN)
        value = qty * line["unit_price"]
        recommended_total += value
        result.append({**line, "qty": qty, "subtotal": value})

    return {
        "recommendations": result,
        "raw_total": raw_total,
        "recommended_total": recommended_total,
        "budget_limited": limited,
        "remaining_budget": budget,
    }