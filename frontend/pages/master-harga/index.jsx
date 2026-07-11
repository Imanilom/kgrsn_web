import { useEffect, useState } from "react";
import { hargaApi, itemApi } from "@/lib/api";
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

  const load = () => {
    setLoading(true);
    Promise.all([hargaApi.current(), itemApi.list()])
      .then(([h, i]) => { setHarga(h.data); setItems(i.data); })
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

  const filtered = search
    ? harga.filter(h => h.item?.nama_item?.toLowerCase().includes(search.toLowerCase()) || h.supplier?.toLowerCase().includes(search.toLowerCase()))
    : harga;

  const selectedItem = items.find(i => i.id === parseInt(form.item_id));
  const estimasiJual = form.harga_beli ? (parseFloat(form.harga_beli) * 1.15).toFixed(0) : 0;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Master Harga</h1>
          <p className="page-subtitle">Harga beli & jual (margin 15%) per item</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Update Harga</button>
      </div>

      {success && <div className="alert alert-success">{success}</div>}

      {/* Kalkulasi info */}
      <div className="card" style={{ marginBottom: 20, background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)", border: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ fontSize: 36 }}>💡</div>
          <div>
            <div style={{ color: "white", fontWeight: 700, fontSize: 16 }}>Formula Harga Jual</div>
            <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 14, marginTop: 4 }}>
              <strong style={{ color: "white" }}>Harga Jual = Harga Beli × 1.15</strong>
              {" "}· Margin tetap 15% dari harga beli · Contoh: Rp 10.000 → Rp 11.500 (untung Rp 1.500)
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
                  <th style={{ textAlign: "right" }}>Harga Jual (×1.15)</th>
                  <th style={{ textAlign: "right" }}>Keuntungan</th>
                  <th>Berlaku Dari</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(h => {
                  const keuntungan = parseFloat(h.harga_jual) - parseFloat(h.harga_beli);
                  return (
                    <tr key={h.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{h.item?.nama_item}</div>
                        <div style={{ fontSize: 11, color: "var(--color-muted)" }}>{h.item?.satuan}</div>
                      </td>
                      <td><span className="badge badge-draft">{h.item?.kategori || "-"}</span></td>
                      <td>{h.supplier || "-"}</td>
                      <td style={{ textAlign: "right" }} className="rupiah">{formatRupiah(h.harga_beli)}</td>
                      <td style={{ textAlign: "right", color: "var(--color-success)" }} className="rupiah">
                        {formatRupiah(h.harga_jual)}
                      </td>
                      <td style={{ textAlign: "right", color: "var(--color-primary)" }} className="rupiah">
                        {formatRupiah(keuntungan)}
                        <div style={{ fontSize: 10, color: "var(--color-muted)" }}>{h.margin_persen}%</div>
                      </td>
                      <td>{formatDate(h.berlaku_dari)}</td>
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
                      <div style={{ color: "var(--color-muted)", fontSize: 11 }}>Harga Jual (×1.15)</div>
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
