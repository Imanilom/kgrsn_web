import { useState, useEffect, useCallback } from "react";
import { jadwalPMApi, dapurApi } from "@/lib/api";
import { formatRupiah, formatDate } from "@/components/Layout";


function PaguBar({ terpakai, pagu }) {
  if (!pagu || pagu === 0) return null;
  const pct = Math.min((Number(terpakai) / Number(pagu)) * 100, 100);
  const color = pct >= 100 ? "#ef4444" : pct >= 80 ? "#f59e0b" : "#22c55e";
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ background: "#e2e8f0", borderRadius: 3, height: 6, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.3s" }} />
      </div>
      <div style={{ fontSize: 11, color: "var(--color-muted)", marginTop: 2 }}>
        {formatRupiah(terpakai)} / {formatRupiah(pagu)} ({pct.toFixed(0)}%)
      </div>
    </div>
  );
}

export default function JadwalPMPage() {
  const [user, setUser] = useState(null);
  const [dapurList, setDapurList] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Filter
  const [filterDapur, setFilterDapur] = useState("");
  const [filterDari, setFilterDari] = useState(() => {
    const d = new Date();
    const senin = new Date(d.setDate(d.getDate() - d.getDay() + 1));
    return senin.toISOString().slice(0, 10);
  });
  const [filterSampai, setFilterSampai] = useState(() => {
    const d = new Date();
    const minggu = new Date(d.setDate(d.getDate() - d.getDay() + 7));
    return minggu.toISOString().slice(0, 10);
  });

  // Modal: Bulk tambah
  const [showBulk, setShowBulk] = useState(false);
  const [bulk, setBulk] = useState({
    dapur_id: "", dari_tanggal: "", sampai_tanggal: "",
    jumlah_pm_kecil: 0, jumlah_pm_besar: 0,
  });

  // Inline edit state: { [key]: { kecil: PM_kecil, besar: PM_besar } }
  const [editing, setEditing] = useState({});

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem("user"));
      setUser(u);
      if (u?.role === "operator" && u.dapur_id) setFilterDapur(u.dapur_id.toString());
    } catch {}
    dapurApi.list({ is_active: true }).then(r => setDapurList(r.data)).catch(console.error);
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = {};
      if (filterDapur) params.dapur_id = filterDapur;
      if (filterDari) params.dari_tanggal = filterDari;
      if (filterSampai) params.sampai_tanggal = filterSampai;
      const res = await jadwalPMApi.list(params);
      
      // Group by tanggal & dapur_id
      const grouped = {};
      res.data.forEach(r => {
        const key = `${r.tanggal}_${r.dapur_id}`;
        if (!grouped[key]) {
          grouped[key] = {
            key,
            tanggal: r.tanggal,
            dapur: r.dapur,
            dapur_id: r.dapur_id,
            kecil: null,
            besar: null,
            terpakai_harian: r.terpakai_harian || 0,
            sisa_pagu_harian: r.sisa_pagu_harian || 0,
            pagu_total: 0
          };
        }
        grouped[key][r.jenis_porsi] = r;
        grouped[key].pagu_total += Number(r.pagu_harian);
      });
      
      setRows(Object.values(grouped).sort((a, b) => a.tanggal.localeCompare(b.tanggal)));
    } catch { setError("Gagal memuat data"); }
    finally { setLoading(false); }
  }, [filterDapur, filterDari, filterSampai]);

  useEffect(() => { load(); }, [load]);

  const handleSaveRow = async (row) => {
    const ed = editing[row.key];
    if (!ed) return;
    try {
      if (ed.kecil !== undefined) {
        await jadwalPMApi.create({
          dapur_id: row.dapur_id,
          tanggal: row.tanggal,
          jumlah_pm: ed.kecil,
          jenis_porsi: "kecil"
        });
      }
      if (ed.besar !== undefined) {
        await jadwalPMApi.create({
          dapur_id: row.dapur_id,
          tanggal: row.tanggal,
          jumlah_pm: ed.besar,
          jenis_porsi: "besar"
        });
      }
      setEditing(prev => { const n = { ...prev }; delete n[row.key]; return n; });
      setSuccess("Jadwal diperbarui!"); setTimeout(() => setSuccess(""), 3000);
      load();
    } catch (err) { setError(err.response?.data?.detail || "Gagal update"); }
  };

  const handleDelete = async (row) => {
    if (!confirm("Hapus jadwal ini?")) return;
    try {
      if (row.kecil) await jadwalPMApi.delete(row.kecil.id);
      if (row.besar) await jadwalPMApi.delete(row.besar.id);
      load();
    } catch (err) { setError(err.response?.data?.detail || "Gagal hapus"); }
  };

  const handleBulk = async () => {
    if (!bulk.dapur_id || !bulk.dari_tanggal || !bulk.sampai_tanggal) {
      setError("Lengkapi semua field (dapur & rentang tanggal)"); return;
    }
    if (!bulk.jumlah_pm_kecil && !bulk.jumlah_pm_besar) {
      setError("Isi minimal salah satu: PM Kecil atau PM Besar"); return;
    }
    try {
      const basePayload = {
        dapur_id: parseInt(bulk.dapur_id),
        dari_tanggal: bulk.dari_tanggal,
        sampai_tanggal: bulk.sampai_tanggal,
      };
      if (bulk.jumlah_pm_kecil > 0) {
        await jadwalPMApi.bulk({ ...basePayload, jumlah_pm: parseInt(bulk.jumlah_pm_kecil), jenis_porsi: "kecil" });
      }
      if (bulk.jumlah_pm_besar > 0) {
        await jadwalPMApi.bulk({ ...basePayload, jumlah_pm: parseInt(bulk.jumlah_pm_besar), jenis_porsi: "besar" });
      }
      setShowBulk(false);
      setSuccess("Jadwal PM berhasil dibuat!"); setTimeout(() => setSuccess(""), 4000);
      load();
    } catch (err) { setError(err.response?.data?.detail || "Gagal membuat jadwal"); }
  };

  // Summary stats (now rows are already grouped, and pagu_total is computed)
  const totalPagu = rows.reduce((s, r) => s + Number(r.pagu_total), 0);
  const totalTerpakai = rows.reduce((s, r) => s + Number(r.terpakai_harian || 0), 0);
  const isOperator = user?.role === "operator";

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Jadwal PM & Pagu Harian</h1>
          <p className="page-subtitle">Kelola jadwal penerima manfaat dan pagu anggaran per hari</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setShowBulk(true); setError(""); }}>
          📅 Tambah Periode
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* Stats Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
        {[
          { label: "Total Pagu Periode", value: formatRupiah(totalPagu), color: "var(--color-primary)" },
          { label: "Total Terpakai", value: formatRupiah(totalTerpakai), color: "#f59e0b" },
          { label: "Sisa Anggaran", value: formatRupiah(Math.max(totalPagu - totalTerpakai, 0)), color: "#22c55e" },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: "16px 20px" }}>
            <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="filter-bar">
          {!isOperator && (
            <select className="form-control" style={{ width: 200 }} value={filterDapur}
              onChange={e => setFilterDapur(e.target.value)}>
              <option value="">Semua Dapur</option>
              {dapurList.map(d => <option key={d.id} value={d.id}>{d.nama}</option>)}
            </select>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ fontSize: 13, color: "var(--color-muted)" }}>Dari</label>
            <input type="date" className="form-control" value={filterDari}
              onChange={e => setFilterDari(e.target.value)} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ fontSize: 13, color: "var(--color-muted)" }}>Sampai</label>
            <input type="date" className="form-control" value={filterSampai}
              onChange={e => setFilterSampai(e.target.value)} />
          </div>
          <button className="btn btn-ghost" onClick={load}>🔄 Refresh</button>
        </div>

        {/* Table */}
        {loading ? (
          <div className="loading-overlay"><div className="spinner" style={{ width: 32, height: 32 }} /></div>
        ) : rows.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📅</div>
            <div className="empty-state-title">Belum ada jadwal PM</div>
            <div className="empty-state-sub">Klik "Tambah Periode" untuk mengisi jadwal</div>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Tanggal</th>
                  {!isOperator && <th>Dapur</th>}
                  <th style={{ textAlign: "center" }}>PM Kecil</th>
                  <th style={{ textAlign: "center" }}>PM Besar</th>
                  <th style={{ textAlign: "right" }}>Total Pagu</th>
                  <th>Realisasi PO</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const ed = editing[row.key];
                  const paguCalc = ed ? (ed.kecil * 8000) + (ed.besar * 10000) : row.pagu_total;
                  
                  const pct = paguCalc > 0
                    ? Math.min((Number(row.terpakai_harian) / Number(paguCalc)) * 100, 100)
                    : 0;
                  const rowColor = pct >= 100 ? "#fef2f2" : pct >= 80 ? "#fffbeb" : "";
                  
                  return (
                    <tr key={row.key} style={{ background: rowColor }}>
                      <td style={{ fontWeight: 600 }}>
                        {new Date(row.tanggal + "T00:00:00").toLocaleDateString("id-ID", {
                          weekday: "short", day: "numeric", month: "short", year: "numeric"
                        })}
                      </td>
                      {!isOperator && (
                        <td>
                          <div style={{ fontWeight: 600 }}>{row.dapur?.nama}</div>
                          <div style={{ fontSize: 11, color: "var(--color-muted)" }}>{row.dapur?.kode}</div>
                        </td>
                      )}
                      <td style={{ textAlign: "center" }}>
                        {ed ? (
                          <input type="number" min="0" className="form-control" style={{ width: 80, textAlign: "center", display: "inline-block" }}
                            value={ed.kecil}
                            onChange={e => setEditing(p => ({ ...p, [row.key]: { ...p[row.key], kecil: parseInt(e.target.value) || 0 } }))} />
                        ) : (
                          <span>{row.kecil ? row.kecil.jumlah_pm : 0}</span>
                        )}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {ed ? (
                          <input type="number" min="0" className="form-control" style={{ width: 80, textAlign: "center", display: "inline-block" }}
                            value={ed.besar}
                            onChange={e => setEditing(p => ({ ...p, [row.key]: { ...p[row.key], besar: parseInt(e.target.value) || 0 } }))} />
                        ) : (
                          <span>{row.besar ? row.besar.jumlah_pm : 0}</span>
                        )}
                      </td>
                      <td style={{ textAlign: "right" }} className="rupiah">
                        {formatRupiah(paguCalc)}
                      </td>
                      <td style={{ minWidth: 160 }}>
                        <PaguBar terpakai={row.terpakai_harian || 0} pagu={paguCalc} />
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          {ed ? (
                            <>
                              <button className="btn btn-success btn-sm" onClick={() => handleSaveRow(row)}>✓ Simpan</button>
                              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(p => { const n = { ...p }; delete n[row.key]; return n; })}>✕</button>
                            </>
                          ) : (
                            <>
                              <button className="btn btn-ghost btn-sm"
                                onClick={() => setEditing(p => ({ 
                                  ...p, 
                                  [row.key]: { 
                                    kecil: row.kecil ? row.kecil.jumlah_pm : 0, 
                                    besar: row.besar ? row.besar.jumlah_pm : 0 
                                  } 
                                }))}>
                                ✏️ Edit
                              </button>
                              {!isOperator && (
                                <button className="btn btn-ghost btn-sm" style={{ color: "var(--color-danger)" }}
                                  onClick={() => handleDelete(row)}>🗑</button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Bulk Create */}
      {showBulk && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div className="card" style={{ width: 520, maxWidth: "95vw", position: "relative" }}>
            <div className="card-header">
              <div className="card-title">📅 Tambah Jadwal PM (Periode)</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowBulk(false)}>✕</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {!isOperator && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Dapur *</label>
                  <select className="form-control" value={bulk.dapur_id}
                    onChange={e => setBulk({ ...bulk, dapur_id: e.target.value })}>
                    <option value="">-- Pilih Dapur --</option>
                    {dapurList.map(d => <option key={d.id} value={d.id}>{d.nama}</option>)}
                  </select>
                </div>
              )}
              <div className="form-grid">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Dari Tanggal *</label>
                  <input type="date" className="form-control" value={bulk.dari_tanggal}
                    onChange={e => setBulk({ ...bulk, dari_tanggal: e.target.value })} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Sampai Tanggal *</label>
                  <input type="date" className="form-control" value={bulk.sampai_tanggal}
                    onChange={e => setBulk({ ...bulk, sampai_tanggal: e.target.value })} />
                </div>
              </div>

              {/* Dua kolom: PM Kecil & PM Besar */}
              <div style={{ background: "var(--color-bg)", borderRadius: 8, padding: "14px 16px" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-muted)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Jumlah PM per Hari (isi salah satu atau keduanya)
                </div>
                <div className="form-grid">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ background: "#dbeafe", color: "#1d4ed8", borderRadius: 4, padding: "1px 6px", fontSize: 11, fontWeight: 700 }}>KECIL</span>
                      PM × Rp 8.000
                    </label>
                    <input type="number" min="0" className="form-control" placeholder="0"
                      value={bulk.jumlah_pm_kecil || ""}
                      onChange={e => setBulk({ ...bulk, jumlah_pm_kecil: parseInt(e.target.value) || 0 })} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ background: "#fef3c7", color: "#b45309", borderRadius: 4, padding: "1px 6px", fontSize: 11, fontWeight: 700 }}>BESAR</span>
                      PM × Rp 10.000
                    </label>
                    <input type="number" min="0" className="form-control" placeholder="0"
                      value={bulk.jumlah_pm_besar || ""}
                      onChange={e => setBulk({ ...bulk, jumlah_pm_besar: parseInt(e.target.value) || 0 })} />
                  </div>
                </div>
              </div>

              {/* Preview pagu */}
              {(bulk.jumlah_pm_kecil > 0 || bulk.jumlah_pm_besar > 0) && (
                <div style={{ background: "rgba(var(--color-primary-rgb,79,70,229),0.06)", borderRadius: 8, padding: "12px 16px", fontSize: 13, borderLeft: "3px solid var(--color-primary)" }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Preview Pagu Harian:</div>
                  {bulk.jumlah_pm_kecil > 0 && (
                    <div style={{ color: "var(--color-muted)" }}>
                      Kecil: {bulk.jumlah_pm_kecil} PM × {formatRupiah(8000)} = <strong>{formatRupiah(bulk.jumlah_pm_kecil * 8000)}</strong>
                    </div>
                  )}
                  {bulk.jumlah_pm_besar > 0 && (
                    <div style={{ color: "var(--color-muted)" }}>
                      Besar: {bulk.jumlah_pm_besar} PM × {formatRupiah(10000)} = <strong>{formatRupiah(bulk.jumlah_pm_besar * 10000)}</strong>
                    </div>
                  )}
                  <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--color-border)", display: "flex", justifyContent: "space-between" }}>
                    <strong>Total Pagu / Hari</strong>
                    <strong style={{ color: "var(--color-primary)", fontSize: 15 }}>
                      {formatRupiah((bulk.jumlah_pm_kecil * 8000) + (bulk.jumlah_pm_besar * 10000))}
                    </strong>
                  </div>
                  {bulk.dari_tanggal && bulk.sampai_tanggal && (() => {
                    const hari = Math.max(Math.ceil((new Date(bulk.sampai_tanggal) - new Date(bulk.dari_tanggal)) / 86400000) + 1, 0);
                    const totalPeriode = hari * ((bulk.jumlah_pm_kecil * 8000) + (bulk.jumlah_pm_besar * 10000));
                    return (
                      <div style={{ marginTop: 4, fontSize: 12, color: "var(--color-muted)" }}>
                        Periode {hari} hari → Total: <strong style={{ color: "var(--color-primary)" }}>{formatRupiah(totalPeriode)}</strong>
                      </div>
                    );
                  })()}
                </div>
              )}

              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 8 }}>
                <button className="btn btn-ghost" onClick={() => setShowBulk(false)}>Batal</button>
                <button className="btn btn-primary" onClick={handleBulk}>✓ Buat Jadwal</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

JadwalPMPage.title = "Jadwal PM & Pagu";
JadwalPMPage.subtitle = "Atur jumlah penerima manfaat dan anggaran per hari";
