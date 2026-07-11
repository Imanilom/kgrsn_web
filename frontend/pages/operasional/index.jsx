import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { operasionalApi } from "@/lib/api";

const formatRupiah = (v) => `Rp ${parseFloat(v || 0).toLocaleString("id-ID")}`;
const formatDate = (d) => d ? new Date(d).toLocaleDateString("id-ID") : "-";

const KATEGORI_LIST = [
  { value: "gaji", label: "👷 Gaji & THR" },
  { value: "utilitas", label: "⚡ Utilitas (Listrik/Air/Gas)" },
  { value: "transport", label: "🚚 Transport" },
  { value: "sewa", label: "🏢 Sewa" },
  { value: "perawatan", label: "🔧 Perawatan & Perbaikan" },
  { value: "marketing", label: "📢 Marketing" },
  { value: "lainnya", label: "📦 Lainnya" },
];

const BULAN = ["", "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export default function OperasionalPage() {
  const [costs, setCosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [filter, setFilter] = useState({ bulan: new Date().getMonth() + 1, tahun: new Date().getFullYear(), kategori: "" });
  const [form, setForm] = useState({
    tanggal: new Date().toISOString().split("T")[0],
    kategori: "lainnya",
    deskripsi: "",
    jumlah: "",
    periode_bulan: new Date().getMonth() + 1,
    periode_tahun: new Date().getFullYear(),
    catatan: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filter.bulan) params.periode_bulan = filter.bulan;
      if (filter.tahun) params.periode_tahun = filter.tahun;
      if (filter.kategori) params.kategori = filter.kategori;
      const res = await operasionalApi.list(params);
      setCosts(res.data);
    } catch { setError("Gagal memuat data"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [filter]);

  const resetForm = () => {
    setForm({ tanggal: new Date().toISOString().split("T")[0], kategori: "lainnya", deskripsi: "", jumlah: "", periode_bulan: filter.bulan || new Date().getMonth() + 1, periode_tahun: filter.tahun || new Date().getFullYear(), catatan: "" });
    setEditId(null);
    setShowForm(false);
  };

  const handleEdit = (c) => {
    setForm({ tanggal: c.tanggal, kategori: c.kategori, deskripsi: c.deskripsi, jumlah: c.jumlah, periode_bulan: c.periode_bulan, periode_tahun: c.periode_tahun, catatan: c.catatan || "" });
    setEditId(c.id);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = { ...form, jumlah: parseFloat(form.jumlah), periode_bulan: parseInt(form.periode_bulan), periode_tahun: parseInt(form.periode_tahun) };
      if (editId) {
        await operasionalApi.update(editId, { deskripsi: payload.deskripsi, jumlah: payload.jumlah, catatan: payload.catatan });
        setSuccess("Data berhasil diperbarui");
      } else {
        await operasionalApi.create(payload);
        setSuccess("Pengeluaran operasional berhasil dicatat");
      }
      resetForm();
      load();
    } catch (err) {
      setError(err.response?.data?.detail || "Gagal menyimpan");
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm("Hapus data ini?")) return;
    try {
      await operasionalApi.delete(id);
      setSuccess("Data dihapus");
      load();
    } catch (err) { setError(err.response?.data?.detail || "Gagal menghapus"); }
  };

  // Total per kategori
  const totalBulan = costs.reduce((s, c) => s + parseFloat(c.jumlah || 0), 0);
  const perKategori = KATEGORI_LIST.map(k => ({
    ...k,
    total: costs.filter(c => c.kategori === k.value).reduce((s, c) => s + parseFloat(c.jumlah || 0), 0),
  })).filter(k => k.total > 0);

  return (
    <Layout title="Biaya Operasional">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>🏢 Biaya Operasional</h1>
          <p style={{ color: "var(--text-secondary)", margin: "4px 0 0" }}>
            Gaji, utilitas, transport, sewa, dan pengeluaran non-bahan-baku lainnya
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>➕ Catat Biaya</button>
      </div>

      {error && <div className="alert alert-error">{error} <button onClick={() => setError("")}>✕</button></div>}
      {success && <div className="alert alert-success">{success} <button onClick={() => setSuccess("")}>✕</button></div>}

      {/* Filter */}
      <div className="card" style={{ padding: 16, marginBottom: 20, display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Bulan</label>
          <select className="form-input" value={filter.bulan} onChange={e => setFilter({...filter, bulan: e.target.value})}>
            {BULAN.slice(1).map((b, i) => <option key={i+1} value={i+1}>{b}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Tahun</label>
          <input className="form-input" type="number" value={filter.tahun}
            onChange={e => setFilter({...filter, tahun: e.target.value})} style={{ width: 100 }} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Kategori</label>
          <select className="form-input" value={filter.kategori} onChange={e => setFilter({...filter, kategori: e.target.value})}>
            <option value="">Semua Kategori</option>
            {KATEGORI_LIST.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </div>
        <div style={{ alignSelf: "flex-end" }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--primary)" }}>{formatRupiah(totalBulan)}</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Total {BULAN[filter.bulan]} {filter.tahun}</div>
        </div>
      </div>

      {/* Ringkasan per kategori */}
      {perKategori.length > 0 && (
        <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
          {perKategori.map(k => (
            <div key={k.value} className="card" style={{ padding: "10px 16px", minWidth: 160 }}>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{k.label}</div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{formatRupiah(k.total)}</div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                {totalBulan > 0 ? `${((k.total / totalBulan) * 100).toFixed(1)}%` : "-"}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Form */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="card" style={{ width: 520, padding: 28 }}>
            <h2 style={{ margin: "0 0 20px" }}>{editId ? "Edit" : "Catat"} Biaya Operasional</h2>
            <form onSubmit={handleSubmit}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Tanggal *</label>
                  <input className="form-input" type="date" value={form.tanggal}
                    onChange={e => setForm({...form, tanggal: e.target.value})} required />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Kategori *</label>
                  <select className="form-input" value={form.kategori}
                    onChange={e => setForm({...form, kategori: e.target.value})} required>
                    {KATEGORI_LIST.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ gridColumn: "span 2", margin: 0 }}>
                  <label className="form-label">Deskripsi *</label>
                  <input className="form-input" value={form.deskripsi}
                    onChange={e => setForm({...form, deskripsi: e.target.value})}
                    placeholder="Gaji bulan Juni, Tagihan listrik, dll" required />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Jumlah (Rp) *</label>
                  <input className="form-input" type="number" value={form.jumlah}
                    onChange={e => setForm({...form, jumlah: e.target.value})} required min={0} />
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <div className="form-group" style={{ flex: 1, margin: 0 }}>
                    <label className="form-label">Bulan</label>
                    <select className="form-input" value={form.periode_bulan}
                      onChange={e => setForm({...form, periode_bulan: parseInt(e.target.value)})}>
                      {BULAN.slice(1).map((b, i) => <option key={i+1} value={i+1}>{b}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ flex: 1, margin: 0 }}>
                    <label className="form-label">Tahun</label>
                    <input className="form-input" type="number" value={form.periode_tahun}
                      onChange={e => setForm({...form, periode_tahun: parseInt(e.target.value)})} />
                  </div>
                </div>
                <div className="form-group" style={{ gridColumn: "span 2", margin: 0 }}>
                  <label className="form-label">Catatan</label>
                  <input className="form-input" value={form.catatan}
                    onChange={e => setForm({...form, catatan: e.target.value})} placeholder="Opsional..." />
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 20, justifyContent: "flex-end" }}>
                <button type="button" className="btn btn-secondary" onClick={resetForm}>Batal</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60 }}>⏳ Memuat...</div>
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Kategori</th>
                <th>Deskripsi</th>
                <th>Jumlah</th>
                <th>Catatan</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {costs.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: 32 }}>Belum ada data operasional</td></tr>
              ) : costs.map(c => (
                <tr key={c.id}>
                  <td>{formatDate(c.tanggal)}</td>
                  <td>
                    <span style={{ padding: "2px 10px", borderRadius: 99, fontSize: 11, background: "#f1f5f9", color: "#475569" }}>
                      {KATEGORI_LIST.find(k => k.value === c.kategori)?.label || c.kategori}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600 }}>{c.deskripsi}</td>
                  <td style={{ fontWeight: 700, color: "var(--primary)" }}>{formatRupiah(c.jumlah)}</td>
                  <td style={{ color: "var(--text-secondary)", fontSize: 12 }}>{c.catatan || "-"}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="btn btn-secondary" style={{ padding: "3px 8px", fontSize: 12 }} onClick={() => handleEdit(c)}>✏️</button>
                      <button className="btn" style={{ padding: "3px 8px", fontSize: 12, background: "#fef2f2", color: "#dc2626" }} onClick={() => handleDelete(c.id)}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
              <tr style={{ background: "var(--bg-alt)", fontWeight: 700 }}>
                <td colSpan={3} style={{ textAlign: "right" }}>Total:</td>
                <td style={{ color: "var(--primary)" }}>{formatRupiah(totalBulan)}</td>
                <td colSpan={2}></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}
