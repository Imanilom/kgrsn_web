import { useEffect, useState } from "react";
import { dapurApi } from "@/lib/api";
import { StatusBadge } from "@/components/Layout";

export default function DapurPage() {
  const [dapur, setDapur] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editData, setEditData] = useState(null);
  const [form, setForm] = useState({ kode: "", nama: "", alamat: "", kontak: "", email: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    dapurApi.list().then(r => setDapur(r.data)).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditData(null);
    setForm({ kode: "", nama: "", alamat: "", kontak: "", email: "" });
    setError("");
    setShowModal(true);
  };

  const openEdit = (d) => {
    setEditData(d);
    setForm({ kode: d.kode, nama: d.nama, alamat: d.alamat || "", kontak: d.kontak || "", email: d.email || "" });
    setError("");
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.kode || !form.nama) { setError("Kode dan nama dapur wajib diisi"); return; }
    setSaving(true); setError("");
    try {
      if (editData) {
        await dapurApi.update(editData.id, { nama: form.nama, alamat: form.alamat, kontak: form.kontak, email: form.email });
      } else {
        await dapurApi.create(form);
      }
      setShowModal(false);
      load();
    } catch (err) {
      setError(err.response?.data?.detail || "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dapur</h1>
          <p className="page-subtitle">Kelola registrasi dapur yang mengirim PO</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ Tambah Dapur</button>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading-overlay"><div className="spinner" style={{ width: 32, height: 32 }}></div></div>
        ) : dapur.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🍳</div>
            <div className="empty-state-title">Belum ada dapur terdaftar</div>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={openCreate}>+ Tambah Dapur</button>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
            {dapur.map(d => (
              <div key={d.id} style={{
                padding: 20,
                border: "1.5px solid var(--color-border)",
                borderRadius: 12,
                background: d.is_active ? "white" : "#fafafa",
                cursor: "pointer",
              }} onClick={() => openEdit(d)}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{d.nama}</div>
                    <div style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 2 }}>Kode: {d.kode}</div>
                  </div>
                  <span className={`badge badge-${d.is_active ? "approved" : "cancelled"}`}>
                    {d.is_active ? "Aktif" : "Nonaktif"}
                  </span>
                </div>
                {d.alamat && <div style={{ fontSize: 13, color: "var(--color-muted)", marginBottom: 6 }}>📍 {d.alamat}</div>}
                {d.kontak && <div style={{ fontSize: 13, color: "var(--color-muted)", marginBottom: 4 }}>📞 {d.kontak}</div>}
                {d.email && <div style={{ fontSize: 13, color: "var(--color-muted)" }}>✉️ {d.email}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">{editData ? "Edit Dapur" : "Tambah Dapur"}</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-error">{error}</div>}
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Kode Dapur *</label>
                  <input className="form-control" placeholder="DPR-01" value={form.kode}
                    onChange={e => setForm({ ...form, kode: e.target.value })} disabled={!!editData} />
                </div>
                <div className="form-group">
                  <label className="form-label">Nama Dapur *</label>
                  <input className="form-control" placeholder="Nama lengkap dapur" value={form.nama}
                    onChange={e => setForm({ ...form, nama: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Alamat</label>
                <textarea className="form-control" rows={2} value={form.alamat}
                  onChange={e => setForm({ ...form, alamat: e.target.value })} />
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Kontak / Telepon</label>
                  <input className="form-control" value={form.kontak}
                    onChange={e => setForm({ ...form, kontak: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-control" type="email" value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Batal</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? <span className="spinner"></span> : "💾 Simpan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

DapurPage.title = "Dapur";
DapurPage.subtitle = "Registrasi dapur pengirim PO";
