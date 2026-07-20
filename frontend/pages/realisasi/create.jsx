import { useState, useEffect } from "react";
import { poApi, realisasiApi } from "@/lib/api";
import { formatRupiah, formatDate } from "@/components/Layout";
import { useRouter } from "next/router";
import Link from "next/link";

export default function CreateRealisasi() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [poList, setPoList] = useState([]);
  const [selectedPO, setSelectedPO] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingPO, setLoadingPO] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    po_id: "",
    tanggal_realisasi: new Date().toISOString().slice(0, 10),
    catatan: "",
  });

  // Items: array of { po_detail_id, item_id, nama_item_raw, satuan, qty_po, qty_realisasi, harga_satuan }
  const [items, setItems] = useState([]);
  const [showAddExtraModal, setShowAddExtraModal] = useState(false);
  const [extraForm, setExtraForm] = useState({
    nama_item_raw: "",
    qty_realisasi: "",
    satuan: "pcs",
    harga_satuan: "",
  });

  useEffect(() => {
    try { setUser(JSON.parse(localStorage.getItem("user"))); } catch {}
    // Load PO yang sudah approved (milik dapur user jika akuntan)
    poApi.list({ status: "approved" }).then(r => setPoList(r.data)).catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSelectPO = async (poId) => {
    setForm(prev => ({ ...prev, po_id: poId }));
    if (!poId) { setSelectedPO(null); setItems([]); return; }
    setLoadingPO(true);
    try {
      const res = await poApi.get(poId);
      const po = res.data;
      setSelectedPO(po);
      // Inisialisasi items dari PO details
      setItems(po.details.map(d => ({
        po_detail_id: d.id,
        item_id: d.item_id,
        nama_item_raw: d.nama_item_raw || d.item?.nama_item || "",
        satuan: d.satuan,
        qty_po: parseFloat(d.qty),
        qty_realisasi: parseFloat(d.qty),  // Default: sama dengan PO
        harga_satuan: parseFloat(d.harga_satuan),
      })));
    } catch { setError("Gagal memuat detail PO"); }
    finally { setLoadingPO(false); }
  };

  const handleQtyChange = (idx, val) => {
    setItems(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], qty_realisasi: parseFloat(val) || 0 };
      return updated;
    });
  };

  const handleAddExtraItem = (e) => {
    e.preventDefault();
    if (!extraForm.nama_item_raw || !extraForm.qty_realisasi || !extraForm.harga_satuan) {
      alert("Lengkapi semua field wajib");
      return;
    }
    const newItem = {
      po_detail_id: null,
      item_id: null,
      nama_item_raw: extraForm.nama_item_raw,
      satuan: extraForm.satuan,
      qty_po: 0,
      qty_realisasi: parseFloat(extraForm.qty_realisasi) || 0,
      harga_satuan: parseFloat(extraForm.harga_satuan) || 0,
    };
    setItems(prev => [...prev, newItem]);
    setExtraForm({ nama_item_raw: "", qty_realisasi: "", satuan: "pcs", harga_satuan: "" });
    setShowAddExtraModal(false);
  };

  const handleRemoveExtraItem = (idx) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!form.po_id) { setError("Pilih PO terlebih dahulu"); return; }
    if (items.length === 0) { setError("Tidak ada item"); return; }
    setSaving(true); setError("");
    try {
      const payload = {
        po_id: parseInt(form.po_id),
        tanggal_realisasi: form.tanggal_realisasi,
        catatan: form.catatan,
        details: items.map(it => ({
          po_detail_id: it.po_detail_id,
          item_id: it.item_id,
          nama_item_raw: it.nama_item_raw,
          satuan: it.satuan,
          qty_realisasi: it.qty_realisasi,
          harga_satuan: it.harga_satuan,
        })),
      };
      const res = await realisasiApi.create(payload);
      router.push(`/realisasi/${res.data.id}`);
    } catch (err) {
      setError(err.response?.data?.detail || "Gagal menyimpan realisasi");
      setSaving(false);
    }
  };

  const totalBeli = items.reduce((s, i) => s + i.qty_realisasi * i.harga_satuan, 0);
  const totalJual = totalBeli * 1.15;

  if (loading) return (
    <div className="loading-overlay"><div className="spinner" style={{ width: 32, height: 32 }}></div></div>
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Buat PO Realisasi</h1>
          <p className="page-subtitle">Sesuaikan qty aktual dari PO yang sudah approved</p>
        </div>
        <Link href="/realisasi" className="btn btn-ghost">← Kembali</Link>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Form Header */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title" style={{ marginBottom: 16 }}>📋 Pilih PO Referensi</div>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">PO yang Sudah Approved *</label>
            <select className="form-control" value={form.po_id}
              onChange={e => handleSelectPO(e.target.value)}>
              <option value="">-- Pilih PO --</option>
              {poList.map(po => (
                <option key={po.id} value={po.id}>
                  {po.nomor_po} — {po.dapur?.nama} ({formatDate(po.tanggal_po)})
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Tanggal Realisasi *</label>
            <input type="date" className="form-control" value={form.tanggal_realisasi}
              onChange={e => setForm({ ...form, tanggal_realisasi: e.target.value })} />
          </div>
        </div>
        {form.catatan !== undefined && (
          <div className="form-group">
            <label className="form-label">Catatan</label>
            <input className="form-control" placeholder="Opsional"
              value={form.catatan} onChange={e => setForm({ ...form, catatan: e.target.value })} />
          </div>
        )}
      </div>

      {/* Info PO Terpilih */}
      {selectedPO && (
        <div className="card" style={{ marginBottom: 8, borderLeft: "4px solid var(--color-primary)", padding: "12px 20px" }}>
          <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
            <div><span style={{ color: "var(--color-muted)", fontSize: 12 }}>PO</span><br /><strong>{selectedPO.nomor_po}</strong></div>
            <div><span style={{ color: "var(--color-muted)", fontSize: 12 }}>Dapur</span><br /><strong>{selectedPO.dapur?.nama}</strong></div>
            <div><span style={{ color: "var(--color-muted)", fontSize: 12 }}>Tanggal PO</span><br /><strong>{formatDate(selectedPO.tanggal_po)}</strong></div>
            <div><span style={{ color: "var(--color-muted)", fontSize: 12 }}>Total PO</span><br /><strong className="rupiah">{formatRupiah(selectedPO.total_nilai)}</strong></div>
          </div>
        </div>
      )}

      {/* Tabel Item Realisasi */}
      {loadingPO ? (
        <div className="card" style={{ textAlign: "center", color: "var(--color-muted)", padding: 32 }}>
          ⏳ Memuat detail PO...
        </div>
      ) : items.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div className="card-title">📦 Item Realisasi — Edit Qty Aktual</div>
              <div style={{ fontSize: 12, color: "var(--color-muted)" }}>
                💡 Ubah qty realisasi jika berbeda dari PO asli
              </div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddExtraModal(true)}>
              ➕ Tambah Item Ekstra
            </button>
          </div>

          <div style={{
            background: "linear-gradient(135deg, #fef3c7, #fde68a)",
            borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontSize: 13,
            border: "1px solid #fbbf24",
          }}>
            ⚠️ Qty yang diubah akan menjadi dasar perhitungan invoice. Pastikan sesuai dengan barang yang diterima.
          </div>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>No</th>
                  <th>Item</th>
                  <th>Satuan</th>
                  <th style={{ textAlign: "right" }}>Qty PO</th>
                  <th style={{ textAlign: "right", color: "var(--color-primary)" }}>Qty Realisasi ✏️</th>
                  <th style={{ textAlign: "right" }}>Selisih</th>
                  <th style={{ textAlign: "right" }}>Harga Beli</th>
                  <th style={{ textAlign: "right" }}>Subtotal Jual (×1.15)</th>
                  <th style={{ textAlign: "center" }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const selisih = item.qty_realisasi - item.qty_po;
                  const subtotalJual = item.qty_realisasi * item.harga_satuan * 1.15;
                  return (
                    <tr key={idx} style={{
                      background: selisih !== 0 ? "rgba(245,158,11,0.05)" : undefined
                    }}>
                      <td>{idx + 1}</td>
                      <td style={{ fontWeight: 600 }}>{item.nama_item_raw}</td>
                      <td>{item.satuan}</td>
                      <td style={{ textAlign: "right", color: "var(--color-muted)" }}>{item.qty_po}</td>
                      <td style={{ width: 110 }}>
                        <input
                          type="number" min="0" step="0.001"
                          className="form-control"
                          style={{ textAlign: "right", borderColor: selisih !== 0 ? "#f59e0b" : undefined }}
                          value={item.qty_realisasi}
                          onChange={e => handleQtyChange(idx, e.target.value)}
                        />
                      </td>
                      <td style={{
                        textAlign: "right",
                        color: selisih > 0 ? "var(--color-success)" : selisih < 0 ? "var(--color-danger)" : "var(--color-muted)",
                        fontWeight: selisih !== 0 ? 700 : 400,
                      }}>
                        {selisih > 0 ? "+" : ""}{selisih.toFixed(3)}
                      </td>
                      <td style={{ textAlign: "right" }} className="rupiah">
                        {formatRupiah(item.harga_satuan)}
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 600, color: "var(--color-success)" }} className="rupiah">
                        {formatRupiah(subtotalJual)}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {item.po_detail_id === null ? (
                          <button className="btn btn-ghost btn-sm" style={{ color: "#ef4444", padding: "4px 8px" }} onClick={() => handleRemoveExtraItem(idx)}>
                            🗑️ Hapus
                          </button>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={7} style={{ textAlign: "right", fontWeight: 700, paddingTop: 12 }}>TOTAL</td>
                  <td style={{ textAlign: "right", fontWeight: 700 }} className="rupiah">
                    {formatRupiah(totalBeli)}
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 800, color: "var(--color-success)", fontSize: 15 }} className="rupiah">
                    {formatRupiah(totalJual)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Summary & Save */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--color-border)" }}>
            <div style={{ textAlign: "right", marginRight: 20 }}>
              <div style={{ fontSize: 12, color: "var(--color-muted)" }}>Total Nilai Jual (harga jual ×1.15)</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "var(--color-primary)" }} className="rupiah">
                {formatRupiah(totalJual)}
              </div>
            </div>
            <button className="btn btn-primary" style={{ minWidth: 160 }}
              onClick={handleSave} disabled={saving || items.length === 0}>
              {saving ? "Menyimpan..." : "💾 Simpan Realisasi"}
            </button>
          </div>
        </div>
      )}

      {!selectedPO && (
        <div className="card" style={{ textAlign: "center", padding: 40, color: "var(--color-muted)" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
          <div>Pilih PO yang sudah approved untuk membuat realisasi</div>
        </div>
      )}
      {/* Tambah Item Ekstra Modal */}
      {showAddExtraModal && (
        <div className="modal-overlay" onClick={() => setShowAddExtraModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <div className="modal-title">➕ Tambah Item Ekstra ke Realisasi</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAddExtraModal(false)}>✕</button>
            </div>
            <form onSubmit={handleAddExtraItem}>
              <div className="modal-body">
                <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 12 }}>
                  Item ekstra yang tidak terdaftar di PO asli tetapi dibeli secara riil dan perlu di-reimburse ke relawan.
                </div>
                <div className="form-group">
                  <label className="form-label">Nama Item *</label>
                  <input className="form-control" placeholder="mis: Daun Kelor, Gas Melon..." value={extraForm.nama_item_raw}
                    onChange={e => setExtraForm({ ...extraForm, nama_item_raw: e.target.value })} required />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div className="form-group">
                    <label className="form-label">Qty Realisasi *</label>
                    <input type="number" step="any" className="form-control" placeholder="0" value={extraForm.qty_realisasi}
                      onChange={e => setExtraForm({ ...extraForm, qty_realisasi: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Satuan *</label>
                    <input className="form-control" placeholder="pcs, kg, ikat..." value={extraForm.satuan}
                      onChange={e => setExtraForm({ ...extraForm, satuan: e.target.value })} required />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Harga Satuan Beli (Rp) *</label>
                  <input type="number" className="form-control" placeholder="0" value={extraForm.harga_satuan}
                    onChange={e => setExtraForm({ ...extraForm, harga_satuan: e.target.value })} required />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowAddExtraModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  ➕ Tambah Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

CreateRealisasi.title = "Buat PO Realisasi";
CreateRealisasi.subtitle = "Sesuaikan qty aktual dari PO";
