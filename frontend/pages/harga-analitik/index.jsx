import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { trenHargaApi } from "@/lib/api";

const formatRupiah = (v) => v != null ? `Rp ${parseFloat(v).toLocaleString("id-ID")}` : "—";

const TREND_CFG = {
  naik:   { color: "#dc2626", bg: "rgba(239,68,68,0.10)", border: "rgba(239,68,68,0.2)", arah: "↑", label: "Naik" },
  turun:  { color: "#059669", bg: "rgba(16,185,129,0.10)", border: "rgba(16,185,129,0.2)", arah: "↓", label: "Turun" },
  stabil: { color: "#6366f1", bg: "rgba(99,102,241,0.10)", border: "rgba(99,102,241,0.2)", arah: "→", label: "Stabil" },
};

const HET_CFG = {
  aman:           { color: "#059669", bg: "rgba(16,185,129,0.10)", label: "✅ Aman" },
  mendekati:      { color: "#b45309", bg: "rgba(245,158,11,0.10)", label: "⚠️ Mendekati" },
  melebihi:       { color: "#dc2626", bg: "rgba(239,68,68,0.10)", label: "🚫 Melebihi HET" },
  tidak_ada_het:  { color: "#6b7280", bg: "#f9fafb",               label: "— Tidak ada HET" },
};

function TrendBadge({ tren, pct }) {
  if (!tren) return null;
  const cfg = TREND_CFG[tren] || TREND_CFG.stabil;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 800,
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
    }}>
      {cfg.arah} {cfg.label}{pct ? ` ${Math.abs(pct).toFixed(1)}%` : ""}
    </span>
  );
}

function SkorBar({ skor }) {
  const color = skor >= 70 ? "#10b981" : skor >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ flex: 1, height: 8, background: "#f1f5f9", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${skor}%`, background: color, borderRadius: 99, transition: "width 0.5s" }} />
      </div>
      <span style={{ fontWeight: 800, color, fontSize: 14, minWidth: 36 }}>{skor}</span>
    </div>
  );
}

function MiniBar({ values, color }) {
  if (!values || values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  return (
    <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 28 }}>
      {values.map((v, i) => {
        const h = Math.max(3, ((v - min) / range) * 24);
        return <div key={i} style={{ width: 6, height: h, background: color, borderRadius: 2, alignSelf: "flex-end" }} />;
      })}
    </div>
  );
}

function DetailPanel({ item, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!item) return;
    setLoading(true);
    trenHargaApi.detail(item.nama_item)
      .then(r => setDetail(r.data))
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [item?.nama_item]);

  const trendColor = TREND_CFG[detail?.trend?.status]?.color || "#6366f1";

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 1000,
      display: "flex", alignItems: "flex-start", justifyContent: "flex-end", padding: 16,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "white", borderRadius: 16, width: 440, maxHeight: "calc(100vh - 32px)",
        overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,0.2)",
        animation: "slideFromRight 0.22s ease",
      }}>
        <style>{`@keyframes slideFromRight { from { transform: translateX(40px); opacity: 0; } to { transform: none; opacity: 1; } }`}</style>

        {/* Header */}
        <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--color-border)", background: "#f8fafc", borderRadius: "16px 16px 0 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, textTransform: "capitalize" }}>{item?.nama_item}</div>
              <div style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 2 }}>Analisis Tren Harga Pembelian Lengkap</div>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--color-muted)" }}>✕</button>
          </div>
        </div>

        <div style={{ padding: "20px 22px" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: 60 }}>
              <div className="spinner" style={{ width: 28, height: 28, margin: "0 auto 12px" }} />
              <div style={{ color: "var(--color-muted)", fontSize: 13 }}>Menganalisis {item?.n_data || 0} data transaksi...</div>
            </div>
          ) : !detail || detail.status === "tidak_ada_data" ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--color-muted)" }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>📊</div>
              <div>Tidak ada histori harga untuk item ini</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {/* KPI 4 kotak */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  { label: "Harga Terakhir", value: formatRupiah(detail.harga_terakhir), color: "var(--color-primary)" },
                  { label: "Rata-rata", value: formatRupiah(detail.statistik?.mean), color: "#374151" },
                  { label: "Forecast Minggu Ini", value: formatRupiah(detail.forecast?.minggu_depan), color: "#059669", sub: detail.forecast?.metode },
                  { label: "Forecast Bulan Depan", value: formatRupiah(detail.forecast?.bulan_depan), color: "#b45309" },
                ].map(k => (
                  <div key={k.label} style={{ background: "#f8fafc", borderRadius: 10, padding: "12px 14px", border: "1px solid var(--color-border)" }}>
                    <div style={{ fontSize: 10, color: "var(--color-muted)", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>{k.label}</div>
                    <div style={{ fontWeight: 800, color: k.color, fontSize: 15 }}>{k.value}</div>
                    {k.sub && <div style={{ fontSize: 10, color: "var(--color-muted)", marginTop: 2 }}>{k.sub.replace(/_/g, " ")}</div>}
                  </div>
                ))}
              </div>

              {/* Trend + Skor */}
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <TrendBadge tren={detail.trend?.status} pct={detail.trend?.pct_change} />
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: 11, color: "var(--color-muted)", marginBottom: 4 }}>Skor Rekomendasi</div>
                  <SkorBar skor={detail.skor || 0} />
                </div>
              </div>

              {/* Grafik Histori */}
              {detail.harga_list?.length >= 3 && (
                <div style={{ background: "#f8fafc", borderRadius: 12, padding: "14px 16px", border: "1px solid var(--color-border)" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase", marginBottom: 10 }}>
                    Histori Harga Beli — {detail.n_data} transaksi
                  </div>
                  {/* Bar chart mini */}
                  <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 64 }}>
                    {(() => {
                      const prices = detail.harga_list.slice(-25);
                      const min = Math.min(...prices), max = Math.max(...prices);
                      const range = max - min || 1;
                      return prices.map((p, i) => {
                        const h = Math.max(4, ((p - min) / range) * 56);
                        const isCur = i === prices.length - 1;
                        return (
                          <div key={i} title={`Rp ${parseFloat(p).toLocaleString("id-ID")}`} style={{
                            flex: 1, height: h, borderRadius: "3px 3px 0 0", alignSelf: "flex-end",
                            background: isCur ? trendColor : `${trendColor}50`,
                          }} />
                        );
                      });
                    })()}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: "var(--color-muted)" }}>
                    <span>Min: {formatRupiah(detail.statistik?.min)}</span>
                    <span>Max: {formatRupiah(detail.statistik?.max)}</span>
                  </div>
                </div>
              )}

              {/* Moving Averages */}
              {detail.moving_avg?.ema?.length > 0 && (
                <div style={{ background: "#f8fafc", borderRadius: 12, padding: "12px 14px", border: "1px solid var(--color-border)" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase", marginBottom: 8 }}>Moving Average (10 terakhir)</div>
                  <div style={{ display: "flex", gap: 16 }}>
                    {[
                      { label: "MA-7", data: detail.moving_avg.ma7, color: "#6366f1" },
                      { label: "EMA", data: detail.moving_avg.ema, color: "#f59e0b" },
                    ].map(ma => (
                      <div key={ma.label} style={{ flex: 1 }}>
                        <div style={{ fontSize: 10, color: "var(--color-muted)", marginBottom: 4 }}>{ma.label}</div>
                        <MiniBar values={ma.data.slice(-10)} color={ma.color} />
                        <div style={{ fontSize: 11, fontWeight: 700, color: ma.color, marginTop: 4 }}>
                          {formatRupiah(ma.data[ma.data.length - 1])}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* HET Kepokmas */}
              {detail.het_info && (
                <div style={{
                  borderRadius: 12, padding: "14px 16px", border: "1px solid var(--color-border)",
                  background: HET_CFG[detail.harga_result?.status_het]?.bg || "#f9fafb",
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase", marginBottom: 10 }}>
                    HET Kepokmas Kab. Cirebon
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 12, color: "var(--color-muted)" }}>{detail.het_info.nama_kepokmas || "Tidak match"}</div>
                      {detail.het_info.match_score && (
                        <div style={{ fontSize: 11, color: "var(--color-muted)" }}>Match score: {detail.het_info.match_score}%</div>
                      )}
                    </div>
                    <div style={{ fontWeight: 800, fontSize: 16 }}>{formatRupiah(detail.het_info.het)}</div>
                  </div>
                  <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 11, color: "var(--color-muted)" }}>Rekomendasi Harga Jual</div>
                      <div style={{ fontWeight: 900, fontSize: 18, color: HET_CFG[detail.harga_result?.status_het]?.color || "#374151" }}>
                        {formatRupiah(detail.harga_result?.harga_jual)}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: HET_CFG[detail.harga_result?.status_het]?.color, marginTop: 2 }}>
                        {HET_CFG[detail.harga_result?.status_het]?.label}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 11, color: "var(--color-muted)" }}>Margin Rekomendasi</div>
                      <div style={{ fontWeight: 800, fontSize: 22, color: "var(--color-primary)" }}>
                        {detail.harga_result?.margin_aktual}%
                      </div>
                    </div>
                  </div>
                  {detail.harga_result?.capped && (
                    <div style={{ marginTop: 8, fontSize: 11, background: "rgba(239,68,68,0.08)", padding: "6px 10px", borderRadius: 8, color: "#dc2626" }}>
                      ⚠️ Harga jual dipotong ke batas HET. Margin aktual lebih rendah dari target.
                    </div>
                  )}
                </div>
              )}

              {/* Statistik */}
              <div style={{ background: "#f8fafc", borderRadius: 12, padding: "14px 16px", border: "1px solid var(--color-border)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase", marginBottom: 10 }}>Statistik Lengkap</div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <tbody>
                    {[
                      ["Rata-rata", formatRupiah(detail.statistik?.mean)],
                      ["Median", formatRupiah(detail.statistik?.median)],
                      ["Modus", formatRupiah(detail.statistik?.modus)],
                      ["Minimum", formatRupiah(detail.statistik?.min)],
                      ["Maksimum", formatRupiah(detail.statistik?.max)],
                      ["Std Deviasi", formatRupiah(detail.statistik?.std)],
                      ["Volatilitas (CV)", `${detail.statistik?.cv}%`],
                      ["Jumlah Data", `${detail.statistik?.n} transaksi`],
                    ].map(([l, v]) => (
                      <tr key={l} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "6px 4px", color: "var(--color-muted)" }}>{l}</td>
                        <td style={{ padding: "6px 4px", fontWeight: 600, textAlign: "right" }}>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Confidence Interval */}
              {detail.forecast?.ci_lower && (
                <div style={{ fontSize: 11, color: "var(--color-muted)", textAlign: "center", padding: "6px 0" }}>
                  Confidence Interval 95%: {formatRupiah(detail.forecast.ci_lower)} – {formatRupiah(detail.forecast.ci_upper)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function HargaAnalitikPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState(null);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [filterTren, setFilterTren] = useState("");
  const [filterHet, setFilterHet] = useState("");
  const [sortBy, setSortBy] = useState("skor");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await trenHargaApi.dashboard();
      setItems(res.data.items || []);
      setSummary(res.data.summary);
    } catch { setError("Gagal memuat dashboard tren harga"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleImport = async () => {
    setImporting(true); setError(""); setSuccess("");
    try {
      const res = await trenHargaApi.importExcel();
      setSuccess(`✅ Import selesai: ${res.data.statistik?.imported} baris, ${res.data.statistik?.items_unique} item unik`);
      load();
    } catch (e) { setError(e.response?.data?.detail || "Gagal import Excel"); }
    finally { setImporting(false); }
  };

  const filtered = items
    .filter(i => {
      const matchSearch = !search || i.nama_item.includes(search.toLowerCase());
      const matchTren = !filterTren || i.trend === filterTren;
      const matchHet = !filterHet || i.status_het === filterHet;
      return matchSearch && matchTren && matchHet;
    })
    .sort((a, b) => {
      if (sortBy === "skor") return (b.skor || 0) - (a.skor || 0);
      if (sortBy === "harga") return (b.harga_terakhir || 0) - (a.harga_terakhir || 0);
      if (sortBy === "nama") return a.nama_item.localeCompare(b.nama_item);
      if (sortBy === "forecast") return (b.forecast_minggu || 0) - (a.forecast_minggu || 0);
      return 0;
    });

  return (
    <Layout title="Analitik Tren Harga">
      <style>{`
        @keyframes slideFromRight { from { transform: translateX(40px); opacity: 0; } to { transform: none; opacity: 1; } }
        .item-row:hover td { background: #fffdf5; }
        .item-row td { transition: background 0.1s; cursor: pointer; }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>📊 Analitik Tren Harga Pembelian</h1>
          <p style={{ color: "var(--color-muted)", margin: "4px 0 0", fontSize: 13 }}>
            Analisis statistik, tren, forecast harga + referensi HET Kepokmas Kab. Cirebon
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={load} disabled={loading}>🔄 Refresh</button>
          <button className="btn btn-primary" onClick={handleImport} disabled={importing}>
            {importing ? "⏳ Mengimport..." : "📥 Import Excel"}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>⚠️ {error} <button onClick={() => setError("")} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer" }}>✕</button></div>}
      {success && <div className="alert alert-success" style={{ marginBottom: 16 }}>{success} <button onClick={() => setSuccess("")} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer" }}>✕</button></div>}

      {/* Summary Cards */}
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
          {[
            { label: "Total Item", value: items.length, color: "#6366f1", accent: "#6366f1", icon: "📦" },
            { label: "Tren Naik", value: summary.naik, color: "#dc2626", accent: "#ef4444", icon: "↑" },
            { label: "Tren Turun", value: summary.turun, color: "#059669", accent: "#10b981", icon: "↓" },
            { label: "Melebihi HET", value: summary.melebihi_het, color: "#b45309", accent: "#f59e0b", icon: "🚫" },
          ].map(c => (
            <div key={c.label} style={{ background: "white", borderRadius: 14, padding: "16px 18px", border: "1px solid var(--color-border)", borderTop: `3px solid ${c.accent}`, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 20 }}>{c.icon}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase" }}>{c.label}</span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, color: c.color }}>{c.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filter Bar */}
      <div style={{ background: "white", borderRadius: 12, padding: "12px 16px", marginBottom: 18, border: "1px solid var(--color-border)", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13 }}>🔍</span>
          <input style={{ width: "100%", padding: "7px 10px 7px 32px", border: "1.5px solid var(--color-border)", borderRadius: 8, fontSize: 13, fontFamily: "inherit" }}
            value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nama item..." />
        </div>
        {[
          { label: "Tren", val: filterTren, set: setFilterTren, opts: [["", "Semua Tren"], ["naik", "↑ Naik"], ["turun", "↓ Turun"], ["stabil", "→ Stabil"]] },
          { label: "Status HET", val: filterHet, set: setFilterHet, opts: [["", "Semua Status"], ["aman", "✅ Aman"], ["mendekati", "⚠️ Mendekati"], ["melebihi", "🚫 Melebihi"]] },
          { label: "Urutkan", val: sortBy, set: setSortBy, opts: [["skor", "Skor ↓"], ["harga", "Harga ↓"], ["nama", "Nama A-Z"], ["forecast", "Forecast ↓"]] },
        ].map(f => (
          <div key={f.label} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase" }}>{f.label}</label>
            <select value={f.val} onChange={e => f.set(e.target.value)}
              style={{ padding: "7px 10px", border: "1.5px solid var(--color-border)", borderRadius: 8, fontSize: 13, fontFamily: "inherit", background: "white", minWidth: 130 }}>
              {f.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        ))}
        <div style={{ fontSize: 12, color: "var(--color-muted)", alignSelf: "center" }}>
          {filtered.length} item
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 80 }}>
          <div className="spinner" style={{ width: 28, height: 28, margin: "0 auto 12px" }} />
          <div style={{ fontSize: 13, color: "var(--color-muted)" }}>Menganalisis {items.length || "..."} item...</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ background: "white", borderRadius: 14, padding: "56px 20px", textAlign: "center", border: "1px solid var(--color-border)", color: "var(--color-muted)" }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>📊</div>
          <div style={{ fontWeight: 600 }}>Tidak ada data</div>
          <div style={{ fontSize: 13, marginTop: 6, marginBottom: 16 }}>Klik "Import Excel" untuk mengisi data histori harga dari Rekap Mei-Juni 2026</div>
          <button className="btn btn-primary" onClick={handleImport} disabled={importing}>📥 Import Sekarang</button>
        </div>
      ) : (
        <div style={{ background: "white", borderRadius: 14, border: "1px solid var(--color-border)", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Nama Item", "Harga Terakhir", "Tren", "Sparkline", "Forecast Minggu", "HET", "Margin Rek.", "Harga Jual", "Skor"].map(h => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "2px solid var(--color-border)", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const tCfg = TREND_CFG[item.trend] || TREND_CFG.stabil;
                const hCfg = HET_CFG[item.status_het] || HET_CFG.tidak_ada_het;
                return (
                  <tr key={item.nama_item} className="item-row" style={{ borderBottom: "1px solid var(--color-border)" }}
                    onClick={() => setSelected(item)}>
                    <td style={{ padding: "11px 14px", fontWeight: 700, textTransform: "capitalize", fontSize: 13 }}>{item.nama_item}</td>
                    <td style={{ padding: "11px 14px", fontWeight: 700, color: "var(--color-primary)" }}>{formatRupiah(item.harga_terakhir)}</td>
                    <td style={{ padding: "11px 14px" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 800, background: tCfg.bg, color: tCfg.color }}>
                        {tCfg.arah} {tCfg.label} {item.trend_pct ? `${Math.abs(item.trend_pct).toFixed(1)}%` : ""}
                      </span>
                    </td>
                    <td style={{ padding: "11px 14px" }}>
                      {item.sparkline?.length >= 2 && (
                        <svg width={54} height={20}>
                          {(() => {
                            const d = item.sparkline;
                            const min = Math.min(...d), max = Math.max(...d);
                            const range = max - min || 1;
                            const pts = d.map((v, i) => `${(i / (d.length - 1)) * 54},${20 - ((v - min) / range) * 18 - 1}`).join(" ");
                            return <polyline points={pts} fill="none" stroke={tCfg.color} strokeWidth={1.5} strokeLinejoin="round" />;
                          })()}
                        </svg>
                      )}
                    </td>
                    <td style={{ padding: "11px 14px", fontWeight: 600, color: "#059669" }}>{formatRupiah(item.forecast_minggu)}</td>
                    <td style={{ padding: "11px 14px", fontSize: 12, color: "var(--color-muted)" }}>
                      {item.het ? formatRupiah(item.het) : "—"}
                    </td>
                    <td style={{ padding: "11px 14px", fontWeight: 700, color: "var(--color-primary)" }}>
                      {item.margin_rekomendasi ? `${item.margin_rekomendasi}%` : "—"}
                    </td>
                    <td style={{ padding: "11px 14px" }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{formatRupiah(item.harga_jual_rekomendasi)}</div>
                      <span style={{ fontSize: 10, fontWeight: 600, color: hCfg.color }}>{hCfg.label}</span>
                    </td>
                    <td style={{ padding: "11px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 32, height: 6, background: "#f1f5f9", borderRadius: 99, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${item.skor || 0}%`, background: item.skor >= 70 ? "#10b981" : item.skor >= 50 ? "#f59e0b" : "#ef4444", borderRadius: 99 }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 800, color: item.skor >= 70 ? "#059669" : item.skor >= 50 ? "#b45309" : "#dc2626" }}>{item.skor}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Panel */}
      {selected && <DetailPanel item={selected} onClose={() => setSelected(null)} />}
    </Layout>
  );
}
