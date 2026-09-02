import { useState, useEffect, useMemo } from "react";
import { analitikDapurApi, dapurApi } from "@/lib/api";
import { formatRupiah } from "@/components/Layout";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

export default function AnalitikDapurPage() {
  // Filter dates
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const [startDate, setStartDate] = useState(thirtyDaysAgo);
  const [endDate, setEndDate] = useState(today);
  const [activeTab, setActiveTab] = useState("summary"); // summary | bahan | komparasi
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Data states
  const [dapurs, setDapurs] = useState([]);
  const [summaryData, setSummaryData] = useState(null);
  const [bahanData, setBahanData] = useState(null);
  const [komparasiData, setKomparasiData] = useState(null);

  // Filter sub-states
  const [searchBahan, setSearchBahan] = useState("");
  const [selectedKategori, setSelectedKategori] = useState("Semua");
  const [dapurAId, setDapurAId] = useState("");
  const [dapurBId, setDapurBId] = useState("");

  // Load initial list of kitchens
  useEffect(() => {
    dapurApi.list()
      .then(res => {
        const active = (res.data || []).filter(d => d.is_active);
        setDapurs(active);
        if (active.length >= 2) {
          setDapurAId(active[0].id);
          setDapurBId(active[1].id);
        } else if (active.length === 1) {
          setDapurAId(active[0].id);
          setDapurBId(active[0].id);
        }
      })
      .catch(() => {});
  }, []);

  // Fetch data based on active tab
  const fetchData = async () => {
    setLoading(true);
    setError("");
    try {
      if (activeTab === "summary") {
        const res = await analitikDapurApi.summary({ start_date: startDate, end_date: endDate });
        setSummaryData(res.data);
      } else if (activeTab === "bahan") {
        const res = await analitikDapurApi.bahanBaku({
          start_date: startDate,
          end_date: endDate,
          kategori: selectedKategori === "Semua" ? null : selectedKategori,
          search: searchBahan || null,
        });
        setBahanData(res.data);
      } else if (activeTab === "komparasi") {
        if (dapurAId && dapurBId) {
          const res = await analitikDapurApi.komparasi({
            dapur_a_id: dapurAId,
            dapur_b_id: dapurBId,
            start_date: startDate,
            end_date: endDate,
          });
          setKomparasiData(res.data);
        }
      }
    } catch (err) {
      setError(err.response?.data?.detail || "Gagal memuat data analitik.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeTab, startDate, endDate, selectedKategori]);

  // Handle Head-to-Head trigger
  useEffect(() => {
    if (activeTab === "komparasi" && dapurAId && dapurBId) {
      fetchData();
    }
  }, [dapurAId, dapurBId]);

  // Date Presets
  const setPreset = (days) => {
    const end = new Date().toISOString().slice(0, 10);
    const start = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    setStartDate(start);
    setEndDate(end);
  };

  const setMonthPreset = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const end = now.toISOString().slice(0, 10);
    setStartDate(start);
    setEndDate(end);
  };

  // Unique categories for Bahan tab
  const categories = useMemo(() => {
    if (!bahanData?.items) return ["Semua"];
    const cats = new Set(bahanData.items.map(i => i.kategori).filter(Boolean));
    return ["Semua", ...Array.from(cats)];
  }, [bahanData]);

  // Filtered Bahan Items
  const filteredBahanItems = useMemo(() => {
    if (!bahanData?.items) return [];
    return bahanData.items.filter(item => {
      const matchSearch = !searchBahan || item.nama_item.toLowerCase().includes(searchBahan.toLowerCase());
      const matchCat = selectedKategori === "Semua" || item.kategori === selectedKategori;
      return matchSearch && matchCat;
    });
  }, [bahanData, searchBahan, selectedKategori]);

  // Export to CSV
  const handleExportCSV = () => {
    if (activeTab === "summary" && summaryData?.dapur_metrics) {
      const headers = ["Dapur", "Total PM", "PM Kecil", "PM Besar", "Total Belanja (PO)", "Total Pagu", "Biaya per PM", "Rasio Pagu (%)", "Status Efisiensi"];
      const rows = summaryData.dapur_metrics.map(d => [
        `"${d.nama_dapur}"`,
        d.total_pm,
        d.pm_kecil,
        d.pm_besar,
        d.total_belanja,
        d.total_pagu,
        d.biaya_per_pm,
        d.rasio_pagu,
        `"${d.status_efisiensi}"`
      ]);
      const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `analitik_dapur_summary_${startDate}_sd_${endDate}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (activeTab === "bahan" && filteredBahanItems.length > 0) {
      const dapurList = bahanData.dapurs || [];
      const headers = [
        "Nama Bahan",
        "Kategori",
        "Satuan",
        "Total Qty",
        "Total Nilai",
        "Rata-rata / 100 PM",
        ...dapurList.map(d => `"${d.nama} (Qty/100 PM)"`),
        ...dapurList.map(d => `"${d.nama} (Biaya/PM)"`),
      ];
      const rows = filteredBahanItems.map(item => {
        const perDapurQty = dapurList.map(d => item.per_dapur[String(d.id)]?.qty_per_100_pm || 0);
        const perDapurBiaya = dapurList.map(d => item.per_dapur[String(d.id)]?.biaya_per_pm || 0);
        return [
          `"${item.nama_item}"`,
          `"${item.kategori}"`,
          `"${item.satuan}"`,
          item.total_qty,
          item.total_nilai,
          item.avg_usage_per_100_pm,
          ...perDapurQty,
          ...perDapurBiaya,
        ];
      });
      const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `benchmark_bahan_baku_${startDate}_sd_${endDate}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title">⚖️ Analitik & Studi Banding Antar Dapur</h1>
          <p className="page-subtitle">
            Analisis penggunaan bahan baku PO, biaya per PM, dan benchmarking efisiensi antar dapur berskala PM berbeda.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-secondary" onClick={handleExportCSV}>
            📥 Ekspor CSV
          </button>
          <button className="btn btn-primary" onClick={fetchData}>
            🔄 Segarkan
          </button>
        </div>
      </div>

      {/* Date Filter Bar */}
      <div className="card" style={{ marginBottom: 20, padding: "16px 20px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-muted)" }}>Rentang Waktu:</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setPreset(0)}>Hari Ini</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setPreset(7)}>7 Hari Terakhir</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setPreset(30)}>30 Hari Terakhir</button>
            <button className="btn btn-ghost btn-sm" onClick={setMonthPreset}>Bulan Ini</button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="date"
              className="form-control"
              style={{ width: 140, padding: "6px 10px", fontSize: 13 }}
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
            />
            <span style={{ color: "var(--color-muted)" }}>s/d</span>
            <input
              type="date"
              className="form-control"
              style={{ width: 140, padding: "6px 10px", fontSize: 13 }}
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Overview Executive Cards (shown on summary) */}
      {summaryData?.overview && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 24 }}>
          <div className="card" style={{ padding: "18px 20px", borderLeft: "4px solid #6366f1" }}>
            <div style={{ fontSize: 12, color: "var(--color-muted)", fontWeight: 600, textTransform: "uppercase" }}>
              Rata-Rata Biaya / PM
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#4f46e5", marginTop: 4 }}>
              {formatRupiah(summaryData.overview.avg_biaya_per_pm)}
            </div>
            <div style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 4 }}>
              Standar Acuan: Rp 8.000 - Rp 10.000
            </div>
          </div>

          <div className="card" style={{ padding: "18px 20px", borderLeft: "4px solid #10b981" }}>
            <div style={{ fontSize: 12, color: "var(--color-muted)", fontWeight: 600, textTransform: "uppercase" }}>
              🏆 Dapur Paling Efisien
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#059669", marginTop: 4 }}>
              {summaryData.overview.most_efficient_dapur}
            </div>
            <div style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 4 }}>
              Biaya PM: <strong style={{ color: "#059669" }}>{formatRupiah(summaryData.overview.lowest_cost_per_pm)}</strong> / PM
            </div>
          </div>

          <div className="card" style={{ padding: "18px 20px", borderLeft: "4px solid #3b82f6" }}>
            <div style={{ fontSize: 12, color: "var(--color-muted)", fontWeight: 600, textTransform: "uppercase" }}>
              Total PM Terlayani
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#2563eb", marginTop: 4 }}>
              {summaryData.overview.total_pm.toLocaleString("id-ID")}
            </div>
            <div style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 4 }}>
              Penerima Manfaat ({summaryData.overview.total_dapur} Dapur)
            </div>
          </div>

          <div className="card" style={{ padding: "18px 20px", borderLeft: "4px solid #f59e0b" }}>
            <div style={{ fontSize: 12, color: "var(--color-muted)", fontWeight: 600, textTransform: "uppercase" }}>
              Realisasi Belanja vs Pagu
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#d97706", marginTop: 4 }}>
              {summaryData.overview.avg_rasio_pagu}%
            </div>
            <div style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 4 }}>
              {formatRupiah(summaryData.overview.total_belanja)} dari {formatRupiah(summaryData.overview.total_pagu)}
            </div>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div style={{ display: "flex", gap: 12, borderBottom: "2px solid var(--color-border)", marginBottom: 20 }}>
        <button
          onClick={() => setActiveTab("summary")}
          style={{
            padding: "10px 18px",
            fontSize: 14,
            fontWeight: 700,
            background: "none",
            border: "none",
            cursor: "pointer",
            borderBottom: activeTab === "summary" ? "3px solid var(--color-primary)" : "3px solid transparent",
            color: activeTab === "summary" ? "var(--color-primary)" : "var(--color-muted)",
            marginBottom: -2,
          }}
        >
          📊 Ringkasan & Ranking Efisiensi
        </button>

        <button
          onClick={() => setActiveTab("bahan")}
          style={{
            padding: "10px 18px",
            fontSize: 14,
            fontWeight: 700,
            background: "none",
            border: "none",
            cursor: "pointer",
            borderBottom: activeTab === "bahan" ? "3px solid var(--color-primary)" : "3px solid transparent",
            color: activeTab === "bahan" ? "var(--color-primary)" : "var(--color-muted)",
            marginBottom: -2,
          }}
        >
          📦 Studi Banding Bahan Baku (per 100 PM)
        </button>

        <button
          onClick={() => setActiveTab("komparasi")}
          style={{
            padding: "10px 18px",
            fontSize: 14,
            fontWeight: 700,
            background: "none",
            border: "none",
            cursor: "pointer",
            borderBottom: activeTab === "komparasi" ? "3px solid var(--color-primary)" : "3px solid transparent",
            color: activeTab === "komparasi" ? "var(--color-primary)" : "var(--color-muted)",
            marginBottom: -2,
          }}
        >
          ⚖️ Komparasi Head-to-Head (2 Dapur)
        </button>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 20 }}>{error}</div>}

      {loading ? (
        <div className="card" style={{ padding: 60, textAlign: "center" }}>
          <div className="spinner" style={{ width: 36, height: 36, margin: "0 auto 16px" }} />
          <div style={{ color: "var(--color-muted)", fontSize: 14 }}>Memuat data analitik antar dapur...</div>
        </div>
      ) : (
        <>
          {/* TAB 1: SUMMARY & RANKING */}
          {activeTab === "summary" && summaryData && (
            <div>
              {/* Charts Section */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
                <div className="card">
                  <div className="card-title" style={{ marginBottom: 4 }}>📈 Biaya Bahan per PM per Dapur</div>
                  <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 16 }}>
                    Dapur dengan nilai terendah menunjukkan efisiensi pembelanjaan bahan terbaik per porsi/PM.
                  </div>
                  <div style={{ width: "100%", height: 300 }}>
                    <ResponsiveContainer>
                      <BarChart
                        data={summaryData.dapur_metrics.filter(d => d.total_belanja > 0)}
                        margin={{ top: 10, right: 20, left: 10, bottom: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="nama_dapur" tick={{ fontSize: 12 }} />
                        <YAxis tickFormatter={v => `Rp ${v.toLocaleString("id-ID")}`} tick={{ fontSize: 11 }} />
                        <Tooltip
                          formatter={(v) => [formatRupiah(v), "Biaya / PM"]}
                          labelStyle={{ fontWeight: "bold" }}
                        />
                        <ReferenceLine y={8000} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: "Tarif Kecil (8k)", position: "insideTopRight", fill: "#f59e0b", fontSize: 10 }} />
                        <ReferenceLine y={10000} stroke="#ef4444" strokeDasharray="3 3" label={{ value: "Tarif Besar (10k)", position: "insideTopRight", fill: "#ef4444", fontSize: 10 }} />
                        <Bar dataKey="biaya_per_pm" fill="#6366f1" radius={[4, 4, 0, 0]} name="Biaya Bahan / PM" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="card">
                  <div className="card-title" style={{ marginBottom: 4 }}>📊 Realisasi Belanja vs Total Pagu</div>
                  <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 16 }}>
                    Membandingkan total nilai PO dengan pagu anggaran yang dialokasikan berdasarkan jumlah PM.
                  </div>
                  <div style={{ width: "100%", height: 300 }}>
                    <ResponsiveContainer>
                      <BarChart
                        data={summaryData.dapur_metrics.filter(d => d.total_belanja > 0)}
                        margin={{ top: 10, right: 20, left: 10, bottom: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="nama_dapur" tick={{ fontSize: 12 }} />
                        <YAxis tickFormatter={v => `Rp ${(v / 1000000).toFixed(0)}Jt`} tick={{ fontSize: 11 }} />
                        <Tooltip
                          formatter={(v) => [formatRupiah(v)]}
                          labelStyle={{ fontWeight: "bold" }}
                        />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="total_belanja" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Realisasi PO" />
                        <Bar dataKey="total_pagu" fill="#cbd5e1" radius={[4, 4, 0, 0]} name="Pagu Anggaran" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Leaderboard Table */}
              <div className="card">
                <div className="card-title" style={{ marginBottom: 16 }}>
                  🏆 Peringkat & Matriks Efisiensi Seluruh Dapur
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table className="table" style={{ width: "100%", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        <th style={{ width: 50, textAlign: "center" }}>Rank</th>
                        <th>Dapur</th>
                        <th style={{ textAlign: "right" }}>Total PM</th>
                        <th style={{ textAlign: "right" }}>PM Kecil</th>
                        <th style={{ textAlign: "right" }}>PM Besar</th>
                        <th style={{ textAlign: "right" }}>Total Belanja PO</th>
                        <th style={{ textAlign: "right" }}>Total Pagu</th>
                        <th style={{ textAlign: "right", fontWeight: 700 }}>Biaya / PM</th>
                        <th style={{ textAlign: "center" }}>Rasio Pagu</th>
                        <th style={{ textAlign: "right" }}>Sisa Hemat Pagu</th>
                        <th style={{ textAlign: "center" }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summaryData.dapur_metrics.map((dm) => {
                        const rankMedal = dm.rank_efisiensi === 1 ? "🥇 #1" : dm.rank_efisiensi === 2 ? "🥈 #2" : dm.rank_efisiensi === 3 ? "🥉 #3" : dm.rank_efisiensi ? `#${dm.rank_efisiensi}` : "-";
                        return (
                          <tr key={dm.dapur_id} style={{ borderTop: "1px solid var(--color-border)" }}>
                            <td style={{ textAlign: "center", fontWeight: 700 }}>
                              <span style={{ fontSize: 14 }}>{rankMedal}</span>
                            </td>
                            <td>
                              <div style={{ fontWeight: 700 }}>{dm.nama_dapur}</div>
                              <div style={{ fontSize: 11, color: "var(--color-muted)" }}>{dm.kode_dapur} • {dm.po_count} PO</div>
                            </td>
                            <td style={{ textAlign: "right", fontWeight: 700 }}>
                              {dm.total_pm.toLocaleString("id-ID")}
                            </td>
                            <td style={{ textAlign: "right", color: "var(--color-muted)" }}>
                              {dm.pm_kecil.toLocaleString("id-ID")}
                            </td>
                            <td style={{ textAlign: "right", color: "var(--color-muted)" }}>
                              {dm.pm_besar.toLocaleString("id-ID")}
                            </td>
                            <td style={{ textAlign: "right", fontWeight: 600 }}>
                              {formatRupiah(dm.total_belanja)}
                            </td>
                            <td style={{ textAlign: "right", color: "var(--color-muted)" }}>
                              {formatRupiah(dm.total_pagu)}
                            </td>
                            <td style={{ textAlign: "right", fontWeight: 800, color: "var(--color-primary)", fontSize: 14 }}>
                              {formatRupiah(dm.biaya_per_pm)}
                            </td>
                            <td style={{ textAlign: "center", fontWeight: 700 }}>
                              {dm.rasio_pagu}%
                            </td>
                            <td style={{ textAlign: "right", color: dm.sisa_pagu >= 0 ? "var(--color-success)" : "var(--color-danger)", fontWeight: 600 }}>
                              {dm.sisa_pagu >= 0 ? `+${formatRupiah(dm.sisa_pagu)}` : formatRupiah(dm.sisa_pagu)}
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <span className={`badge badge-${dm.badge_color}`} style={{ fontSize: 11 }}>
                                {dm.status_efisiensi}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: STUDI BANDING BAHAN BAKU */}
          {activeTab === "bahan" && bahanData && (
            <div>
              {/* Filter controls */}
              <div className="card" style={{ marginBottom: 20, padding: 16 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center", flex: 1, minWidth: 260 }}>
                    <div className="search-box" style={{ flex: 1 }}>
                      <span className="search-box-icon">🔍</span>
                      <input
                        placeholder="Cari nama bahan baku (misal: beras, ayam, telur)..."
                        value={searchBahan}
                        onChange={e => setSearchBahan(e.target.value)}
                      />
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 13, color: "var(--color-muted)", fontWeight: 600 }}>Kategori:</span>
                    <select
                      className="form-control"
                      style={{ fontSize: 13, padding: "6px 12px" }}
                      value={selectedKategori}
                      onChange={e => setSelectedKategori(e.target.value)}
                    >
                      {categories.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Chart Comparison of Top 6 Ingredients */}
              {filteredBahanItems.length > 0 && (
                <div className="card" style={{ marginBottom: 20 }}>
                  <div className="card-title" style={{ marginBottom: 4 }}>
                    📊 Perbandingan Pemakaian Bahan Pokok Teratas (Qty per 100 PM)
                  </div>
                  <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 16 }}>
                    Menstandarkan konsumsi bahan per 100 Penerima Manfaat. Dapur yang lebih tinggi menunjukkan porsi atau pemakaian bahan yang lebih intensif.
                  </div>
                  <div style={{ width: "100%", height: 320 }}>
                    <ResponsiveContainer>
                      <BarChart
                        data={filteredBahanItems.slice(0, 6).map(item => {
                          const row = { name: item.nama_item };
                          bahanData.dapurs.forEach(d => {
                            row[d.nama] = item.per_dapur[String(d.id)]?.qty_per_100_pm || 0;
                          });
                          return row;
                        })}
                        margin={{ top: 10, right: 20, left: 10, bottom: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        {bahanData.dapurs.map((d, idx) => {
                          const colors = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];
                          return (
                            <Bar key={d.id} dataKey={d.nama} fill={colors[idx % colors.length]} radius={[4, 4, 0, 0]} />
                          );
                        })}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Comprehensive Benchmark Table */}
              <div className="card">
                <div className="card-title" style={{ marginBottom: 16 }}>
                  📋 Tabel Normatif Pemakaian Bahan Baku (per 100 PM)
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table className="table" style={{ width: "100%", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        <th style={{ minWidth: 160 }}>Nama Bahan</th>
                        <th>Kategori</th>
                        <th>Sat</th>
                        <th style={{ textAlign: "right" }}>Total Qty</th>
                        <th style={{ textAlign: "right" }}>Total Nilai</th>
                        <th style={{ textAlign: "right", background: "#f1f5f9" }}>Rata-rata / 100 PM</th>
                        {bahanData.dapurs.map(d => (
                          <th key={d.id} style={{ textAlign: "right", minWidth: 110 }}>
                            <div>{d.nama}</div>
                            <div style={{ fontSize: 10, color: "var(--color-muted)", fontWeight: 400 }}>Qty/100 PM (Biaya/PM)</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBahanItems.length === 0 ? (
                        <tr>
                          <td colSpan={6 + bahanData.dapurs.length} style={{ textAlign: "center", padding: 30, color: "var(--color-muted)" }}>
                            Tidak ada bahan baku yang cocok dengan pencarian atau kategori ini.
                          </td>
                        </tr>
                      ) : (
                        filteredBahanItems.map((item, idx) => (
                          <tr key={idx} style={{ borderTop: "1px solid var(--color-border)" }}>
                            <td style={{ fontWeight: 600 }}>{item.nama_item}</td>
                            <td>
                              <span className="badge badge-secondary" style={{ fontSize: 10 }}>{item.kategori}</span>
                            </td>
                            <td style={{ color: "var(--color-muted)" }}>{item.satuan}</td>
                            <td style={{ textAlign: "right" }}>{item.total_qty.toLocaleString("id-ID")}</td>
                            <td style={{ textAlign: "right", fontWeight: 600 }}>{formatRupiah(item.total_nilai)}</td>
                            <td style={{ textAlign: "right", fontWeight: 700, background: "#f8fafc", color: "var(--color-primary)" }}>
                              {item.avg_usage_per_100_pm} {item.satuan}
                            </td>
                            {bahanData.dapurs.map(d => {
                              const dStat = item.per_dapur[String(d.id)] || { qty_per_100_pm: 0, biaya_per_pm: 0 };
                              const isHigherThanAvg = item.avg_usage_per_100_pm > 0 && dStat.qty_per_100_pm > item.avg_usage_per_100_pm * 1.25;
                              return (
                                <td key={d.id} style={{ textAlign: "right" }}>
                                  <div style={{ fontWeight: 700, color: isHigherThanAvg ? "#ef4444" : "inherit" }}>
                                    {dStat.qty_per_100_pm > 0 ? `${dStat.qty_per_100_pm} ${item.satuan}` : "-"}
                                  </div>
                                  {dStat.biaya_per_pm > 0 && (
                                    <div style={{ fontSize: 10, color: "var(--color-muted)" }}>
                                      {formatRupiah(dStat.biaya_per_pm)}/PM
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: KOMPARASI HEAD-TO-HEAD */}
          {activeTab === "komparasi" && (
            <div>
              {/* Kitchen Selector Card */}
              <div className="card" style={{ marginBottom: 20, padding: 16 }}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>Pilih Dapur A:</span>
                    <select
                      className="form-control"
                      style={{ width: 180, fontWeight: 700 }}
                      value={dapurAId}
                      onChange={e => setDapurAId(parseInt(e.target.value))}
                    >
                      {dapurs.map(d => (
                        <option key={d.id} value={d.id}>{d.nama} ({d.kode})</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ fontSize: 20, fontWeight: 800, color: "var(--color-muted)" }}>VS</div>

                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>Pilih Dapur B:</span>
                    <select
                      className="form-control"
                      style={{ width: 180, fontWeight: 700 }}
                      value={dapurBId}
                      onChange={e => setDapurBId(parseInt(e.target.value))}
                    >
                      {dapurs.map(d => (
                        <option key={d.id} value={d.id}>{d.nama} ({d.kode})</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {komparasiData && (
                <div>
                  {/* Head-to-Head KPI Card */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
                    <div className="card" style={{ borderTop: "4px solid #6366f1" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ fontSize: 18, fontWeight: 800 }}>{komparasiData.dapur_a.nama}</div>
                        <span className="badge badge-primary">{komparasiData.dapur_a.kode}</span>
                      </div>
                      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div>
                          <div style={{ fontSize: 11, color: "var(--color-muted)" }}>TOTAL PM</div>
                          <div style={{ fontSize: 18, fontWeight: 700 }}>{komparasiData.dapur_a.total_pm.toLocaleString("id-ID")} PM</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: "var(--color-muted)" }}>TOTAL BELANJA PO</div>
                          <div style={{ fontSize: 16, fontWeight: 700 }}>{formatRupiah(komparasiData.dapur_a.total_belanja)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: "var(--color-muted)" }}>BIAYA / PM</div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: "#4f46e5" }}>
                            {formatRupiah(komparasiData.dapur_a.biaya_per_pm)}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: "var(--color-muted)" }}>PAGU ANGGARAN</div>
                          <div style={{ fontSize: 15, fontWeight: 600 }}>{formatRupiah(komparasiData.dapur_a.pagu_total)}</div>
                        </div>
                      </div>
                    </div>

                    <div className="card" style={{ borderTop: "4px solid #10b981" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ fontSize: 18, fontWeight: 800 }}>{komparasiData.dapur_b.nama}</div>
                        <span className="badge badge-success">{komparasiData.dapur_b.kode}</span>
                      </div>
                      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div>
                          <div style={{ fontSize: 11, color: "var(--color-muted)" }}>TOTAL PM</div>
                          <div style={{ fontSize: 18, fontWeight: 700 }}>{komparasiData.dapur_b.total_pm.toLocaleString("id-ID")} PM</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: "var(--color-muted)" }}>TOTAL BELANJA PO</div>
                          <div style={{ fontSize: 16, fontWeight: 700 }}>{formatRupiah(komparasiData.dapur_b.total_belanja)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: "var(--color-muted)" }}>BIAYA / PM</div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: "#059669" }}>
                            {formatRupiah(komparasiData.dapur_b.biaya_per_pm)}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: "var(--color-muted)" }}>PAGU ANGGARAN</div>
                          <div style={{ fontSize: 15, fontWeight: 600 }}>{formatRupiah(komparasiData.dapur_b.pagu_total)}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Verdict summary banner */}
                  <div className="card" style={{ marginBottom: 20, background: "rgba(99, 102, 241, 0.05)", borderLeft: "4px solid #6366f1" }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                      💡 Hasil Komparasi: <strong style={{ color: "var(--color-primary)" }}>{komparasiData.head_to_head_summary.cheaper_dapur}</strong> lebih hemat sebesar <strong>{formatRupiah(komparasiData.head_to_head_summary.hemat_per_pm)} / PM ({komparasiData.head_to_head_summary.diff_pct}%)</strong> dibanding dapur pembanding.
                    </div>
                  </div>

                  {/* Category Cost Breakdown Chart */}
                  <div className="card" style={{ marginBottom: 24 }}>
                    <div className="card-title" style={{ marginBottom: 4 }}>
                      📊 Perbandingan Biaya per Kategori Bahan per PM
                    </div>
                    <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 16 }}>
                      Menunjukkan alokasi rupiah per porsi/PM untuk masing-masing kelompok bahan pangan.
                    </div>
                    <div style={{ width: "100%", height: 280 }}>
                      <ResponsiveContainer>
                        <BarChart
                          data={komparasiData.kategori_comparison.map(c => ({
                            kategori: c.kategori,
                            [komparasiData.dapur_a.nama]: c.biaya_pm_a,
                            [komparasiData.dapur_b.nama]: c.biaya_pm_b,
                          }))}
                          margin={{ top: 10, right: 20, left: 10, bottom: 20 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                          <XAxis dataKey="kategori" tick={{ fontSize: 12 }} />
                          <YAxis tickFormatter={v => `Rp ${v}`} tick={{ fontSize: 11 }} />
                          <Tooltip formatter={v => [formatRupiah(v), "Biaya / PM"]} />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          <Bar dataKey={komparasiData.dapur_a.nama} fill="#6366f1" radius={[4, 4, 0, 0]} />
                          <Bar dataKey={komparasiData.dapur_b.nama} fill="#10b981" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Top Item Disparities */}
                  <div className="card">
                    <div className="card-title" style={{ marginBottom: 16 }}>
                      🔍 Top Disparitas Pemakaian Bahan (per 100 PM)
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table className="table" style={{ width: "100%", fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: "#f8fafc" }}>
                            <th>Bahan Baku</th>
                            <th>Kategori</th>
                            <th style={{ textAlign: "right" }}>{komparasiData.dapur_a.nama} (per 100 PM)</th>
                            <th style={{ textAlign: "right" }}>{komparasiData.dapur_b.nama} (per 100 PM)</th>
                            <th style={{ textAlign: "right" }}>Selisih (per 100 PM)</th>
                            <th style={{ textAlign: "center" }}>Konsumsi Lebih Tinggi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {komparasiData.top_item_disparities.map((item, idx) => (
                            <tr key={idx} style={{ borderTop: "1px solid var(--color-border)" }}>
                              <td style={{ fontWeight: 600 }}>{item.nama}</td>
                              <td><span className="badge badge-secondary" style={{ fontSize: 11 }}>{item.kategori}</span></td>
                              <td style={{ textAlign: "right", fontWeight: 700 }}>
                                {item.per_100_pm_a} {item.satuan}
                              </td>
                              <td style={{ textAlign: "right", fontWeight: 700 }}>
                                {item.per_100_pm_b} {item.satuan}
                              </td>
                              <td style={{ textAlign: "right", fontWeight: 700, color: "var(--color-primary)" }}>
                                {Math.abs(item.diff_100_pm)} {item.satuan} ({item.diff_pct}%)
                              </td>
                              <td style={{ textAlign: "center" }}>
                                <span className={`badge badge-${item.higher_consumer === komparasiData.dapur_a.nama ? "primary" : "success"}`}>
                                  {item.higher_consumer}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

AnalitikDapurPage.title = "Analitik & Studi Banding Antar Dapur";
