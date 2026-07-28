import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
import { poApi, invoiceApi, sjApi, hargaApi, jadwalPMApi, configApi } from "@/lib/api";
import { formatRupiah, formatDate, StatusBadge } from "@/components/Layout";
import Link from "next/link";

export default function PODetail() {
  const router = useRouter();
  const { id } = router.query;
  const [po, setPo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [catalog, setCatalog] = useState([]);
  const [user, setUser] = useState(null);
  const [paguInfo, setPaguInfo] = useState(null);
  const [margin, setMargin] = useState(15); // default 15%
  const [belanjaStatus, setBelanjaStatus] = useState({}); // { po_detail_id: { qty_terbeli, qty_sisa, persen_terbeli } }
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showSJModal, setShowSJModal] = useState(false);
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const todayStr = new Date().toISOString().slice(0, 10);
  const defaultJatuhTempoStr = (() => { const d = new Date(); d.setDate(d.getDate() + 3); return d.toISOString().slice(0, 10); })();
  const [invoiceForm, setInvoiceForm] = useState({ tanggal_invoice: todayStr, jatuh_tempo: defaultJatuhTempoStr, catatan: "" });
  const [sjForm, setSJForm] = useState({ tanggal_kirim: new Date().toISOString().slice(0, 10), pengirim: "", penerima: "", catatan: "" });
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [syncing, setSyncing] = useState(false);

  // Edit state per item
  const [editingId, setEditingId] = useState(null);
  const [editQty, setEditQty] = useState("");
  const [editHarga, setEditHarga] = useState("");
  const [editHargaJual, setEditHargaJual] = useState("");

  // Add item state
  const [addMode, setAddMode] = useState("catalog"); // "catalog" | "manual"
  const [addSearch, setAddSearch] = useState("");
  const [addManual, setAddManual] = useState({ nama_item: "", satuan: "pcs", qty: "", harga_satuan: "", harga_jual: "" });
  const [addCatalogItem, setAddCatalogItem] = useState(null);
  const [addQty, setAddQty] = useState("");
  const [addSaving, setAddSaving] = useState(false);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData) setUser(JSON.parse(userData));
  }, []);
  const isAdmin = ["super_admin", "admin"].includes(user?.role);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    poApi.get(id)
      .then(r => {
        setPo(r.data);
        // load pagu after PO is loaded
        if (r.data?.dapur_id && r.data?.tanggal_po) {
          jadwalPMApi.paguCheck(r.data.dapur_id, r.data.tanggal_po)
            .then(p => setPaguInfo(p.data))
            .catch(() => setPaguInfo(null));
        }
        // Load belanja status
        poApi.belanjaStatus(id)
          .then(bs => {
            const map = {};
            bs.data.forEach(b => { map[b.po_detail_id] = b; });
            setBelanjaStatus(map);
          })
          .catch(() => {});
      })
      .catch(() => setError("PO tidak ditemukan"))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Load catalog and margin
  useEffect(() => {
    hargaApi.current().then(r => setCatalog(r.data)).catch(() => {});
    configApi.getMargin().then(m => setMargin(m)).catch(() => {});
  }, []);

  const showSuccess = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 3000);
  };

  const handleApprove = async () => {
    if (!confirm("Approve PO ini?")) return;
    try { await poApi.approve(id); load(); }
    catch (err) { setError(err.response?.data?.detail || "Gagal approve"); }
  };

  const handleDeletePO = async () => {
    if (!confirm("Apakah Anda yakin ingin membatalkan/menghapus PO ini?")) return;
    try {
      await poApi.delete(id);
      router.push("/po");
    } catch (err) {
      setError(err.response?.data?.detail || "Gagal menghapus PO");
    }
  };

  const handleDeleteItem = async (detailId) => {
    if (!confirm("Hapus item ini dari PO?")) return;
    try {
      await poApi.deleteDetail(detailId);
      showSuccess("Item berhasil dihapus");
      load();
    } catch (err) {
      setError(err.response?.data?.detail || "Gagal menghapus item");
    }
  };

  const startEdit = (d) => {
    setEditingId(d.id);
    setEditQty(d.qty);
    setEditHarga(d.harga_satuan);
    setEditHargaJual(d.harga_jual || d.harga_satuan);
  };

  const cancelEdit = () => { setEditingId(null); setEditQty(""); setEditHarga(""); setEditHargaJual(""); };

  const handleSaveEdit = async (detailId) => {
    const qty = parseFloat(editQty);
    const harga = parseFloat(editHarga);
    const hjual = parseFloat(editHargaJual);
    if (isNaN(qty) || qty <= 0) { setError("Qty tidak valid"); return; }
    if (isNaN(harga) || harga < 0) { setError("Harga tidak valid"); return; }
    if (isNaN(hjual) || hjual < 0) { setError("Harga jual tidak valid"); return; }
    try {
      await poApi.updateDetail(detailId, { qty, harga_satuan: harga, harga_jual: hjual });
      cancelEdit();
      showSuccess("Item berhasil diperbarui");
      load();
    } catch (err) {
      setError(err.response?.data?.detail || "Gagal memperbarui item");
    }
  };

  const handleAddFromCatalog = async () => {
    if (!addCatalogItem || !addQty) { setError("Pilih item dan isi qty"); return; }
    setAddSaving(true);
    try {
      await poApi.addDetail(id, {
        item_id: addCatalogItem.item.id,
        qty: parseFloat(addQty),
        harga_satuan: addCatalogItem.harga_beli,
        harga_jual: addCatalogItem.harga_jual,
        satuan: addCatalogItem.item.satuan,
        nama_item_raw: addCatalogItem.item.nama_item,
      });
      setAddCatalogItem(null);
      setAddQty("");
      setAddSearch("");
      setShowAddItemModal(false);
      showSuccess("Item berhasil ditambahkan");
      load();
    } catch (err) {
      setError(err.response?.data?.detail || "Gagal menambah item");
    } finally { setAddSaving(false); }
  };

  const handleAddManual = async () => {
    if (!addManual.nama_item || !addManual.qty || !addManual.harga_satuan || !addManual.harga_jual) {
      setError("Lengkapi semua field item manual termasuk harga jual");
      return;
    }
    setAddSaving(true);
    try {
      await poApi.addDetail(id, {
        item_id: null,
        qty: parseFloat(addManual.qty),
        harga_satuan: parseFloat(addManual.harga_satuan),
        harga_jual: parseFloat(addManual.harga_jual),
        satuan: addManual.satuan,
        nama_item_raw: addManual.nama_item,
      });
      setAddManual({ nama_item: "", satuan: "pcs", qty: "", harga_satuan: "", harga_jual: "" });
      setShowAddItemModal(false);
      showSuccess("Item manual berhasil ditambahkan");
      load();
    } catch (err) {
      setError(err.response?.data?.detail || "Gagal menambah item manual");
    } finally { setAddSaving(false); }
  };

  const handleGenerateInvoice = async () => {
    setActionLoading(true);
    try {
      const payload = { ...invoiceForm, jatuh_tempo: invoiceForm.jatuh_tempo || null };
      const res = await invoiceApi.generate(id, payload);
      setShowInvoiceModal(false);
      router.push(`/invoice/${res.data.id}`);
    } catch (err) {
      setError(err.response?.data?.detail || "Gagal generate invoice");
      setActionLoading(false);
    }
  };

  const handleGenerateSJ = async () => {
    setActionLoading(true);
    try {
      const res = await sjApi.generate(id, sjForm);
      setShowSJModal(false);
      router.push(`/surat-jalan/${res.data.id}`);
    } catch (err) {
      setError(err.response?.data?.detail || "Gagal generate surat jalan");
      setActionLoading(false);
    }
  };

  const filteredCatalog = catalog.filter(h =>
    h.item.nama_item.toLowerCase().includes(addSearch.toLowerCase())
  );

  if (loading) return (
    <div className="loading-overlay"><div className="spinner" style={{ width: 32, height: 32 }}></div></div>
  );

  if (!po) return (
    <div className="card">
      <div className="empty-state">
        <div className="empty-state-icon">❌</div>
        <div className="empty-state-title">PO tidak ditemukan</div>
        <Link href="/po" className="btn btn-primary" style={{ marginTop: 16 }}>← Kembali</Link>
      </div>
    </div>
  );

  const isDraft = po.status === "draft";
  const canEditItems = isDraft || ["approved", "delivered"].includes(po.status);

  // Pagu info display
  const sisaMingguan = paguInfo ? Number(paguInfo.sisa_limit_mingguan) : null;
  const limitMingguan = paguInfo ? Number(paguInfo.limit_mingguan) : null;
  const terpakaiMingguan = paguInfo ? Number(paguInfo.terpakai_mingguan) : null;
  const overMingguan = limitMingguan > 0 && po.total_nilai > (sisaMingguan + po.total_nilai - 0); // simplified: total_nilai vs limit

  const totalHargaBeli = po.details?.reduce((acc, d) => {
    const qty = editingId === d.id ? (parseFloat(editQty) || 0) : Number(d.qty || 0);
    const hbeli = editingId === d.id ? (parseFloat(editHarga) || 0) : Number(d.harga_satuan || 0);
    return acc + (qty * hbeli);
  }, 0) || Number(po.total_nilai || 0);

  const totalHargaJual = po.details?.reduce((acc, d) => {
    const qty = editingId === d.id ? (parseFloat(editQty) || 0) : Number(d.qty || 0);
    const hjual = editingId === d.id
      ? (parseFloat(editHargaJual) || 0)
      : Number(d.harga_jual ?? d.harga_satuan ?? 0);
    return acc + (qty * hjual);
  }, 0) || 0;

  const handleSyncHarga = async () => {
    setSyncing(true);
    try {
      await poApi.syncHarga(id);
      showSuccess("Harga jual berhasil disinkronkan dengan Master Harga!");
      load();
    } catch (err) {
      setError(err.response?.data?.detail || "Gagal menyinkronkan harga jual");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div>
      <style>{`
        .edit-input { padding: 4px 8px; border: 1.5px solid #6366f1; border-radius: 6px; font-size: 13px; width: 80px; }
        .item-row-editing { background: rgba(99,102,241,0.04); }
      `}</style>

      <div className="page-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
            <Link href="/po" style={{ color: "var(--color-muted)", textDecoration: "none", fontSize: 13 }}>
              ← Daftar PO
            </Link>
          </div>
          <h1 className="page-title">{po.nomor_po}</h1>
          <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
            <StatusBadge status={po.status} />
            <span style={{ color: "var(--color-muted)", fontSize: 13 }}>{po.dapur?.nama}</span>
            <span style={{ color: "var(--color-muted)", fontSize: 13 }}>·</span>
            <span style={{ color: "var(--color-muted)", fontSize: 13 }}>{formatDate(po.tanggal_po)}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-outline" onClick={handleSyncHarga} disabled={syncing} title="Sync harga jual sesuai Master Harga terbaru">
            {syncing ? "🔄 Syncing..." : "🔄 Sync Harga Master"}
          </button>
          {isDraft && (
            <>
              <button className="btn btn-primary" onClick={() => { setShowAddItemModal(true); setError(""); }}>
                + Tambah Item
              </button>
              <button className="btn btn-success" onClick={handleApprove}>✓ Approve PO</button>
              <button className="btn btn-ghost" onClick={handleDeletePO} style={{ color: "#dc2626" }}>🗑 Hapus PO</button>
            </>
          )}
          {["approved", "delivered"].includes(po.status) && (
            <button className="btn btn-primary" onClick={() => setShowSJModal(true)}>🚚 Buat Surat Jalan</button>
          )}
          {["approved", "delivered"].includes(po.status) && (
            <button className="btn btn-warning" onClick={() => setShowInvoiceModal(true)}>🧾 Generate Invoice</button>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}<button onClick={() => setError("")} style={{ float: "right", background: "none", border: "none", cursor: "pointer" }}>✕</button></div>}
      {success && <div className="alert alert-success" style={{ marginBottom: 12 }}>{success}</div>}

      {/* Pagu Info */}
      {paguInfo && paguInfo.jadwal_ada && (
        <div className="card" style={{ marginBottom: 16, borderLeft: `4px solid ${paguInfo.over_mingguan ? "#ef4444" : paguInfo.over_harian ? "#f59e0b" : "var(--color-primary)"}` }}>
          <div style={{ display: "flex", gap: 32, flexWrap: "wrap", fontSize: 13 }}>
            <div>
              <div style={{ color: "var(--color-muted)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", marginBottom: 2 }}>Pagu Harian</div>
              <div style={{ fontWeight: 700 }}>{formatRupiah(paguInfo.pagu_harian)}</div>
              <div style={{ color: paguInfo.over_harian ? "#ef4444" : "var(--color-muted)" }}>
                Terpakai: {formatRupiah(paguInfo.terpakai_harian)} · Sisa: {formatRupiah(paguInfo.sisa_pagu_harian)}
                {paguInfo.over_harian && <span style={{ color: "#ef4444", fontWeight: 700 }}> ⚠️ Over</span>}
              </div>
            </div>
            <div>
              <div style={{ color: "var(--color-muted)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", marginBottom: 2 }}>Limit Mingguan</div>
              <div style={{ fontWeight: 700 }}>{formatRupiah(paguInfo.limit_mingguan)}</div>
              <div style={{ color: paguInfo.over_mingguan ? "#ef4444" : "var(--color-muted)" }}>
                Terpakai: {formatRupiah(paguInfo.terpakai_mingguan)} · Sisa: {formatRupiah(paguInfo.sisa_limit_mingguan)}
                {paguInfo.over_mingguan && <span style={{ color: "#ef4444", fontWeight: 700 }}> 🚫 Melebihi Limit</span>}
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>📋 Info PO</div>
          {[
            ["Nomor PO", po.nomor_po],
            ["Dapur", `${po.dapur?.nama} (${po.dapur?.kode})`],
            ["Tanggal PO", formatDate(po.tanggal_po)],
            ["Tanggal Kirim", formatDate(po.tanggal_kirim) || "-"],
            ["PDF Asli", po.pdf_path || "-"],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", marginBottom: 10, fontSize: 13 }}>
              <span style={{ color: "var(--color-muted)", width: 130, flexShrink: 0 }}>{k}</span>
              <span style={{ fontWeight: 600 }}>{v}</span>
            </div>
          ))}
          {po.catatan && (
            <div style={{ marginTop: 8, padding: 10, background: "#f8fafc", borderRadius: 8, fontSize: 13 }}>
              <strong>Catatan:</strong> {po.catatan}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>💰 Ringkasan Nilai</div>
          {isAdmin && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--color-border)" }}>
              <span style={{ color: "var(--color-muted)", fontSize: 13 }}>Total Harga Beli</span>
              <span style={{ fontWeight: 700, fontSize: 18 }} className="rupiah">{formatRupiah(totalHargaBeli)}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: isAdmin ? "1px solid var(--color-border)" : "none" }}>
            <span style={{ color: "var(--color-muted)", fontSize: 13 }}>
              {isAdmin ? "Total Harga Jual" : "Total Harga"}
            </span>
            <span style={{ fontWeight: 700, fontSize: 18, color: "var(--color-success)" }} className="rupiah">
              {formatRupiah(totalHargaJual)}
            </span>
          </div>
          {isAdmin && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0" }}>
              <span style={{ color: "var(--color-muted)", fontSize: 13 }}>Estimasi Keuntungan</span>
              <span style={{ fontWeight: 700, fontSize: 18, color: "var(--color-primary)" }} className="rupiah">
                {formatRupiah(estimasiKeuntungan)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Detail Items */}
      <div className="card">
        <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="card-title">📦 Item PO ({po.details?.length || 0} item)</div>
          {isDraft && (
            <button className="btn btn-primary btn-sm" onClick={() => { setShowAddItemModal(true); setError(""); }}>
              + Tambah Item
            </button>
          )}
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>No</th>
                <th>Nama Item</th>
                <th>Master Item</th>
                <th style={{ textAlign: "right" }}>Qty PO</th>
                <th>Satuan</th>
                {isAdmin && <th style={{ textAlign: "right" }}>Harga Beli</th>}
                <th style={{ textAlign: "right" }}>
                  {isAdmin ? "Harga Jual" : "Harga"}
                </th>
                <th style={{ textAlign: "right" }}>Subtotal</th>
                <th>Terbeli</th>
                {canEditItems && <th style={{ textAlign: "center" }}>Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {po.details?.map((d, i) => {
                const isEditing = editingId === d.id;
                const hjual = isEditing ? parseFloat(editHargaJual) : (d.harga_jual || d.harga_satuan);
                const subtotal = isEditing
                  ? (parseFloat(editQty) || 0) * (parseFloat(editHarga) || 0)
                  : d.subtotal;
                return (
                  <tr key={d.id} className={isEditing ? "item-row-editing" : ""}>
                    <td>{i + 1}</td>
                    <td><strong>{d.nama_item_raw || d.item?.nama_item}</strong></td>
                    <td>
                      {d.item ? (
                        <span style={{ color: "var(--color-success)", fontSize: 12 }}>✓ {d.item.nama_item}</span>
                      ) : (
                        <span className="badge badge-warning">Belum dimap</span>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {isEditing ? (
                        <input className="edit-input" type="number" min="0.01" step="0.01"
                          value={editQty} onChange={e => setEditQty(e.target.value)} />
                      ) : d.qty}
                    </td>
                    <td>{d.satuan || "-"}</td>
                    {isAdmin && (
                      <td style={{ textAlign: "right" }} className="rupiah">
                        {isEditing ? (
                          <input className="edit-input" type="number" min="0" step="1"
                            value={editHarga} onChange={e => setEditHarga(e.target.value)} />
                        ) : formatRupiah(d.harga_satuan)}
                      </td>
                    )}
                    <td style={{ textAlign: "right", color: "var(--color-success)" }} className="rupiah">
                      {isEditing ? (
                        <input className="edit-input" type="number" min="0" step="1"
                          value={editHargaJual} onChange={e => setEditHargaJual(e.target.value)} />
                      ) : formatRupiah(isNaN(hjual) ? 0 : hjual)}
                    </td>
                    <td style={{ textAlign: "right" }} className="rupiah">{formatRupiah(isNaN(subtotal) ? 0 : subtotal)}</td>
                    <td style={{ minWidth: 100 }}>
                      {(() => {
                        const bs = belanjaStatus[d.id];
                        if (!bs) return <span style={{ fontSize: 11, color: "#94a3b8" }}>—</span>;
                        const pct = Math.min(bs.persen_terbeli, 100);
                        const color = pct >= 100 ? "#22c55e" : pct > 0 ? "#f59e0b" : "#e2e8f0";
                        return (
                          <div style={{ minWidth: 90 }}>
                            <div style={{ height: 6, background: "#e2e8f0", borderRadius: 99, overflow: "hidden", marginBottom: 2 }}>
                              <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 99, transition: "width 0.3s" }} />
                            </div>
                            <div style={{ fontSize: 10, color: pct >= 100 ? "#059669" : "#92400e" }}>
                              {bs.qty_terbeli}/{bs.qty_po} {d.satuan}
                            </div>
                          </div>
                        );
                      })()}
                    </td>
                    {canEditItems && (
                      <td style={{ textAlign: "center" }}>
                        {isEditing ? (
                          <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                            <button className="btn btn-success btn-sm" style={{ padding: "3px 10px", fontSize: 12 }}
                              onClick={() => handleSaveEdit(d.id)}>✓ Simpan</button>
                            <button className="btn btn-ghost btn-sm" style={{ padding: "3px 8px", fontSize: 12 }}
                              onClick={cancelEdit}>✕</button>
                          </div>
                        ) : (
                          <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                            <button className="btn btn-ghost btn-sm" style={{ padding: "3px 8px", fontSize: 12 }}
                              onClick={() => startEdit(d)}>✏️ Edit</button>
                            {isDraft && (
                              <button className="btn btn-ghost btn-sm" style={{ color: "#dc2626", padding: "3px 8px", fontSize: 12 }}
                                onClick={() => handleDeleteItem(d.id)}>🗑</button>
                            )}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={isDraft ? 7 : 7} style={{ textAlign: "right", fontWeight: 700, paddingTop: 12 }}>TOTAL BELI</td>
                <td style={{ textAlign: "right", fontWeight: 800, fontSize: 15 }} className="rupiah">{formatRupiah(po.total_nilai)}</td>
                {isDraft && <td></td>}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Modal Tambah Item */}
      {showAddItemModal && (
        <div className="modal-overlay" onClick={() => setShowAddItemModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <div className="modal-title">+ Tambah Item ke PO</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAddItemModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {/* Tab */}
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <button className={`btn ${addMode === "catalog" ? "btn-primary" : "btn-ghost"} btn-sm`}
                  onClick={() => setAddMode("catalog")}>📋 Dari Katalog</button>
                <button className={`btn ${addMode === "manual" ? "btn-primary" : "btn-ghost"} btn-sm`}
                  onClick={() => setAddMode("manual")}>✏️ Item Manual</button>
              </div>

              {addMode === "catalog" ? (
                <div>
                  <input className="form-control" placeholder="🔍 Cari item..." style={{ marginBottom: 10 }}
                    value={addSearch} onChange={e => setAddSearch(e.target.value)} />
                  <div style={{ maxHeight: 240, overflowY: "auto", border: "1px solid var(--color-border)", borderRadius: 8 }}>
                    {filteredCatalog.slice(0, 30).map(h => (
                      <div key={h.id} onClick={() => setAddCatalogItem(h)}
                        style={{
                          padding: "8px 12px", cursor: "pointer", fontSize: 13,
                          background: addCatalogItem?.id === h.id ? "rgba(99,102,241,0.1)" : "transparent",
                          borderBottom: "1px solid var(--color-border)",
                          display: "flex", justifyContent: "space-between", alignItems: "center"
                        }}>
                        <div>
                          <div style={{ fontWeight: 600 }}>{h.item.nama_item}</div>
                          <div style={{ color: "var(--color-muted)", fontSize: 11 }}>{h.item.satuan} · {h.item.kategori}</div>
                        </div>
                        <div style={{ fontWeight: 700, color: "var(--color-primary)" }}>{formatRupiah(h.harga_beli)}</div>
                      </div>
                    ))}
                    {filteredCatalog.length === 0 && (
                      <div style={{ padding: 20, textAlign: "center", color: "var(--color-muted)" }}>Item tidak ditemukan</div>
                    )}
                  </div>
                  {addCatalogItem && (
                    <div style={{ marginTop: 12, padding: "10px 12px", background: "rgba(99,102,241,0.06)", borderRadius: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                        {addCatalogItem.item.nama_item} — {formatRupiah(addCatalogItem.harga_beli)}/{addCatalogItem.item.satuan}
                      </div>
                      <input className="form-control" type="number" min="0.01" step="0.01"
                        placeholder={`Qty (${addCatalogItem.item.satuan})`}
                        value={addQty} onChange={e => setAddQty(e.target.value)} />
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <input className="form-control" placeholder="Nama Item *"
                    value={addManual.nama_item} onChange={e => setAddManual({ ...addManual, nama_item: e.target.value })} />
                  <div style={{ display: "flex", gap: 10 }}>
                    <input type="number" className="form-control" placeholder="Qty *" style={{ flex: 1 }}
                      value={addManual.qty} onChange={e => setAddManual({ ...addManual, qty: e.target.value })} />
                    <input className="form-control" placeholder="Satuan" style={{ flex: 1 }}
                      value={addManual.satuan} onChange={e => setAddManual({ ...addManual, satuan: e.target.value })} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label className="form-label" style={{ fontSize: 12 }}>Harga Beli (Rp) *</label>
                      <input className="form-control" type="number" min="0" step="1" placeholder="Rp"
                        value={addManual.harga_satuan} onChange={e => setAddManual({ ...addManual, harga_satuan: e.target.value })} />
                    </div>
                    <div>
                      <label className="form-label" style={{ fontSize: 12 }}>Harga Jual (Rp) *</label>
                      <input className="form-control" type="number" min="0" step="1" placeholder="Rp"
                        value={addManual.harga_jual} onChange={e => setAddManual({ ...addManual, harga_jual: e.target.value })} />
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--color-muted)", marginTop: 8 }}>*Item manual akan otomatis ditambahkan ke Master Item.</div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowAddItemModal(false)}>Batal</button>
              <button className="btn btn-primary" disabled={addSaving}
                onClick={addMode === "catalog" ? handleAddFromCatalog : handleAddManual}>
                {addSaving ? <span className="spinner"></span> : "+ Tambah ke PO"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Modal */}
      {showInvoiceModal && (
        <div className="modal-overlay" onClick={() => setShowInvoiceModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">🧾 Generate Invoice</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowInvoiceModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Tanggal Invoice *</label>
                <input className="form-control" type="date" value={invoiceForm.tanggal_invoice}
                  onChange={e => setInvoiceForm({ ...invoiceForm, tanggal_invoice: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Jatuh Tempo (kosong = +14 hari)</label>
                <input className="form-control" type="date" value={invoiceForm.jatuh_tempo}
                  onChange={e => setInvoiceForm({ ...invoiceForm, jatuh_tempo: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Catatan</label>
                <textarea className="form-control" rows={3} value={invoiceForm.catatan}
                  onChange={e => setInvoiceForm({ ...invoiceForm, catatan: e.target.value })} />
              </div>
              <div className="alert alert-info">
                💡 Harga jual pada invoice menggunakan harga jual yang ada di kolom tabel Draft PO.
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowInvoiceModal(false)}>Batal</button>
              <button className="btn btn-warning" onClick={handleGenerateInvoice} disabled={actionLoading}>
                {actionLoading ? <span className="spinner"></span> : "🧾 Generate Invoice"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SJ Modal */}
      {showSJModal && (
        <div className="modal-overlay" onClick={() => setShowSJModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">🚚 Buat Surat Jalan</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowSJModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Tanggal Kirim *</label>
                <input className="form-control" type="date" value={sjForm.tanggal_kirim}
                  onChange={e => setSJForm({ ...sjForm, tanggal_kirim: e.target.value })} />
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Pengirim</label>
                  <input className="form-control" placeholder="Nama pengirim" value={sjForm.pengirim}
                    onChange={e => setSJForm({ ...sjForm, pengirim: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Penerima</label>
                  <input className="form-control" placeholder="Nama penerima" value={sjForm.penerima}
                    onChange={e => setSJForm({ ...sjForm, penerima: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowSJModal(false)}>Batal</button>
              <button className="btn btn-primary" onClick={handleGenerateSJ} disabled={actionLoading}>
                {actionLoading ? <span className="spinner"></span> : "🚚 Buat Surat Jalan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

PODetail.title = "Detail PO";
