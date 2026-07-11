import { useEffect, useState, useRef } from "react";
import { itemApi } from "@/lib/api";

export default function MasterItemPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editData, setEditData] = useState(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ kode_item: "", nama_item: "", satuan: "", kategori: "", deskripsi: "", alias: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const KATEGORIS = ["Groceries", "Perishable", "Bumbu", "Minuman", "Kemasan", "Lainnya"];
  const SATUANS = ["kg", "gram", "liter", "ml", "pcs", "lusin", "karton", "dus", "botol", "sachet"];

  const load = () => {
    setLoading(true);
    itemApi.list().then(r => setItems(r.data)).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditData(null);
    setForm({ kode_item: "", nama_item: "", satuan: "", kategori: "", deskripsi: "", alias: "" });
    setError(""); setShowModal(true);
  };

  const openEdit = (item) => {
    setEditData(item);
    setForm({ kode_item: item.kode_item, nama_item: item.nama_item, satuan: item.satuan || "", kategori: item.kategori || "", deskripsi: item.deskripsi || "", alias: item.alias || "" });
    setError(""); setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.kode_item || !form.nama_item) { setError("Kode item dan nama wajib diisi"); return; }
    setSaving(true); setError("");
    try {
      if (editData) await itemApi.update(editData.id, form);
      else await itemApi.create(form);
      setShowModal(false); load();
    } catch (err) {
      setError(err.response?.data?.detail || "Gagal menyimpan");
    } finally { setSaving(false); }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await itemApi.uploadBatch(formData);
      alert(`Upload berhasil! ${res.data.new_items} item baru, ${res.data.updated_items} item diperbarui.`);
      load();
    } catch (err) {
      alert(err.response?.data?.detail || "Gagal mengupload file Excel");
    } finally {
      setUploading(false);
      e.target.value = null;
    }
  };

  const autoKode = () => {
    if (!form.nama_item) return;
    const kode = form.nama_item.toUpperCase().replace(/[^A-Z0-9]/g, "-").slice(0, 15);
    setForm({ ...form, kode_item: kode });
  };

  const filtered = search ? items.filter(i => i.nama_item?.toLowerCase().includes(search.toLowerCase()) || i.kode_item?.toLowerCase().includes(search.toLowerCase())) : items;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Master Item</h1>
          <p className="page-subtitle">{items.length} item terdaftar</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input type="file" accept=".xlsx" ref={fileInputRef} style={{ display: "none" }} onChange={handleFileUpload} />
          <button className="btn btn-ghost" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? "Mengupload..." : "📄 Upload Batch Excel"}
          </button>
          <button className="btn btn-primary" onClick={openCreate}>+ Tambah Item</button>
        </div>
      </div>

      <div className="card">
        <div className="filter-bar">
          <div className="search-box">
            <span className="search-box-icon">🔍</span>
            <input placeholder="Cari nama atau kode item..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        {loading ? (
          <div className="loading-overlay"><div className="spinner" style={{ width: 32, height: 32 }}></div></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📦</div>
            <div className="empty-state-title">Belum ada item</div>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={openCreate}>+ Tambah Item</button>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr><th>Kode</th><th>Nama Item</th><th>Satuan</th><th>Kategori</th><th>Alias/Sinonim</th><th>Aksi</th></tr>
              </thead>
              <tbody>
                {filtered.map(item => (
                  <tr key={item.id}>
                    <td style={{ fontFamily: "monospace", fontSize: 12, color: "var(--color-primary)" }}>{item.kode_item}</td>
                    <td style={{ fontWeight: 600 }}>{item.nama_item}</td>
                    <td>{item.satuan || "-"}</td>
                    <td>{item.kategori ? <span className="badge badge-draft">{item.kategori}</span> : "-"}</td>
                    <td style={{ fontSize: 12, color: "var(--color-muted)" }}>
                      {item.alias ? item.alias.split(",").map(a => a.trim()).filter(Boolean).join(", ") : "-"}
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(item)}>✏️ Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">{editData ? "Edit Item" : "Tambah Item"}</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-error">{error}</div>}
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Nama Item *</label>
                  <input className="form-control" value={form.nama_item}
                    onChange={e => setForm({ ...form, nama_item: e.target.value })}
                    onBlur={!editData ? autoKode : undefined}
                    placeholder="Tepung Terigu" />
                </div>
                <div className="form-group">
                  <label className="form-label">Kode Item *</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input className="form-control" value={form.kode_item} style={{ fontFamily: "monospace" }}
                      onChange={e => setForm({ ...form, kode_item: e.target.value })} disabled={!!editData} />
                    {!editData && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={autoKode} title="Auto-generate kode">⚡</button>
                    )}
                  </div>
                </div>
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Satuan</label>
                  <select className="form-control" value={form.satuan} onChange={e => setForm({ ...form, satuan: e.target.value })}>
                    <option value="">Pilih satuan</option>
                    {SATUANS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Kategori</label>
                  <select className="form-control" value={form.kategori} onChange={e => setForm({ ...form, kategori: e.target.value })}>
                    <option value="">Pilih kategori</option>
                    {KATEGORIS.map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Alias / Sinonim</label>
                <input className="form-control" value={form.alias}
                  onChange={e => setForm({ ...form, alias: e.target.value })}
                  placeholder="Pisahkan dengan koma: tepung, terigu cakra, flour" />
                <p style={{ fontSize: 11, color: "var(--color-muted)", marginTop: 4 }}>
                  Alias digunakan untuk fuzzy matching saat ekstraksi PDF
                </p>
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

MasterItemPage.title = "Master Item";
MasterItemPage.subtitle = "Database item yang bisa dibeli";
