import { useEffect, useState } from "react";
import { hargaApi, itemApi, configApi } from "@/lib/api";
import { formatRupiah, formatDate } from "@/components/Layout";

export default function MasterHargaPage() {
  const [harga, setHarga] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ item_id: "", harga_beli: "", supplier: "", berlaku_dari: new Date().toISOString().slice(0, 10) });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Inline editing state
  const [editingId, setEditingId] = useState(null);
  const [editHargaBeli, setEditHargaBeli] = useState("");
  const [editSupplier, setEditSupplier] = useState("");
  const [editBerlakuDari, setEditBerlakuDari] = useState("");
  const [margin, setMargin] = useState(15);
  const [updating, setUpdating] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([hargaApi.current(), itemApi.list(), configApi.getMargin().catch(() => 15)])
      .then(([h, i, m]) => { 
        setHarga(h.data); 
        setItems(i.data); 
        setMargin(m);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!form.item_id || !form.harga_beli) { setError("Item dan harga beli wajib diisi"); return; }
    setSaving(true); setError("");
    try {
      await hargaApi.create({
        item_id: parseInt(form.item_id),
        harga_beli: parseFloat(form.harga_beli),
        supplier: form.supplier,
        berlaku_dari: form.berlaku_dari,
      });
      setSuccess("✅ Harga berhasil diupdate! Harga jual otomatis dihitung.");
      setShowModal(false);
      setForm({ item_id: "", harga_beli: "", supplier: "", berlaku_dari: new Date().toISOString().slice(0, 10) });
      load();
    } catch (err) {
      setError(err.response?.data?.detail || "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (h) => {
    setEditingId(h.id);
    setEditHargaBeli(h.harga_beli);
    setEditSupplier(h.supplier || "");
    setEditBerlakuDari(h.berlaku_dari);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditHargaBeli("");
    setEditSupplier("");
    setEditBerlakuDari("");
  };

  const handleUpdate = async (id) => {
    if (!editHargaBeli || parseFloat(editHargaBeli) <= 0) { 
      setError("Harga beli tidak valid"); 
      return; 
    }
    setUpdating(true); setError(""); setSuccess("");
    try {
      await hargaApi.update(id, {
        harga_beli: parseFloat(editHargaBeli),
        supplier: editSupplier,
        berlaku_dari: editBerlakuDari,
      });
      setSuccess("✅ Harga berhasil diupdate! Harga jual dihitung ulang.");
      setEditingId(null);
      load();
    } catch (err) {
      setError(err.response?.data?.detail || "Gagal mengupdate harga");
    } finally {
      setUpdating(false);
    }
  };

  const filtered = search
    ? harga.filter(h => h.item?.nama_item?.toLowerCase().includes(search.toLowerCase()) || h.supplier?.toLowerCase().includes(search.toLowerCase()))
    : harga;

  const selectedItem = items.find(i => i.id === parseInt(form.item_id));
  const estimasiJual = form.harga_beli ? (parseFloat(form.harga_beli) * (1 + margin / 100)).toFixed(0) : 0;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Master Harga</h1>
          <p className="page-subtitle">Harga beli & jual (margin {margin}%) per item</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Update Harga</button>
      </div>

      {success && <div className="alert alert-success">{success}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {/* Kalkulasi info */}
      <div className="card" style={{ marginBottom: 20, background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)", border: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ fontSize: 36 }}>💡</div>
          <div>
            <div style={{ color: "white", fontWeight: 700, fontSize: 16 }}>Formula Harga Jual</div>
            <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 14, marginTop: 4 }}>
              <strong style={{ color: "white" }}>Harga Jual = Harga Beli × {(1 + margin/100).toFixed(2)}</strong>
              {" "}· Margin tetap {margin}% dari harga beli · Contoh: Rp 10.000 → Rp {formatRupiah(10000 * (1 + margin/100)).replace("Rp ", "")}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="filter-bar">
          <div className="search-box">
            <span className="search-box-icon">🔍</span>
            <input placeholder="Cari item atau supplier..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        {loading ? (
          <div className="loading-overlay"><div className="spinner" style={{ width: 32, height: 32 }}></div></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">💰</div>
            <div className="empty-state-title">Belum ada data harga</div>
            <div className="empty-state-sub">Klik "Update Harga" untuk menambahkan harga item</div>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Kategori</th>
                  <th>Supplier</th>
                  <th style={{ textAlign: "right" }}>Harga Beli</th>
                  <th style={{ textAlign: "right" }}>Harga Jual (×{(1 + margin/100).toFixed(2)})</th>
                  <th style={{ textAlign: "right" }}>Keuntungan</th>
                  <th>Berlaku Dari</th>
                  <th style={{ textAlign: "center" }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(h => {
                  const isEditing = editingId === h.id;
                  const hargaBeliNum = isEditing ? (parseFloat(editHargaBeli) || 0) : parseFloat(h.harga_beli);
                  const estimasiJualNum = isEditing ? (hargaBeliNum * (1 + margin / 100)) : parseFloat(h.harga_jual);
                  const keuntungan = estimasiJualNum - hargaBeliNum;

                  return (
                    <tr key={h.id} style={{ background: isEditing ? "rgba(99,102,241,0.04)" : "none" }}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{h.item?.nama_item}</div>
                        <div style={{ fontSize: 11, color: "var(--color-muted)" }}>{h.item?.satuan}</div>
                      </td>
                      <td><span className="badge badge-draft">{h.item?.kategori || "-"}</span></td>
                      <td>
                        {isEditing ? (
                          <input 
                            className="form-control" 
                            style={{ width: "140px", padding: "6px 8px", fontSize: "13px" }}
                            value={editSupplier} 
                            onChange={e => setEditSupplier(e.target.value)} 
                          />
                        ) : (
                          h.supplier || "-"
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {isEditing ? (
                          <input 
                            type="number" 
                            className="form-control" 
                            style={{ width: "100px", display: "inline-block", padding: "6px 8px", fontSize: "13px", textAlign: "right" }}
                            value={editHargaBeli} 
                            onChange={e => setEditHargaBeli(e.target.value)} 
                          />
                        ) : (
                          <span className="rupiah">{formatRupiah(h.harga_beli)}</span>
                        )}
                      </td>
                      <td style={{ textAlign: "right", color: "var(--color-success)" }} className="rupiah">
                        {formatRupiah(estimasiJualNum)}
                      </td>
                      <td style={{ textAlign: "right", color: "var(--color-primary)" }}>
                        <span className="rupiah">{formatRupiah(keuntungan)}</span>
                        <div style={{ fontSize: 10, color: "var(--color-muted)" }}>
                          {isEditing ? `${margin}%` : `${h.margin_persen}%`}
                        </div>
                      </td>
                      <td>
                        {isEditing ? (
                          <input 
                            type="date" 
                            className="form-control" 
                            style={{ width: "140px", padding: "6px 8px", fontSize: "13px" }}
                            value={editBerlakuDari} 
                            onChange={e => setEditBerlakuDari(e.target.value)} 
                          />
                        ) : (
                          formatDate(h.berlaku_dari)
                        )}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {isEditing ? (
                          <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                            <button className="btn btn-success btn-sm" onClick={() => handleUpdate(h.id)} disabled={updating}>✓</button>
                            <button className="btn btn-ghost btn-sm" onClick={cancelEdit}>✕</button>
                          </div>
                        ) : (
                          <button className="btn btn-ghost btn-sm" onClick={() => startEdit(h)}>✏️ Edit</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Update Harga Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">💰 Update Harga Item</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-error">{error}</div>}
              <div className="form-group">
                <label className="form-label">Item *</label>
                <select className="form-control" value={form.item_id}
                  onChange={e => setForm({ ...form, item_id: e.target.value })}>
                  <option value="">-- Pilih Item --</option>
                  {items.map(i => <option key={i.id} value={i.id}>{i.nama_item} ({i.satuan})</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Harga Beli (Rp) *</label>
                <input className="form-control" type="number" placeholder="Contoh: 10000"
                  value={form.harga_beli} onChange={e => setForm({ ...form, harga_beli: e.target.value })} />
              </div>

              {/* Preview kalkulasi */}
              {form.harga_beli && (
                <div style={{ background: "#f8fafc", borderRadius: 8, padding: 14, marginBottom: 16, fontSize: 13 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8, color: "var(--color-text)" }}>Preview Kalkulasi:</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                    <div style={{ textAlign: "center", padding: "8px", background: "white", borderRadius: 6 }}>
                      <div style={{ color: "var(--color-muted)", fontSize: 11 }}>Harga Beli</div>
                      <div style={{ fontWeight: 700 }}>{formatRupiah(form.harga_beli)}</div>
                    </div>
                    <div style={{ textAlign: "center", padding: "8px", background: "white", borderRadius: 6 }}>
                      <div style={{ color: "var(--color-muted)", fontSize: 11 }}>Harga Jual (×{(1 + margin/100).toFixed(2)})</div>
                      <div style={{ fontWeight: 700, color: "var(--color-success)" }}>{formatRupiah(estimasiJual)}</div>
                    </div>
                    <div style={{ textAlign: "center", padding: "8px", background: "white", borderRadius: 6 }}>
                      <div style={{ color: "var(--color-muted)", fontSize: 11 }}>Keuntungan</div>
                      <div style={{ fontWeight: 700, color: "var(--color-primary)" }}>
                        {formatRupiah(estimasiJual - parseFloat(form.harga_beli || 0))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Supplier</label>
                  <input className="form-control" placeholder="Nama supplier" value={form.supplier}
                    onChange={e => setForm({ ...form, supplier: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Berlaku Dari *</label>
                  <input className="form-control" type="date" value={form.berlaku_dari}
                    onChange={e => setForm({ ...form, berlaku_dari: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Batal</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? <span className="spinner"></span> : "💾 Simpan Harga"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

MasterHargaPage.title = "Master Harga";
MasterHargaPage.subtitle = "Kelola harga beli & jual item";

