import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { rekapPembeljanApi, supplierApi } from "@/lib/api";

const BULAN = ["", "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

const formatRupiah = (v) => `Rp ${parseFloat(v || 0).toLocaleString("id-ID")}`;
const formatDate = (d) => d ? new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "—";

function Modal({ show, onClose, title, subtitle, wide, children }) {
  if (!show) return null;
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)",
      zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center",
      padding: "24px 16px", overflowY: "auto", backdropFilter: "blur(4px)",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "white", borderRadius: 16, width: "100%", maxWidth: wide ? 860 : 540,
        boxShadow: "0 24px 60px rgba(0,0,0,0.2)", animation: "slideUp 0.2s ease", marginTop: 8,
      }}>
        <div style={{ padding: "20px 26px", borderBottom: "1px solid var(--color-border)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{title}</div>
            {subtitle && <div style={{ fontSize: 13, color: "var(--color-muted)", marginTop: 3 }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--color-muted)", padding: "0 0 0 16px" }}>✕</button>
        </div>
        <div style={{ padding: "22px 26px" }}>{children}</div>
      </div>
    </div>
  );
}

function FormRow({ label, children, span }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, gridColumn: span ? `span ${span}` : undefined }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</label>
      {children}
    </div>
  );
}

function Inp({ ...props }) {
  return (
    <input style={{
      width: "100%", padding: "9px 12px", border: "1.5px solid var(--color-border)",
      borderRadius: 8, fontSize: 13.5, fontFamily: "inherit", color: "var(--color-text)",
      background: "white", outline: "none",
    }} {...props} />
  );
}

function Sel({ children, ...props }) {
  return (
    <select style={{
      width: "100%", padding: "9px 12px", border: "1.5px solid var(--color-border)",
      borderRadius: 8, fontSize: 13.5, fontFamily: "inherit", color: "var(--color-text)",
      background: "white", outline: "none",
    }} {...props}>{children}</select>
  );
}

function RekapCard({ r, onDelete, onDownload }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      background: "white", borderRadius: 14, border: "1px solid var(--color-border)",
      overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
      borderLeft: `4px solid ${r.jenis === "otomatis" ? "#6366f1" : "#f59e0b"}`,
      transition: "box-shadow 0.2s",
    }}>
      <div style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        {/* Left */}
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 800, fontSize: 14, color: "var(--color-primary)" }}>{r.nomor_rekap}</span>
            <span style={{
              padding: "2px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700,
              background: r.jenis === "otomatis" ? "rgba(99,102,241,0.12)" : "rgba(245,158,11,0.12)",
              color: r.jenis === "otomatis" ? "#4f46e5" : "#b45309",
            }}>
              {r.jenis === "otomatis" ? "⚡ Otomatis" : "✏️ Manual"}
            </span>
            <span style={{
              padding: "2px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700,
              background: r.status === "final" ? "rgba(16,185,129,0.12)" : "#f1f5f9",
              color: r.status === "final" ? "#059669" : "#64748b",
            }}>
              {r.status === "final" ? "✅ Final" : "📝 Draft"}
            </span>
          </div>
          <div style={{ fontSize: 13, color: "var(--color-muted)", marginBottom: 4 }}>
            <strong style={{ color: "var(--color-text)" }}>{BULAN[r.periode_bulan]} {r.periode_tahun}</strong>
            {" "}&nbsp;•&nbsp;{" "}
            {formatDate(r.tanggal_mulai)} s/d {formatDate(r.tanggal_selesai)}
          </div>
          <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--color-muted)" }}>
            <span>🗂 {r.total_item} item</span>
            {r.catatan && <span>📝 {r.catatan}</span>}
          </div>
        </div>

        {/* Right */}
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 24, fontWeight: 900, color: "var(--color-primary)" }}>{formatRupiah(r.total_pembelian)}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button
              className="btn btn-ghost btn-sm" style={{ border: "1px solid var(--color-border)" }}
              onClick={() => onDownload(r.id, r.nomor_rekap)}
            >
              📄 PDF
            </button>
            {r.details?.length > 0 && (
              <button className="btn btn-ghost btn-sm" style={{ border: "1px solid var(--color-border)" }}
                onClick={() => setOpen(!open)}>
                {open ? "▲ Tutup" : `▼ ${r.details.length} item`}
              </button>
            )}
            <button className="btn btn-sm" style={{ background: "rgba(239,68,68,0.08)", color: "#dc2626", border: "1px solid rgba(239,68,68,0.2)" }}
              onClick={() => onDelete(r.id, r.nomor_rekap)}>🗑️</button>
          </div>
        </div>
      </div>

      {/* Expandable detail table */}
      {open && r.details?.length > 0 && (
        <div style={{ borderTop: "1px solid var(--color-border)", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Tanggal", "Nama Item", "Supplier", "Qty", "Satuan", "Harga", "Subtotal"].map(h => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, color: "var(--color-muted)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--color-border)", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.details.slice(0, 10).map(d => (
                <tr key={d.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "8px 12px", color: "var(--color-muted)" }}>{formatDate(d.tanggal)}</td>
                  <td style={{ padding: "8px 12px", fontWeight: 600 }}>{d.nama_item}</td>
                  <td style={{ padding: "8px 12px", color: "var(--color-muted)" }}>{d.supplier?.nama || "—"}</td>
                  <td style={{ padding: "8px 12px" }}>{d.qty}</td>
                  <td style={{ padding: "8px 12px", color: "var(--color-muted)" }}>{d.satuan}</td>
                  <td style={{ padding: "8px 12px" }}>{formatRupiah(d.harga_satuan)}</td>
                  <td style={{ padding: "8px 12px", fontWeight: 700, color: "var(--color-primary)" }}>{formatRupiah(d.subtotal)}</td>
                </tr>
              ))}
              {r.details.length > 10 && (
                <tr>
                  <td colSpan={7} style={{ padding: "8px 12px", textAlign: "center", color: "var(--color-muted)", fontStyle: "italic" }}>
                    ... dan {r.details.length - 10} baris lagi — lihat PDF untuk detail lengkap
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr style={{ background: "#f8fafc" }}>
                <td colSpan={6} style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, fontSize: 13 }}>Total:</td>
                <td style={{ padding: "8px 12px", fontWeight: 800, color: "var(--color-primary)", fontSize: 13 }}>{formatRupiah(r.total_pembelian)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

export default function RekapPembeljanPage() {
  const [rekapList, setRekapList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [jenis, setJenis] = useState("otomatis");
  const [form, setForm] = useState({
    periode_bulan: new Date().getMonth() + 1,
    periode_tahun: new Date().getFullYear(),
    tanggal_mulai: "",
    tanggal_selesai: "",
    catatan: "",
  });
  const [manualRows, setManualRows] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [filter, setFilter] = useState({ bulan: "", tahun: new Date().getFullYear() });

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filter.bulan) params.periode_bulan = filter.bulan;
      if (filter.tahun) params.periode_tahun = filter.tahun;
      const res = await rekapPembeljanApi.list(params);
      setRekapList(res.data);
    } catch { setError("Gagal memuat rekap pembelanjaan"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [filter]);
  useEffect(() => { supplierApi.list().then(r => setSuppliers(r.data)).catch(() => {}); }, []);

  const addManualRow = () => setManualRows([...manualRows, {
    tanggal: form.tanggal_mulai || new Date().toISOString().split("T")[0],
    nama_item: "", satuan: "kg", qty: 1, harga_satuan: 0, supplier_id: "", catatan: "",
  }]);

  const updateManualRow = (idx, field, value) => {
    const rows = [...manualRows];
    rows[idx][field] = value;
    setManualRows(rows);
  };

  const removeManualRow = (idx) => setManualRows(manualRows.filter((_, i) => i !== idx));

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true); setError("");
    try {
      const payload = { ...form, jenis };
      if (jenis === "manual") {
        payload.details = manualRows.map(r => ({
          ...r, qty: parseFloat(r.qty), harga_satuan: parseFloat(r.harga_satuan),
          supplier_id: r.supplier_id || null,
        }));
      }
      if (jenis === "otomatis") await rekapPembeljanApi.createOtomatis(payload);
      else await rekapPembeljanApi.createManual(payload);
      setSuccess("Rekap pembelanjaan berhasil dibuat!");
      setShowCreate(false);
      setManualRows([]);
      load();
    } catch (err) { setError(err.response?.data?.detail || "Gagal membuat rekap"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id, nomor) => {
    if (!confirm(`Hapus rekap ${nomor}?`)) return;
    try { await rekapPembeljanApi.delete(id); setSuccess("Rekap dihapus"); load(); }
    catch (err) { setError(err.response?.data?.detail || "Gagal menghapus"); }
  };

  const handleDownload = async (id, nomor) => {
    try {
      const res = await rekapPembeljanApi.downloadPdf(id);
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `RekapPembelanjaan_${(nomor || id).replace(/\//g, "-")}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.detail || "Gagal mengunduh PDF");
    }
  };

  const totalManual = manualRows.reduce((s, r) => s + (parseFloat(r.qty) || 0) * (parseFloat(r.harga_satuan) || 0), 0);
  const totalAll = rekapList.reduce((s, r) => s + parseFloat(r.total_pembelian || 0), 0);

  return (
    <Layout title="Rekap Pembelanjaan">
      <style>{`
        @keyframes slideUp { from { transform: translateY(16px); opacity: 0; } to { transform: none; opacity: 1; } }
        .inp-focus:focus { border-color: var(--color-primary) !important; box-shadow: 0 0 0 3px rgba(99,102,241,0.12); }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>🛒 Rekap Pembelanjaan</h1>
          <p style={{ color: "var(--color-muted)", margin: "4px 0 0", fontSize: 13 }}>
            Rekap pengeluaran pembelian bahan baku oleh purchasing
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>＋ Buat Rekap Baru</button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          ⚠️ {error}
          <button onClick={() => setError("")} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
      )}
      {success && (
        <div className="alert alert-success" style={{ marginBottom: 16 }}>
          ✅ {success}
          <button onClick={() => setSuccess("")} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
      )}

      {/* Summary Row */}
      {rekapList.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
          <div style={{ background: "white", borderRadius: 14, padding: "16px 20px", border: "1px solid var(--color-border)", borderTop: "3px solid #6366f1", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase", marginBottom: 4 }}>Total Periode Ini</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#6366f1" }}>{formatRupiah(totalAll)}</div>
          </div>
          <div style={{ background: "white", borderRadius: 14, padding: "16px 20px", border: "1px solid var(--color-border)", borderTop: "3px solid #10b981", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase", marginBottom: 4 }}>Jumlah Rekap</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#059669" }}>{rekapList.length} rekap</div>
          </div>
          <div style={{ background: "white", borderRadius: 14, padding: "16px 20px", border: "1px solid var(--color-border)", borderTop: "3px solid #f59e0b", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase", marginBottom: 4 }}>Rata-rata per Rekap</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#b45309" }}>{formatRupiah(rekapList.length ? totalAll / rekapList.length : 0)}</div>
          </div>
        </div>
      )}

      {/* Filter */}
      <div style={{
        background: "white", borderRadius: 12, padding: "12px 16px", marginBottom: 20,
        border: "1px solid var(--color-border)", display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase" }}>Bulan</label>
          <Sel value={filter.bulan} onChange={e => setFilter({ ...filter, bulan: e.target.value })} style={{ minWidth: 130, padding: "7px 10px" }}>
            <option value="">Semua Bulan</option>
            {BULAN.slice(1).map((b, i) => <option key={i + 1} value={i + 1}>{b}</option>)}
          </Sel>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase" }}>Tahun</label>
          <Inp type="number" value={filter.tahun} onChange={e => setFilter({ ...filter, tahun: e.target.value })} style={{ width: 90, padding: "7px 10px" }} />
        </div>
        <button className="btn btn-ghost btn-sm" style={{ border: "1px solid var(--color-border)" }} onClick={load}>🔄 Refresh</button>
        {filter.bulan && (
          <button className="btn btn-ghost btn-sm" onClick={() => setFilter({ bulan: "", tahun: filter.tahun })}>✕ Reset</button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 80 }}>
          <div className="spinner" style={{ width: 28, height: 28, margin: "0 auto 12px" }} />
          <div style={{ fontSize: 13, color: "var(--color-muted)" }}>Memuat rekap pembelanjaan...</div>
        </div>
      ) : rekapList.length === 0 ? (
        <div style={{ background: "white", borderRadius: 14, padding: "64px 20px", textAlign: "center", border: "1px solid var(--color-border)" }}>
          <div style={{ fontSize: 42, marginBottom: 12 }}>🛒</div>
          <div style={{ fontWeight: 700, fontSize: 15, color: "var(--color-text)" }}>Belum ada rekap pembelanjaan</div>
          <div style={{ fontSize: 13, color: "var(--color-muted)", marginTop: 6, marginBottom: 18 }}>Buat rekap dari PO yang sudah ada atau input manual</div>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>＋ Buat Rekap Pertama</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {rekapList.map(r => (
            <RekapCard key={r.id} r={r} onDelete={handleDelete} onDownload={handleDownload} />
          ))}
        </div>
      )}

      {/* Modal: Buat Rekap */}
      <Modal show={showCreate} onClose={() => { setShowCreate(false); setManualRows([]); }} title="Buat Rekap Pembelanjaan" wide>
        {/* Jenis Toggle */}
        <div style={{ display: "flex", gap: 0, marginBottom: 20, background: "#f1f5f9", borderRadius: 10, padding: 4 }}>
          {[
            { key: "otomatis", label: "⚡ Otomatis dari PO" },
            { key: "manual", label: "✏️ Input Manual" },
          ].map(opt => (
            <button key={opt.key} type="button"
              onClick={() => setJenis(opt.key)}
              style={{
                flex: 1, padding: "8px 14px", border: "none", borderRadius: 8, cursor: "pointer",
                fontFamily: "inherit", fontSize: 13.5, fontWeight: 700,
                background: jenis === opt.key ? "white" : "transparent",
                color: jenis === opt.key ? "var(--color-primary)" : "var(--color-muted)",
                boxShadow: jenis === opt.key ? "0 1px 4px rgba(0,0,0,0.10)" : "none",
                transition: "all 0.15s",
              }}>
              {opt.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
            <FormRow label="Bulan *">
              <Sel value={form.periode_bulan} onChange={e => setForm({ ...form, periode_bulan: parseInt(e.target.value) })} required>
                {BULAN.slice(1).map((b, i) => <option key={i + 1} value={i + 1}>{b}</option>)}
              </Sel>
            </FormRow>
            <FormRow label="Tahun *">
              <Inp type="number" value={form.periode_tahun} onChange={e => setForm({ ...form, periode_tahun: parseInt(e.target.value) })} required />
            </FormRow>
            <FormRow label="Tanggal Mulai *">
              <Inp type="date" value={form.tanggal_mulai} onChange={e => setForm({ ...form, tanggal_mulai: e.target.value })} required />
            </FormRow>
            <FormRow label="Tanggal Selesai *">
              <Inp type="date" value={form.tanggal_selesai} onChange={e => setForm({ ...form, tanggal_selesai: e.target.value })} required />
            </FormRow>
            <FormRow label="Catatan" span={2}>
              <Inp value={form.catatan} onChange={e => setForm({ ...form, catatan: e.target.value })} placeholder="Opsional..." />
            </FormRow>
          </div>

          {/* Mode-specific content */}
          {jenis === "otomatis" ? (
            <div style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
              <div style={{ fontWeight: 700, color: "#4f46e5", fontSize: 13, marginBottom: 4 }}>⚡ Mode Otomatis</div>
              <div style={{ fontSize: 13, color: "#4338ca" }}>
                Rekap akan dibuat dari semua PO berstatus <strong>approved / delivered / invoiced</strong> dalam rentang tanggal yang dipilih.
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Baris Pembelanjaan Manual</div>
                <button type="button" className="btn btn-primary btn-sm" onClick={addManualRow}>＋ Tambah Baris</button>
              </div>
              {manualRows.length === 0 ? (
                <div style={{ background: "#f8fafc", borderRadius: 10, padding: "28px 20px", textAlign: "center", border: "2px dashed var(--color-border)", color: "var(--color-muted)", fontSize: 13 }}>
                  Klik "Tambah Baris" untuk menambah item pembelanjaan manual
                </div>
              ) : (
                <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid var(--color-border)" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        {["Tanggal", "Nama Item", "Supplier", "Qty", "Satuan", "Harga Satuan", "Subtotal", ""].map(h => (
                          <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 700, color: "var(--color-muted)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--color-border)", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {manualRows.map((r, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "6px 8px" }}>
                            <Inp type="date" value={r.tanggal} onChange={e => updateManualRow(i, "tanggal", e.target.value)} style={{ minWidth: 120 }} />
                          </td>
                          <td style={{ padding: "6px 8px" }}>
                            <Inp value={r.nama_item} onChange={e => updateManualRow(i, "nama_item", e.target.value)} placeholder="Nama bahan" style={{ minWidth: 140 }} required />
                          </td>
                          <td style={{ padding: "6px 8px" }}>
                            <Sel value={r.supplier_id} onChange={e => updateManualRow(i, "supplier_id", e.target.value)} style={{ minWidth: 120 }}>
                              <option value="">—</option>
                              {suppliers.map(s => <option key={s.id} value={s.id}>{s.nama}</option>)}
                            </Sel>
                          </td>
                          <td style={{ padding: "6px 8px" }}>
                            <Inp type="number" value={r.qty} onChange={e => updateManualRow(i, "qty", e.target.value)} min={0} step={0.01} style={{ width: 70 }} />
                          </td>
                          <td style={{ padding: "6px 8px" }}>
                            <Inp value={r.satuan} onChange={e => updateManualRow(i, "satuan", e.target.value)} style={{ width: 60 }} />
                          </td>
                          <td style={{ padding: "6px 8px" }}>
                            <Inp type="number" value={r.harga_satuan} onChange={e => updateManualRow(i, "harga_satuan", e.target.value)} min={0} style={{ width: 110 }} />
                          </td>
                          <td style={{ padding: "6px 8px", fontWeight: 700, color: "var(--color-primary)", whiteSpace: "nowrap" }}>
                            {formatRupiah((parseFloat(r.qty) || 0) * (parseFloat(r.harga_satuan) || 0))}
                          </td>
                          <td style={{ padding: "6px 8px" }}>
                            <button type="button" onClick={() => removeManualRow(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 16, padding: "0 4px" }}>✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: "#f8fafc" }}>
                        <td colSpan={6} style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, fontSize: 13 }}>Total:</td>
                        <td style={{ padding: "8px 10px", fontWeight: 800, color: "var(--color-primary)", fontSize: 13 }}>{formatRupiah(totalManual)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-ghost" onClick={() => { setShowCreate(false); setManualRows([]); }}>Batal</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Memproses..." : "🚀 Buat Rekap"}
            </button>
          </div>
        </form>
      </Modal>
    </Layout>
  );
}
