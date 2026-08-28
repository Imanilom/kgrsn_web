import { useEffect, useState, useMemo, memo } from "react";
import { invoiceApi, jadwalPMApi } from "@/lib/api";
import { formatRupiah, formatDate } from "@/components/Layout";
import { useRouter } from "next/router";
import Link from "next/link";

export default function InvoiceDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [invoice, setInvoice] = useState(null);
  const [paguInfo, setPaguInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [marking, setMarking] = useState(false);
  const [user, setUser] = useState(null);
  const [editingDate, setEditingDate] = useState(false);
  const [editTanggalInvoice, setEditTanggalInvoice] = useState("");
  const [editJatuhTempo, setEditJatuhTempo] = useState("");

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData) setUser(JSON.parse(userData));
  }, []);
  const isAdmin = ["super_admin", "admin"].includes(user?.role);

  const fetchPagu = (inv) => {
    if (inv?.dapur_id && inv?.tanggal_invoice) {
      jadwalPMApi.paguCheck(inv.dapur_id, inv.tanggal_invoice)
        .then(pRes => setPaguInfo(pRes.data))
        .catch(() => setPaguInfo(null));
    }
  };

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    invoiceApi.get(id)
      .then(res => {
        setInvoice(res.data);
        if (res.data?.dapur_id && res.data?.tanggal_invoice) {
          jadwalPMApi.paguCheck(res.data.dapur_id, res.data.tanggal_invoice)
            .then(pRes => setPaguInfo(pRes.data))
            .catch(() => setPaguInfo(null))
            .finally(() => setLoading(false));
        } else {
          setLoading(false);
        }
      })
      .catch(err => {
        setError(err.response?.data?.detail || "Gagal memuat invoice");
        setLoading(false);
      });
  }, [id]);

  const handleMarkPaid = async () => {
    if (!confirm("Tandai invoice ini sebagai LUNAS?")) return;
    setMarking(true);
    try {
      const res = await invoiceApi.markPaid(id);
      setInvoice(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Gagal mengupdate status");
    } finally {
      setMarking(false);
    }
  };

  const handleDownload = async () => {
    try {
      const res = await invoiceApi.download(id);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${invoice.nomor_invoice}.pdf`);
      document.body.appendChild(link);
      link.click();
    } catch (err) {
      alert("Gagal mendownload invoice");
    }
  };

  const handleSaveDate = async () => {
    try {
      const payload = { 
        tanggal_invoice: editTanggalInvoice || undefined, 
        jatuh_tempo: editJatuhTempo || undefined 
      };
      const res = await invoiceApi.update(id, payload);
      setInvoice(res.data);
      fetchPagu(res.data);
      setEditingDate(false);
    } catch (err) {
      alert(err.response?.data?.detail || "Gagal mengupdate tanggal invoice");
    }
  };

  const [editingDetailId, setEditingDetailId] = useState(null);
  const [editHargaJual, setEditHargaJual] = useState("");
  const [editHargaBeli, setEditHargaBeli] = useState("");
  const [editQty, setEditQty] = useState("");
  const [editSatuan, setEditSatuan] = useState("");
  const [savingDetail, setSavingDetail] = useState(false);

  // Add Item State
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [addManual, setAddManual] = useState({ nama_item: "", satuan: "pcs", qty: "", harga_beli: "", harga_jual: "" });
  const [addSaving, setAddSaving] = useState(false);

  const startEditDetail = (d) => {
    setEditingDetailId(d.id);
    setEditHargaJual(d.harga_jual);
    setEditHargaBeli(d.harga_beli);
    setEditQty(d.qty_realisasi != null ? d.qty_realisasi : d.qty);
    setEditSatuan(d.satuan || "");
  };

  const cancelEditDetail = () => {
    setEditingDetailId(null);
    setEditHargaJual("");
    setEditHargaBeli("");
    setEditQty("");
    setEditSatuan("");
  };

  const handleSaveDetail = async (detailId) => {
    const hjual = parseFloat(editHargaJual);
    const hbeli = parseFloat(editHargaBeli);
    const qtyVal = parseFloat(editQty);
    if (isNaN(hjual) || hjual < 0 || isNaN(hbeli) || hbeli < 0 || isNaN(qtyVal) || qtyVal <= 0) {
      alert("Harga jual, harga beli, atau Qty tidak valid");
      return;
    }
    setSavingDetail(true);
    try {
      const res = await invoiceApi.updateDetail(detailId, { harga_jual: hjual, harga_beli: hbeli, qty: qtyVal, satuan: editSatuan });
      setInvoice(res.data);
      fetchPagu(res.data);
      cancelEditDetail();
    } catch (err) {
      alert(err.response?.data?.detail || "Gagal mengupdate item invoice");
    } finally {
      setSavingDetail(false);
    }
  };
  const handleDeleteDetail = async (detailId) => {
    if (!confirm("Hapus item ini dari invoice?")) return;
    try {
      const res = await invoiceApi.deleteDetail(detailId);
      // Backend mengupdate total, kita fetch ulang data invoice penuh
      const data = await invoiceApi.get(id);
      setInvoice(data.data);
      fetchPagu(data.data);
    } catch (err) {
      alert(err.response?.data?.detail || "Gagal menghapus item dari invoice");
    }
  };

  const handleAddManual = async () => {
    if (!addManual.nama_item || !addManual.qty || !addManual.harga_beli || !addManual.harga_jual) {
      alert("Lengkapi semua field item (nama, qty, harga beli, harga jual)");
      return;
    }
    setAddSaving(true);
    try {
      const payload = {
        nama_item: addManual.nama_item,
        qty: parseFloat(addManual.qty),
        qty_po: parseFloat(addManual.qty),
        satuan: addManual.satuan,
        harga_beli: parseFloat(addManual.harga_beli),
        harga_jual: parseFloat(addManual.harga_jual),
      };
      const res = await invoiceApi.addDetail(id, payload);
      setInvoice(res.data);
      fetchPagu(res.data);
      setAddManual({ nama_item: "", satuan: "pcs", qty: "", harga_beli: "", harga_jual: "" });
      setShowAddItemModal(false);
    } catch (err) {
      alert(err.response?.data?.detail || "Gagal menambah item ke invoice");
    } finally {
      setAddSaving(false);
    }
  };

  const { totalBeli, totalJual, marginTotal, marginPct } = useMemo(() => {
    let tBeli = 0, tJual = 0;
    (invoice?.details || []).forEach(d => {
      tBeli += parseFloat(d.qty || 0) * parseFloat(d.harga_beli || 0);
      tJual += parseFloat(d.qty || 0) * parseFloat(d.harga_jual || 0);
    });
    const mTotal = tJual - tBeli;
    const mPct = tBeli > 0 ? (mTotal / tBeli * 100).toFixed(1) : 0;
    return { totalBeli: tBeli, totalJual: tJual, marginTotal: mTotal, marginPct: mPct };
  }, [invoice?.details]);

  if (loading) return <div className="page-container"><div className="spinner" style={{ margin: "40px auto" }}></div></div>;
  if (error) return <div className="page-container"><div className="alert alert-error">{error}</div></div>;
  if (!invoice) return <div className="page-container"><div className="alert alert-warning">Invoice tidak ditemukan</div></div>;

  const statusColor = {
    unpaid: "#f59e0b",
    paid: "#10b981",
    cancelled: "#ef4444",
  };

  const getMarginColor = (pct) => {
    const n = parseFloat(pct);
    if (n >= 15) return "#10b981";
    if (n >= 10) return "#f59e0b";
    return "#ef4444";
  };

  // Analisis Pagu Harian
  const paguHarian = paguInfo ? parseFloat(paguInfo.pagu_harian || 0) : 0;
  const totalInvoice = invoice ? parseFloat(invoice.total || 0) : 0;
  const selisih = totalInvoice - paguHarian;
  const isOverPagu = paguHarian > 0 && totalInvoice > paguHarian;
  const selisihNominal = Math.abs(selisih);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{invoice.nomor_invoice}</h1>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 4 }}>
            {!editingDate ? (
              <>
                <p className="page-subtitle" style={{ margin: 0 }}>Tanggal: {formatDate(invoice.tanggal_invoice)}</p>
                {isAdmin && <button className="btn btn-ghost" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => {
                  setEditTanggalInvoice(invoice.tanggal_invoice);
                  setEditJatuhTempo(invoice.jatuh_tempo || "");
                  setEditingDate(true);
                }}>✏️ Edit Tanggal</button>}
              </>
            ) : (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="date" className="form-control" style={{ padding: "4px 8px", width: 140 }} value={editTanggalInvoice} onChange={e => setEditTanggalInvoice(e.target.value)} />
                <button className="btn btn-success" style={{ padding: "4px 8px", fontSize: 12 }} onClick={handleSaveDate}>Simpan</button>
                <button className="btn btn-ghost" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => setEditingDate(false)}>Batal</button>
              </div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/invoice" className="btn btn-ghost">← Kembali</Link>
          <button onClick={handleDownload} className="btn btn-primary" style={{ gap: 6 }}>
            📥 Download PDF
          </button>
        </div>
      </div>

      {/* Status & Total Card */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 4 }}>Status</div>
            <div style={{
              display: "inline-block",
              padding: "6px 12px",
              background: statusColor[invoice.status] + "20",
              color: statusColor[invoice.status],
              borderRadius: 6,
              fontWeight: 600,
              fontSize: 13,
              textTransform: "uppercase",
              letterSpacing: "0.05em"
            }}>
              {invoice.status === "unpaid" ? "⏳ Belum Lunas" : invoice.status === "paid" ? "✅ Lunas" : "❌ Batal"}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 4 }}>Total Tagihan</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: statusColor[invoice.status] }}>
              {formatRupiah(invoice.total)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 4 }}>Margin</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: getMarginColor(marginPct) }}>
              {marginPct}%
            </div>
            <div style={{ fontSize: 12, color: "var(--color-muted)" }}>{formatRupiah(marginTotal)}</div>
          </div>
          {invoice.status === "unpaid" && ["super_admin", "admin", "finance"].includes(user?.role) && (
            <button onClick={handleMarkPaid} disabled={marking} className="btn btn-success">
              {marking ? "⏳" : "✅"} Tandai Lunas
            </button>
          )}
        </div>
      </div>

      {/* Dapur Info */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title">Informasi Dapur</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 4 }}>Nama Dapur</div>
            <div style={{ fontWeight: 600 }}>{invoice.dapur?.nama}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 4 }}>Alamat</div>
            <div style={{ fontSize: 13, color: "#666" }}>{invoice.dapur?.alamat || "-"}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 4 }}>Kontak</div>
            <div style={{ fontWeight: 500 }}>{invoice.dapur?.kontak || "-"}</div>
          </div>
        </div>
      </div>

      {/* Jatuh Tempo */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 4 }}>Tanggal Invoice</div>
            <div style={{ fontWeight: 600 }}>{formatDate(invoice.tanggal_invoice)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 4 }}>Jatuh Tempo</div>
            {!editingDate ? (
              <div style={{ fontWeight: 600 }}>{invoice.jatuh_tempo ? formatDate(invoice.jatuh_tempo) : "-"}</div>
            ) : (
              <input type="date" className="form-control" style={{ padding: "4px 8px", width: 140, marginTop: -4 }} value={editJatuhTempo} onChange={e => setEditJatuhTempo(e.target.value)} />
            )}
          </div>
          {invoice.po_id && (
            <div>
              <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 4 }}>Nomor PO</div>
              <div style={{ fontWeight: 600 }}>
                <Link href={`/po/${invoice.po_id}`} style={{ color: "var(--color-primary)", textDecoration: "none" }}>
                  #{invoice.po_id}
                </Link>
              </div>
            </div>
          )}
          {invoice.realisasi_id && (
            <div>
              <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 4 }}>Nomor Realisasi</div>
              <div style={{ fontWeight: 600 }}>
                <Link href={`/realisasi/${invoice.realisasi_id}`} style={{ color: "var(--color-primary)", textDecoration: "none" }}>
                  #{invoice.realisasi_id}
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Pagu Harian & Selisih Analysis */}
      {paguInfo && (
        <div
          className="card"
          style={{
            marginBottom: 20,
            borderLeft: `4px solid ${
              !paguInfo.jadwal_ada
                ? "#94a3b8"
                : isOverPagu
                ? "#ef4444"
                : "#22c55e"
            }`,
            background: isOverPagu ? "rgba(239, 68, 68, 0.02)" : "white",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div className="card-title" style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              📊 Pagu Harian Dapur
              {paguInfo.jadwal_ada ? (
                isOverPagu ? (
                  <span style={{ padding: "3px 10px", borderRadius: 99, background: "#fee2e2", color: "#991b1b", fontSize: 12, fontWeight: 700 }}>
                    ⚠️ Over Pagu (+{formatRupiah(selisihNominal)})
                  </span>
                ) : (
                  <span style={{ padding: "3px 10px", borderRadius: 99, background: "#dcfce7", color: "#166534", fontSize: 12, fontWeight: 700 }}>
                    ✓ Sesuai Pagu (Sisa {formatRupiah(paguHarian - totalInvoice)})
                  </span>
                )
              ) : (
                <span style={{ padding: "3px 10px", borderRadius: 99, background: "#f1f5f9", color: "#64748b", fontSize: 12 }}>
                  ⚪ Belum Ada Pagu PM
                </span>
              )}
            </div>
          </div>

          {paguInfo.jadwal_ada ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--color-muted)", fontWeight: 600, textTransform: "uppercase", marginBottom: 2 }}>
                  Pagu Harian
                </div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{formatRupiah(paguHarian)}</div>
                <div style={{ fontSize: 11, color: "var(--color-muted)" }}>
                  PM Kecil: {paguInfo.jumlah_pm_kecil || 0} · Besar: {paguInfo.jumlah_pm_besar || 0}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, color: "var(--color-muted)", fontWeight: 600, textTransform: "uppercase", marginBottom: 2 }}>
                  Total Invoice
                </div>
                <div style={{ fontWeight: 700, fontSize: 16, color: isOverPagu ? "#ef4444" : "#10b981" }}>
                  {formatRupiah(totalInvoice)}
                </div>
                <div style={{ fontSize: 11, color: "var(--color-muted)" }}>Tagihan Invoice Dapur</div>
              </div>

              <div>
                <div style={{ fontSize: 11, color: "var(--color-muted)", fontWeight: 600, textTransform: "uppercase", marginBottom: 2 }}>
                  Selisih Pagu
                </div>
                <div style={{ fontWeight: 800, fontSize: 16, color: isOverPagu ? "#ef4444" : "#059669" }}>
                  {isOverPagu ? `+${formatRupiah(selisihNominal)}` : `-${formatRupiah(selisihNominal)}`}
                </div>
                <div style={{ fontSize: 11, color: isOverPagu ? "#b91c1c" : "#047857", fontWeight: 600 }}>
                  {isOverPagu ? "⚠️ Melebihi Anggaran Harian" : "✓ Dalam Anggaran Harian"}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, color: "var(--color-muted)", fontWeight: 600, textTransform: "uppercase", marginBottom: 2 }}>
                  Total Terpakai Hari Ini
                </div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{formatRupiah(paguInfo.terpakai_harian)}</div>
                <div style={{ fontSize: 11, color: paguInfo.over_harian ? "#ef4444" : "var(--color-muted)" }}>
                  Sisa Pagu Hari Ini: {formatRupiah(paguInfo.sisa_pagu_harian)}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "var(--color-muted)", fontStyle: "italic" }}>
              Jadwal PM belum diatur untuk dapur ini pada tanggal {formatDate(invoice.tanggal_invoice)}.
            </div>
          )}
        </div>
      )}

      {/* Items */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div className="card-title" style={{ margin: 0 }}>Detail Item</div>
          {invoice.status !== "paid" && isAdmin && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddItemModal(true)}>
              + Tambah Item Dadakan
            </button>
          )}
        </div>
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Item</th>
                <th style={{ textAlign: "right" }}>Qty PO</th>
                <th style={{ textAlign: "right" }}>Qty Realisasi</th>
                {isAdmin && <th style={{ textAlign: "right" }}>H. Beli</th>}
                <th style={{ textAlign: "right" }}>{isAdmin ? "H. Jual" : "Harga"}</th>
                {isAdmin && <th style={{ textAlign: "center" }}>Margin</th>}
                <th style={{ textAlign: "right" }}>Subtotal</th>
                {isAdmin && <th style={{ textAlign: "center" }}>Aksi Penawaran</th>}
              </tr>
            </thead>
            <tbody>
              {invoice.details?.map(d => (
                <InvoiceRow
                  key={d.id} d={d} isAdmin={isAdmin} getMarginColor={getMarginColor}
                  isEditing={editingDetailId === d.id} editQty={editQty} editSatuan={editSatuan} editHargaBeli={editHargaBeli} editHargaJual={editHargaJual}
                  setEditQty={setEditQty} setEditSatuan={setEditSatuan} setEditHargaBeli={setEditHargaBeli} setEditHargaJual={setEditHargaJual}
                  onSaveDetail={handleSaveDetail} onCancelDetail={cancelEditDetail} onStartDetail={startEditDetail} onDeleteDetail={handleDeleteDetail} savingDetail={savingDetail}
                />
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "2px solid var(--color-border)" }}>
                <td colSpan={isAdmin ? "7" : "6"} style={{ textAlign: "right", fontWeight: 600 }}>Total</td>
                <td style={{ textAlign: "right", fontWeight: 700, fontSize: 16 }}>{formatRupiah(invoice.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Catatan */}
      {invoice.catatan && (
        <div className="card">
          <div className="card-title">Catatan</div>
          <div style={{ padding: 12, background: "#f3f4f6", borderRadius: 6, fontSize: 13, lineHeight: 1.6 }}>
            {invoice.catatan}
          </div>
        </div>
      )}

      {/* Modal Tambah Item */}
      {showAddItemModal && (
        <div className="modal-overlay" onClick={() => setShowAddItemModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <div className="modal-title">+ Tambah Item Dadakan ke Invoice</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAddItemModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <input className="form-control" placeholder="Nama Item *"
                  value={addManual.nama_item} onChange={e => setAddManual({ ...addManual, nama_item: e.target.value })} />
                <div style={{ display: "flex", gap: 10 }}>
                  <input type="number" className="form-control" placeholder="Qty *" style={{ flex: 1 }}
                    value={addManual.qty} onChange={e => setAddManual({ ...addManual, qty: e.target.value })} />
                  <input className="form-control" placeholder="Satuan (opsional)" style={{ flex: 1 }}
                    value={addManual.satuan} onChange={e => setAddManual({ ...addManual, satuan: e.target.value })} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label className="form-label" style={{ fontSize: 12 }}>Harga Beli (Rp) *</label>
                    <input className="form-control" type="number" min="0" step="1" placeholder="Rp"
                      value={addManual.harga_beli} onChange={e => setAddManual({ ...addManual, harga_beli: e.target.value })} />
                  </div>
                  <div>
                    <label className="form-label" style={{ fontSize: 12 }}>Harga Jual (Rp) *</label>
                    <input className="form-control" type="number" min="0" step="1" placeholder="Rp"
                      value={addManual.harga_jual} onChange={e => setAddManual({ ...addManual, harga_jual: e.target.value })} />
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "var(--color-muted)", marginTop: 8 }}>Item ini hanya ditambahkan ke invoice ini (tidak masuk ke master item).</div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowAddItemModal(false)}>Batal</button>
              <button className="btn btn-primary" disabled={addSaving} onClick={handleAddManual}>
                {addSaving ? <span className="spinner"></span> : "+ Tambah ke Invoice"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const InvoiceRow = memo(function InvoiceRow({
  d, isAdmin, getMarginColor,
  isEditing, editQty, editSatuan, editHargaBeli, editHargaJual,
  setEditQty, setEditSatuan, setEditHargaBeli, setEditHargaJual,
  onSaveDetail, onCancelDetail, onStartDetail, onDeleteDetail, savingDetail
}) {
  const mb = isEditing ? parseFloat(editHargaBeli || 0) : parseFloat(d.harga_beli || 0);
  const mj = isEditing ? parseFloat(editHargaJual || 0) : parseFloat(d.harga_jual || 0);
  const mq = isEditing ? parseFloat(editQty || 0) : parseFloat(d.qty || 0);
  const mp = mb > 0 ? ((mj - mb) / mb * 100).toFixed(1) : 0;
  const subtotal = isEditing ? (mq * mj) : parseFloat(d.subtotal || 0);

  return (
    <tr>
      <td style={{ fontWeight: 600 }}>{d.nama_item}</td>
      <td style={{ textAlign: "right", color: "var(--color-muted)" }}>
        {d.qty_po != null ? `${parseFloat(d.qty_po)} ${d.satuan || ""}` : `${parseFloat(d.qty)} ${d.satuan || ""}`}
      </td>
      <td style={{ textAlign: "right", color: "var(--color-muted)" }}>
        {isEditing ? (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <input
              type="number" min="0" step="any"
              style={{ width: 75, padding: "3px 6px", border: "1.5px solid #3b82f6", borderRadius: 4, fontSize: 13, fontWeight: 700, textAlign: "right" }}
              value={editQty}
              onChange={e => setEditQty(e.target.value)}
            />
            <input
              type="text"
              style={{ width: 60, padding: "3px 6px", border: "1.5px solid #3b82f6", borderRadius: 4, fontSize: 13 }}
              value={editSatuan}
              onChange={e => setEditSatuan(e.target.value)}
              placeholder="Satuan"
            />
          </div>
        ) : d.qty_realisasi != null
          ? <span style={{ fontWeight: parseFloat(d.qty_realisasi) !== parseFloat(d.qty_po) ? 700 : 400, color: parseFloat(d.qty_realisasi) !== parseFloat(d.qty_po) ? "#f59e0b" : "inherit" }}>
              {parseFloat(d.qty_realisasi)} {d.satuan || ""}
            </span>
          : `${parseFloat(d.qty)} ${d.satuan || ""}`}
      </td>
      {isAdmin && (
        <td style={{ textAlign: "right", color: "#64748b" }}>
          {isEditing ? (
            <input
              type="number" min="0" step="1"
              style={{ width: 100, padding: "3px 6px", border: "1.5px solid #64748b", borderRadius: 4, fontSize: 13, fontWeight: 700, textAlign: "right" }}
              value={editHargaBeli}
              onChange={e => setEditHargaBeli(e.target.value)}
            />
          ) : (
            formatRupiah(d.harga_beli)
          )}
        </td>
      )}
      <td style={{ textAlign: "right", color: "#10b981", fontWeight: 600 }}>
        {isEditing ? (
          <input
            type="number" min="0" step="1"
            style={{ width: 100, padding: "3px 6px", border: "1.5px solid #10b981", borderRadius: 4, fontSize: 13, fontWeight: 700, textAlign: "right" }}
            value={editHargaJual}
            onChange={e => setEditHargaJual(e.target.value)}
          />
        ) : (
          formatRupiah(d.harga_jual)
        )}
      </td>
      {isAdmin && (
        <td style={{ textAlign: "center" }}>
          <span style={{
            padding: "2px 8px", borderRadius: 99, fontSize: 12, fontWeight: 700,
            background: getMarginColor(mp) + "20", color: getMarginColor(mp),
          }}>
            {mp}%
          </span>
        </td>
      )}
      <td style={{ textAlign: "right", fontWeight: 600 }}>{formatRupiah(subtotal)}</td>
      {isAdmin && (
        <td style={{ textAlign: "center" }}>
          {isEditing ? (
            <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
              <button
                className="btn btn-success btn-sm"
                style={{ padding: "2px 8px", fontSize: 11 }}
                onClick={() => onSaveDetail(d.id)}
                disabled={savingDetail}
              >
                ✓ Simpan
              </button>
              <button
                className="btn btn-ghost btn-sm"
                style={{ padding: "2px 6px", fontSize: 11 }}
                onClick={onCancelDetail}
              >
                ✕
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
              <button
                className="btn btn-ghost btn-sm"
                style={{ padding: "2px 8px", fontSize: 11, color: "var(--color-primary)" }}
                onClick={() => onStartDetail(d)}
                title="Ubah harga jual (penawaran)"
              >
                ✏️ Ubah Harga
              </button>
              <button
                className="btn btn-ghost btn-sm"
                style={{ padding: "2px 8px", fontSize: 11, color: "#dc2626" }}
                onClick={() => onDeleteDetail(d.id)}
                title="Hapus Item"
              >
                🗑️
              </button>
            </div>
          )}
        </td>
      )}
    </tr>
  );
}, (prev, next) => {
  if (prev.isEditing !== next.isEditing) return false;
  if (next.isEditing) return false;
  return prev.d === next.d;
});
