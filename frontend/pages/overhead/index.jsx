import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { operasionalApi } from "@/lib/api";

const formatRupiah = (v) => `Rp ${parseFloat(v || 0).toLocaleString("id-ID")}`;
const formatDate = (d) => d ? new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const BULAN = ["", "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

const KATEGORI_LIST = [
  { value: "gaji", label: "Gaji & Honor", color: "#6366f1" },
  { value: "utilitas", label: "Utilitas (Listrik, Air, Gas)", color: "#f59e0b" },
  { value: "transport", label: "Transport", color: "#10b981" },
  { value: "sewa", label: "Sewa", color: "#3b82f6" },
  { value: "perawatan", label: "Perawatan", color: "#8b5cf6" },
  { value: "marketing", label: "Marketing", color: "#ec4899" },
  { value: "lainnya", label: "Lainnya", color: "#64748b" },
];

const KATEGORI_MAP = Object.fromEntries(KATEGORI_LIST.map(k => [k.value, k]));

export default function OverheadPage() {
  const now = new Date();
  const [bulan, setBulan] = useState(now.getMonth() + 1);
  const [tahun, setTahun] = useState(now.getFullYear());
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({
    tanggal: now.toISOString().split("T")[0],
    kategori: "gaji", deskripsi: "", jumlah: "", catatan: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await operasionalApi.list({ periode_bulan: bulan, periode_tahun: tahun });
      setList(res.data);
    } catch { setError("Gagal memuat data overhead"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [bulan, tahun]);

  const resetForm = () => {
    setForm({ tanggal: now.toISOString().split("T")[0], kategori: "gaji", deskripsi: "", jumlah: "", catatan: "" });
    setEditId(null); setShowForm(false); setError("");
  };

  const handleEdit = (item) => {
    setForm({ tanggal: item.tanggal, kategori: item.kategori, deskripsi: item.deskripsi, jumlah: String(item.jumlah), catatan: item.catatan || "" });
    setEditId(item.id); setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true); setError("");
    try {
      const payload = { ...form, jumlah: parseFloat(form.jumlah), periode_bulan: bulan, periode_tahun: tahun };
      if (editId) await operasionalApi.update(editId, { deskripsi: payload.deskripsi, jumlah: payload.jumlah, catatan: payload.catatan });
      else await operasionalApi.create(payload);
      setSuccess(editId ? "Data diperbarui" : "Data berhasil ditambahkan");
      resetForm(); load();
    } catch (err) { setError(err.response?.data?.detail || "Gagal menyimpan"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm("Hapus data overhead ini?")) return;
    try { await operasionalApi.delete(id); setSuccess("Data dihapus"); load(); }
    catch (err) { setError(err.response?.data?.detail || "Gagal menghapus"); }
  };

  const totalAll = list.reduce((s, x) => s + parseFloat(x.jumlah || 0), 0);
  const perKategori = {};
  list.forEach(x => {
    const kat = x.kategori;
    if (!perKategori[kat]) perKategori[kat] = 0;
    perKategori[kat] += parseFloat(x.jumlah || 0);
  });

  const inp = { width: "100%", padding: "9px 12px", border: "1.5px solid var(--color-border)", borderRadius: 8, fontSize: 13.5, fontFamily: "inherit", outline: "none", boxSizing: "border-box" };

  return (
    <Layout title="Overhead & Biaya Operasional">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Overhead & Biaya Operasional</h1>
          <p style={{ color: "var(--color-muted)", margin: "4px 0 0", fontSize: 13 }}>Input dan kelola biaya overhead bulanan</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Tambah Overhead</button>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error} <button onClick={() => setError("")} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer" }}>x</button></div>}
      {success && <div className="alert alert-success" style={{ marginBottom: 16 }}>{success} <button onClick={() => setSuccess("")} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer" }}>x</button></div>}

      <div style={{ background: "white", borderRadius: 12, padding: "12px 16px", marginBottom: 20, border: "1px solid var(--color-border)", display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase", marginBottom: 4 }}>Bulan</div>
          <select value={bulan} onChange={e => setBulan(parseInt(e.target.value))} style={{ ...inp, width: 130 }}>
            {BULAN.slice(1).map((b, i) => <option key={i+1} value={i+1}>{b}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase", marginBottom: 4 }}>Tahun</div>
          <input type="number" value={tahun} onChange={e => setTahun(parseInt(e.target.value))} style={{ ...inp, width: 90 }} />
        </div>
      </div>

      {list.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 12, marginBottom: 24 }}>
          <div style={{ background: "white", borderRadius: 12, padding: "14px 18px", border: "1px solid var(--color-border)", borderTop: "3px solid #6366f1" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase", marginBottom: 4 }}>Total Overhead</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#6366f1" }}>{formatRupiah(totalAll)}</div>
          </div>
          {Object.entries(perKategori).map(([kat, total]) => {
            const k = KATEGORI_MAP[kat] || { label: kat, color: "#64748b" };
            return (
              <div key={kat} style={{ background: "white", borderRadius: 12, padding: "14px 18px", border: "1px solid var(--color-border)", borderTop: `3px solid ${k.color}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase", marginBottom: 4 }}>{k.label}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: k.color }}>{formatRupiah(total)}</div>
                <div style={{ fontSize: 12, color: "var(--color-muted)" }}>{totalAll > 0 ? Math.round(total / totalAll * 100) : 0}%</div>
              </div>
            );
          })}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 60 }}><div className="spinner" style={{ margin: "0 auto" }} /></div>
      ) : list.length === 0 ? (
        <div style={{ background: "white", borderRadius: 14, padding: "60px 20px", textAlign: "center", border: "1px solid var(--color-border)" }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Belum ada data overhead untuk periode ini</div>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Tambah Overhead Pertama</button>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr><th>Tanggal</th><th>Kategori</th><th>Deskripsi</th><th style={{ textAlign: "right" }}>Jumlah</th><th>Catatan</th><th style={{ textAlign: "center" }}>Aksi</th></tr>
              </thead>
              <tbody>
                {list.map(item => {
                  const k = KATEGORI_MAP[item.kategori] || { label: item.kategori, color: "#64748b" };
                  return (
                    <tr key={item.id}>
                      <td style={{ color: "var(--color-muted)" }}>{formatDate(item.tanggal)}</td>
                      <td><span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: k.color + "18", color: k.color }}>{k.label}</span></td>
                      <td style={{ fontWeight: 600 }}>{item.deskripsi}</td>
                      <td style={{ textAlign: "right", fontWeight: 700, color: "#ef4444" }}>{formatRupiah(item.jumlah)}</td>
                      <td style={{ color: "var(--color-muted)", fontSize: 12 }}>{item.catatan || "—"}</td>
                      <td style={{ textAlign: "center" }}>
                        <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => handleEdit(item)}>Edit</button>
                          <button className="btn btn-sm" style={{ background: "rgba(239,68,68,0.08)", color: "#dc2626", border: "1px solid rgba(239,68,68,0.2)" }} onClick={() => handleDelete(item.id)}>Hapus</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--color-border)", background: "#f8fafc" }}>
                  <td colSpan={3} style={{ textAlign: "right", fontWeight: 700, padding: "12px 16px" }}>Total:</td>
                  <td style={{ textAlign: "right", fontWeight: 800, color: "#ef4444", padding: "12px 16px" }}>{formatRupiah(totalAll)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {showForm && (
        <div onClick={resetForm} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: 16, width: "100%", maxWidth: 500, boxShadow: "0 24px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--color-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 17, fontWeight: 800 }}>{editId ? "Edit Overhead" : "Tambah Overhead"}</div>
              <button onClick={resetForm} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--color-muted)" }}>x</button>
            </div>
            <form onSubmit={handleSubmit} style={{ padding: "20px 24px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Tanggal *</div>
                    <input type="date" value={form.tanggal} onChange={e => setForm({ ...form, tanggal: e.target.value })} style={inp} required />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Kategori *</div>
                    <select value={form.kategori} onChange={e => setForm({ ...form, kategori: e.target.value })} style={inp} disabled={!!editId}>
                      {KATEGORI_LIST.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Deskripsi *</div>
                  <input value={form.deskripsi} onChange={e => setForm({ ...form, deskripsi: e.target.value })} style={inp} placeholder="mis: Gaji karyawan..." required />
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Jumlah (Rp) *</div>
                  <input type="number" value={form.jumlah} onChange={e => setForm({ ...form, jumlah: e.target.value })} style={inp} placeholder="0" min={0} required />
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Catatan</div>
                  <input value={form.catatan} onChange={e => setForm({ ...form, catatan: e.target.value })} style={inp} placeholder="Opsional..." />
                </div>
              </div>
              {error && <div style={{ marginTop: 14, padding: "10px 14px", background: "#fee2e2", borderRadius: 8, color: "#991b1b", fontSize: 13 }}>{error}</div>}
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
                <button type="button" className="btn btn-ghost" onClick={resetForm}>Batal</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Menyimpan..." : editId ? "Perbarui" : "Simpan"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
