import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { laporanApi } from "@/lib/api";

const formatRupiah = (v) => `Rp ${parseFloat(v || 0).toLocaleString("id-ID")}`;
const BULAN_FULL = ["", "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

function MarginBadge({ pct }) {
  const isHigh = pct >= 20;
  const isMed = pct >= 10;
  return (
    <span style={{
      display: "inline-block", padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 800,
      background: isHigh ? "rgba(16,185,129,0.12)" : isMed ? "rgba(245,158,11,0.12)" : "rgba(239,68,68,0.12)",
      color: isHigh ? "#059669" : isMed ? "#b45309" : "#dc2626",
      border: `1px solid ${isHigh ? "rgba(16,185,129,0.25)" : isMed ? "rgba(245,158,11,0.25)" : "rgba(239,68,68,0.25)"}`,
    }}>
      {pct}%
    </span>
  );
}

function MiniBar({ val, max, pct }) {
  const color = pct >= 20 ? "#10b981" : pct >= 10 ? "#f59e0b" : "#ef4444";
  const width = max > 0 ? Math.max(2, (val / max) * 100) : 0;
  return (
    <div style={{ background: "#f1f5f9", borderRadius: 99, overflow: "hidden", height: 6, minWidth: 80 }}>
      <div style={{ height: "100%", width: `${width}%`, background: color, borderRadius: 99, transition: "width 0.5s ease" }} />
    </div>
  );
}

export default function MarginPage() {
  const now = new Date();
  const [bulan, setBulan] = useState(now.getMonth() + 1);
  const [tahun, setTahun] = useState(now.getFullYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("total_margin");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const res = await laporanApi.margin(bulan, tahun);
      setData(res.data);
    } catch { setError("Gagal memuat laporan margin"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [bulan, tahun]);

  const sortedItems = data?.per_item
    ? [...data.per_item]
        .filter(i => i.nama_item?.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => b[sortBy] - a[sortBy])
    : [];

  const maxMargin = sortedItems.length > 0 ? Math.max(...sortedItems.map(i => i.total_margin), 1) : 1;

  return (
    <Layout title="Analisis Margin Item">
      <style>{`
        .mg-row:hover td { background: #fafbff !important; }
        .mg-row td { transition: background 0.1s; }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>📉 Analisis Margin Item</h1>
          <p style={{ color: "var(--color-muted)", margin: "4px 0 0", fontSize: 13 }}>
            Perbandingan harga beli vs harga jual per item bahan baku
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select style={{
            padding: "8px 12px", border: "1.5px solid var(--color-border)", borderRadius: 8,
            fontFamily: "inherit", fontSize: 13.5, background: "white", cursor: "pointer",
          }} value={bulan} onChange={e => setBulan(parseInt(e.target.value))}>
            {BULAN_FULL.slice(1).map((b, i) => <option key={i + 1} value={i + 1}>{b}</option>)}
          </select>
          <input style={{
            padding: "8px 12px", border: "1.5px solid var(--color-border)", borderRadius: 8,
            fontFamily: "inherit", fontSize: 13.5, background: "white", width: 90,
          }} type="number" value={tahun} onChange={e => setTahun(parseInt(e.target.value))} />
          <button className="btn btn-primary" onClick={load}>🔄 Tampilkan</button>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>⚠️ {error}</div>}
      {loading && (
        <div style={{ textAlign: "center", padding: 80 }}>
          <div className="spinner" style={{ width: 28, height: 28, margin: "0 auto 12px" }} />
          <div style={{ fontSize: 13, color: "var(--color-muted)" }}>Memuat data margin...</div>
        </div>
      )}

      {data && !loading && (
        <>
          {/* Summary Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
            {[
              { label: "Total Pendapatan (Jual)", value: formatRupiah(data.total_pendapatan), color: "#059669", accent: "#10b981", icon: "💰" },
              { label: "Total Harga Beli", value: formatRupiah(data.total_harga_beli), color: "#dc2626", accent: "#ef4444", icon: "🛒" },
              { label: "Total Margin", value: formatRupiah(data.total_margin), color: "#6366f1", accent: "#6366f1", icon: "📈" },
              {
                label: "Margin Rata-Rata",
                value: `${data.margin_persen}%`,
                color: data.margin_persen >= 20 ? "#059669" : data.margin_persen >= 10 ? "#b45309" : "#dc2626",
                accent: data.margin_persen >= 20 ? "#10b981" : data.margin_persen >= 10 ? "#f59e0b" : "#ef4444",
                icon: "📊",
              },
            ].map(c => (
              <div key={c.label} style={{
                background: "white", borderRadius: 14, padding: "18px 20px",
                border: "1px solid var(--color-border)", borderTop: `3px solid ${c.accent}`,
                boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <span style={{ fontSize: 18 }}>{c.icon}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{c.label}</span>
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: c.color }}>{c.value}</div>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div style={{ display: "flex", gap: 14, marginBottom: 16, fontSize: 12, color: "var(--color-muted)" }}>
            <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: "#10b981", marginRight: 5 }} />Margin ≥ 20% (Baik)</span>
            <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: "#f59e0b", marginRight: 5 }} />10–19% (Sedang)</span>
            <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: "#ef4444", marginRight: 5 }} />&lt;10% (Rendah)</span>
          </div>

          {/* Filter & Sort */}
          <div style={{
            background: "white", borderRadius: 12, padding: "12px 16px", marginBottom: 16,
            border: "1px solid var(--color-border)", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap",
          }}>
            <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
              <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 14 }}>🔍</span>
              <input style={{
                width: "100%", padding: "7px 10px 7px 32px", border: "1.5px solid var(--color-border)",
                borderRadius: 8, fontSize: 13.5, fontFamily: "inherit", outline: "none",
              }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nama item..." />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase" }}>Urutkan</label>
              <select style={{
                padding: "7px 10px", border: "1.5px solid var(--color-border)", borderRadius: 8,
                fontSize: 13, fontFamily: "inherit", background: "white",
              }} value={sortBy} onChange={e => setSortBy(e.target.value)}>
                <option value="total_margin">Total Margin ↓</option>
                <option value="margin_persen">Margin % ↓</option>
                <option value="total_harga_jual">Pendapatan ↓</option>
                <option value="qty_total">Qty ↓</option>
              </select>
            </div>
            <div style={{ fontSize: 13, color: "var(--color-muted)", fontWeight: 500 }}>
              {sortedItems.length} item — {BULAN_FULL[bulan]} {tahun}
            </div>
          </div>

          {/* Table */}
          {sortedItems.length === 0 ? (
            <div style={{ background: "white", borderRadius: 14, padding: "56px 20px", textAlign: "center", border: "1px solid var(--color-border)", color: "var(--color-muted)" }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>📊</div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Tidak ada data invoice pada periode ini</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Coba pilih periode yang berbeda</div>
            </div>
          ) : (
            <div style={{ background: "white", borderRadius: 14, border: "1px solid var(--color-border)", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {["#", "Nama Item", "Qty Terjual", "Total Beli", "Total Jual", "Total Margin", "Margin %", "Visualisasi"].map(h => (
                      <th key={h} style={{
                        padding: "11px 14px", textAlign: "left", fontSize: 11, fontWeight: 700,
                        color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.05em",
                        borderBottom: "2px solid var(--color-border)", whiteSpace: "nowrap",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedItems.map((item, i) => (
                    <tr key={i} className="mg-row" style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <td style={{ padding: "12px 14px", color: "var(--color-muted)", fontSize: 12, fontWeight: 600 }}>{i + 1}</td>
                      <td style={{ padding: "12px 14px", fontWeight: 700, fontSize: 13 }}>{item.nama_item}</td>
                      <td style={{ padding: "12px 14px", fontSize: 13 }}>{parseFloat(item.qty_total).toFixed(2)}</td>
                      <td style={{ padding: "12px 14px", fontSize: 13, color: "#dc2626", fontWeight: 600 }}>{formatRupiah(item.total_harga_beli)}</td>
                      <td style={{ padding: "12px 14px", fontSize: 13, color: "#059669", fontWeight: 600 }}>{formatRupiah(item.total_harga_jual)}</td>
                      <td style={{ padding: "12px 14px" }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: item.total_margin >= 0 ? "#6366f1" : "#dc2626" }}>
                          {formatRupiah(item.total_margin)}
                        </span>
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <MarginBadge pct={item.margin_persen} />
                      </td>
                      <td style={{ padding: "12px 14px", minWidth: 100 }}>
                        <MiniBar val={item.total_margin} max={maxMargin} pct={item.margin_persen} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
