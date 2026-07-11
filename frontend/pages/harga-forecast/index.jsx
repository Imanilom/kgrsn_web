import { useEffect, useState } from "react";
import { trenHargaApi } from "@/lib/api";

const formatRupiah = (v) => `Rp ${parseFloat(v || 0).toLocaleString("id-ID")}`;

const TREND_CONFIG = {
  naik:   { color: "#ef4444", bg: "#fef2f2", icon: "↑", label: "Naik" },
  turun:  { color: "#10b981", bg: "#f0fdf4", icon: "↓", label: "Turun" },
  stabil: { color: "#6366f1", bg: "#f0f0ff", icon: "→", label: "Stabil" },
};

function ForecastTable({ items, title, color, icon }) {
  if (!items || items.length === 0) return (
    <div style={{ textAlign: "center", padding: 40, color: "var(--color-muted)", fontSize: 14 }}>
      Belum ada data forecast untuk kategori ini
    </div>
  );

  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Nama Item</th>
            <th style={{ textAlign: "right" }}>H. Terakhir</th>
            <th style={{ textAlign: "right" }}>Forecast 7 Hari</th>
            <th style={{ textAlign: "right" }}>Forecast 30 Hari</th>
            <th style={{ textAlign: "center" }}>Tren</th>
            <th style={{ textAlign: "center" }}>Margin Rek.</th>
            <th style={{ textAlign: "right" }}>H. Jual Rek.</th>
            <th style={{ textAlign: "center" }}>Status HET</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => {
            const tren = TREND_CONFIG[item.trend] || TREND_CONFIG.stabil;
            const hetStatus = item.status_het;
            const hetColor = hetStatus === "melebihi" ? "#ef4444" : hetStatus === "mendekati" ? "#f59e0b" : "#10b981";
            const hetLabel = hetStatus === "melebihi" ? "⚠️ Melebihi" : hetStatus === "mendekati" ? "⚡ Mendekati" : hetStatus === "aman" ? "✅ Aman" : "-";

            const forecast7 = item.forecast_minggu;
            const changeAmt = forecast7 && item.harga_terakhir ? forecast7 - item.harga_terakhir : null;
            const changePct = changeAmt && item.harga_terakhir ? (changeAmt / item.harga_terakhir * 100).toFixed(1) : null;

            return (
              <tr key={i}>
                <td>
                  <div style={{ fontWeight: 600 }}>{item.nama_item}</div>
                  {item.satuan && <div style={{ fontSize: 11, color: "var(--color-muted)" }}>{item.satuan}</div>}
                </td>
                <td style={{ textAlign: "right", fontWeight: 600 }}>
                  {item.harga_terakhir ? formatRupiah(item.harga_terakhir) : "-"}
                </td>
                <td style={{ textAlign: "right" }}>
                  {forecast7 ? (
                    <div>
                      <div style={{ fontWeight: 700 }}>{formatRupiah(forecast7)}</div>
                      {changePct && (
                        <div style={{ fontSize: 11, color: parseFloat(changePct) > 0 ? "#ef4444" : "#10b981" }}>
                          {parseFloat(changePct) > 0 ? "+" : ""}{changePct}%
                        </div>
                      )}
                    </div>
                  ) : "-"}
                </td>
                <td style={{ textAlign: "right", color: "var(--color-muted)" }}>
                  {/* Perkiraan 30 hari dari sparkline / trend */}
                  <span style={{ fontSize: 12 }}>—</span>
                </td>
                <td style={{ textAlign: "center" }}>
                  <span style={{
                    padding: "3px 10px", borderRadius: 99, fontSize: 12, fontWeight: 700,
                    background: tren.bg, color: tren.color,
                  }}>
                    {tren.icon} {tren.label}
                  </span>
                </td>
                <td style={{ textAlign: "center" }}>
                  <span style={{
                    padding: "3px 10px", borderRadius: 99, fontSize: 12, fontWeight: 700,
                    background: "#e0e7ff", color: "#4f46e5",
                  }}>
                    {item.margin_rekomendasi ? `${item.margin_rekomendasi}%` : "-"}
                  </span>
                </td>
                <td style={{ textAlign: "right" }}>
                  <span style={{ fontWeight: 700, color: "#10b981" }}>
                    {item.harga_jual_rekomendasi ? formatRupiah(item.harga_jual_rekomendasi) : "-"}
                  </span>
                </td>
                <td style={{ textAlign: "center" }}>
                  {hetStatus ? (
                    <span style={{
                      padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 700,
                      background: hetColor + "20", color: hetColor,
                    }}>
                      {hetLabel}
                    </span>
                  ) : "-"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function HargaForecastPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("groceries");
  const [search, setSearch] = useState("");

  useEffect(() => {
    trenHargaApi.forecast()
      .then(res => setData(res.data))
      .catch(err => setError(err.response?.data?.detail || "Gagal memuat data forecast"))
      .finally(() => setLoading(false));
  }, []);

  const filterItems = (items) => {
    if (!search || !items) return items || [];
    return items.filter(i => i.nama_item?.toLowerCase().includes(search.toLowerCase()));
  };

  const tabs = [
    { key: "groceries", label: "🛒 Groceries", color: "#6366f1", count: data?.summary?.total_groceries },
    { key: "perishable", label: "🥬 Perishable", color: "#10b981", count: data?.summary?.total_perishable },
    { key: "lainnya", label: "📦 Lainnya", color: "#f59e0b", count: data?.summary?.total_lainnya },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">🔮 Harga Forecast</h1>
          <p className="page-subtitle">
            Prediksi harga per kategori berdasarkan histori &amp; tren — Groceries vs Perishable
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      {data && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 24 }}>
          {[
            { label: "Total Groceries", value: data.summary.total_groceries, color: "#6366f1", icon: "🛒" },
            { label: "Total Perishable", value: data.summary.total_perishable, color: "#10b981", icon: "🥬" },
            { label: "Lainnya", value: data.summary.total_lainnya, color: "#f59e0b", icon: "📦" },
          ].map((s, i) => (
            <div key={i} className="card" style={{ padding: 20, borderLeft: `4px solid ${s.color}` }}>
              <div style={{ fontSize: 24 }}>{s.icon}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: s.color, marginTop: 8 }}>{s.value}</div>
              <div style={{ fontSize: 13, color: "var(--color-muted)", marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <div className="search-box">
          <span className="search-box-icon">🔍</span>
          <input
            placeholder="Cari nama item..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: "8px 20px", borderRadius: 8, fontWeight: 700, fontSize: 14,
              cursor: "pointer", transition: "all 0.15s",
              background: activeTab === tab.key ? tab.color : "#f1f5f9",
              color: activeTab === tab.key ? "white" : "var(--color-text)",
              border: "none",
            }}
          >
            {tab.label} {tab.count != null ? `(${tab.count})` : ""}
          </button>
        ))}
      </div>

      <div className="card">
        {loading ? (
          <div className="loading-overlay"><div className="spinner" style={{ width: 32, height: 32 }}></div></div>
        ) : error ? (
          <div className="alert alert-error">{error}</div>
        ) : (
          <ForecastTable
            items={filterItems(data?.[activeTab])}
            title={tabs.find(t => t.key === activeTab)?.label}
            color={tabs.find(t => t.key === activeTab)?.color}
          />
        )}
      </div>

      {/* Keterangan */}
      <div className="card" style={{ marginTop: 20, background: "#f8fafc", padding: "16px 20px" }}>
        <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 13 }}>📋 Keterangan</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, fontSize: 12, color: "var(--color-muted)" }}>
          <div><strong>Forecast 7 Hari:</strong> Prediksi harga minggu depan menggunakan Holt Linear Smoothing atau Linear Regression</div>
          <div><strong>Margin Rekomendasi:</strong> Margin dinamis berdasarkan tren &amp; volatilitas harga</div>
          <div><strong>H. Jual Rekomendasi:</strong> Harga jual yang disarankan (harga beli × (1 + margin%))</div>
          <div><strong>Status HET:</strong> Perbandingan harga jual terhadap Harga Eceran Tertinggi (HET) dari Kepokmas</div>
        </div>
      </div>
    </div>
  );
}

HargaForecastPage.title = "Harga Forecast";
HargaForecastPage.subtitle = "Prediksi harga Groceries & Perishable";
