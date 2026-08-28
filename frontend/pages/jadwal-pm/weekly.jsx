import React, { useState, useEffect, useCallback } from "react";
import { jadwalPMApi, dapurApi } from "@/lib/api";
import { formatRupiah } from "@/components/Layout";

function ProgressBar({ pct }) {
  const color = pct >= 100 ? "#ef4444" : pct >= 80 ? "#f59e0b" : "#22c55e";
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ background: "#e2e8f0", borderRadius: 4, height: 8, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.3s" }} />
      </div>
      <div style={{ fontSize: 11, color: "var(--color-muted)", marginTop: 2, textAlign: "right" }}>
        {pct.toFixed(1)}%
      </div>
    </div>
  );
}

export default function WeeklyPaguPage() {
  const [user, setUser] = useState(null);
  const [dapurList, setDapurList] = useState([]);
  const [summaryData, setSummaryData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [filterTanggal, setFilterTanggal] = useState(() => {
    return new Date().toISOString().slice(0, 10);
  });
  const [filterDapur, setFilterDapur] = useState("");
  const [expandedRow, setExpandedRow] = useState(null);

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem("user"));
      setUser(u);
      if ((u?.role === "operator" || u?.role === "akuntan") && u.dapur_id) setFilterDapur(u.dapur_id.toString());
    } catch {}
    dapurApi.list({ is_active: true }).then(r => setDapurList(r.data)).catch(console.error);
  }, []);

  const load = useCallback(async () => {
    if (!filterTanggal) return;
    setLoading(true); setError("");
    try {
      const res = await jadwalPMApi.weeklySummary(filterTanggal, filterDapur || undefined);
      setSummaryData(res.data);
    } catch (err) {
      setError("Gagal memuat ringkasan mingguan");
    } finally {
      setLoading(false);
    }
  }, [filterTanggal, filterDapur]);

  useEffect(() => { load(); }, [load]);

  const isOperator = user?.role === "operator" || user?.role === "akuntan";

  // Calculate grand totals
  const grandPagu = summaryData.reduce((s, r) => s + Number(r.total_pagu), 0);
  const grandTerpakai = summaryData.reduce((s, r) => s + Number(r.total_terpakai), 0);
  const grandSisa = Math.max(grandPagu - grandTerpakai, 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Rekap Pagu Mingguan</h1>
          <p className="page-subtitle">Monitor penggunaan budget seluruh dapur per minggu</p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
        <div className="card" style={{ padding: "16px 20px" }}>
          <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 4 }}>Total Budget Mingguan</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "var(--color-primary)" }}>{formatRupiah(grandPagu)}</div>
        </div>
        <div className="card" style={{ padding: "16px 20px" }}>
          <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 4 }}>Total Terpakai PO</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#f59e0b" }}>{formatRupiah(grandTerpakai)}</div>
        </div>
        <div className="card" style={{ padding: "16px 20px" }}>
          <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 4 }}>Total Sisa Budget</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#22c55e" }}>{formatRupiah(grandSisa)}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="filter-bar">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ fontSize: 13, color: "var(--color-muted)" }}>Pilih Tanggal dalam Minggu</label>
            <input type="date" className="form-control" value={filterTanggal}
              onChange={e => setFilterTanggal(e.target.value)} />
          </div>
          {!isOperator && (
            <select className="form-control" style={{ width: 200 }} value={filterDapur}
              onChange={e => setFilterDapur(e.target.value)}>
              <option value="">Semua Dapur</option>
              {dapurList.map(d => <option key={d.id} value={d.id}>{d.nama}</option>)}
            </select>
          )}
          <button className="btn btn-ghost" onClick={load}>🔄 Refresh</button>
        </div>

        {loading ? (
          <div className="loading-overlay"><div className="spinner" style={{ width: 32, height: 32 }} /></div>
        ) : summaryData.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📊</div>
            <div className="empty-state-title">Tidak ada data mingguan</div>
            <div className="empty-state-sub">Belum ada jadwal PM untuk minggu yang dipilih.</div>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Dapur</th>
                  <th>Periode Minggu</th>
                  <th style={{ textAlign: "right" }}>Budget Minggu</th>
                  <th style={{ textAlign: "right" }}>Terpakai PO</th>
                  <th style={{ textAlign: "right" }}>Sisa Budget</th>
                  <th style={{ width: 150 }}>Penggunaan</th>
                  <th style={{ width: 80, textAlign: "center" }}>Detail</th>
                </tr>
              </thead>
              <tbody>
                {summaryData.map(row => {
                  const isExpanded = expandedRow === row.dapur_id;
                  return (
                    <React.Fragment key={row.dapur_id}>
                      <tr style={{ background: row.total_terpakai > row.total_pagu ? "#fef2f2" : "" }}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{row.dapur_nama}</div>
                          <div style={{ fontSize: 11, color: "var(--color-muted)" }}>{row.dapur_kode}</div>
                        </td>
                        <td>
                          {new Date(row.tanggal_mulai + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short" })} -{" "}
                          {new Date(row.tanggal_selesai + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 600 }} className="rupiah">{formatRupiah(row.total_pagu)}</td>
                        <td style={{ textAlign: "right" }} className="rupiah">{formatRupiah(row.total_terpakai)}</td>
                        <td style={{ textAlign: "right", color: row.total_sisa === 0 && row.total_pagu > 0 ? "#ef4444" : "inherit" }} className="rupiah">
                          {formatRupiah(row.total_sisa)}
                        </td>
                        <td>
                          <ProgressBar pct={row.persen_terpakai} />
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => setExpandedRow(isExpanded ? null : row.dapur_id)}>
                            {isExpanded ? "▲ Tutup" : "▼ Lihat"}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={7} style={{ padding: 0, background: "#f8fafc", borderBottom: "2px solid var(--color-border)" }}>
                            <div style={{ padding: "16px 32px" }}>
                              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: "var(--color-muted)" }}>BREAKDOWN HARIAN</div>
                              <table style={{ background: "#fff", border: "1px solid var(--color-border)", borderRadius: 6, overflow: "hidden" }}>
                                <thead>
                                  <tr style={{ background: "#f1f5f9" }}>
                                    <th style={{ padding: "8px 12px", fontSize: 12 }}>Tanggal</th>
                                    <th style={{ padding: "8px 12px", fontSize: 12, textAlign: "center" }}>Kecil</th>
                                    <th style={{ padding: "8px 12px", fontSize: 12, textAlign: "center" }}>Besar</th>
                                    <th style={{ padding: "8px 12px", fontSize: 12, textAlign: "right" }}>Pagu Harian</th>
                                    <th style={{ padding: "8px 12px", fontSize: 12, textAlign: "right" }}>Terpakai</th>
                                    <th style={{ padding: "8px 12px", fontSize: 12, textAlign: "right" }}>Sisa</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {row.days.map(d => (
                                    <tr key={d.tanggal}>
                                      <td style={{ padding: "8px 12px", fontSize: 12 }}>
                                        {new Date(d.tanggal + "T00:00:00").toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" })}
                                      </td>
                                      <td style={{ padding: "8px 12px", fontSize: 12, textAlign: "center" }}>{d.jumlah_pm_kecil}</td>
                                      <td style={{ padding: "8px 12px", fontSize: 12, textAlign: "center" }}>{d.jumlah_pm_besar}</td>
                                      <td style={{ padding: "8px 12px", fontSize: 12, textAlign: "right" }}>{formatRupiah(d.pagu_total)}</td>
                                      <td style={{ padding: "8px 12px", fontSize: 12, textAlign: "right", color: d.over ? "#ef4444" : "inherit" }}>
                                        {formatRupiah(d.terpakai)}
                                      </td>
                                      <td style={{ padding: "8px 12px", fontSize: 12, textAlign: "right" }}>{formatRupiah(d.sisa)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

WeeklyPaguPage.title = "Rekap Pagu Mingguan";
WeeklyPaguPage.subtitle = "Monitor budget per dapur";
