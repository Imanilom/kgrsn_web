import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { poApi, invoiceApi, sjApi } from "@/lib/api";
import { formatRupiah, formatDate, StatusBadge } from "@/components/Layout";
import Link from "next/link";

export default function PODetail() {
  const router = useRouter();
  const { id } = router.query;
  const [po, setPo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showSJModal, setShowSJModal] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({ tanggal_invoice: new Date().toISOString().slice(0, 10), jatuh_tempo: "", catatan: "" });
  const [sjForm, setSJForm] = useState({ tanggal_kirim: new Date().toISOString().slice(0, 10), pengirim: "", penerima: "", catatan: "" });
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    if (!id) return;
    setLoading(true);
    poApi.get(id).then(r => setPo(r.data)).catch(() => setError("PO tidak ditemukan")).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  const handleApprove = async () => {
    if (!confirm("Approve PO ini?")) return;
    try { await poApi.approve(id); load(); }
    catch (err) { setError(err.response?.data?.detail || "Gagal approve"); }
  };

  const handleGenerateInvoice = async () => {
    setActionLoading(true);
    try {
      const payload = {
        ...invoiceForm,
        jatuh_tempo: invoiceForm.jatuh_tempo || null,
      };
      const res = await invoiceApi.generate(id, payload);
      setShowInvoiceModal(false);
      // Auto redirect ke detail invoice
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
      // Auto redirect ke detail surat jalan
      router.push(`/surat-jalan/${res.data.id}`);
    } catch (err) {
      setError(err.response?.data?.detail || "Gagal generate surat jalan");
      setActionLoading(false);
    }
  };

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

  return (
    <div>
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
          {po.status === "draft" && (
            <button className="btn btn-success" onClick={handleApprove}>✓ Approve PO</button>
          )}
          {["approved", "delivered"].includes(po.status) && (
            <button className="btn btn-primary" onClick={() => setShowSJModal(true)}>🚚 Buat Surat Jalan</button>
          )}
          {["approved", "delivered"].includes(po.status) && (
            <button className="btn btn-warning" onClick={() => setShowInvoiceModal(true)}>🧾 Generate Invoice</button>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--color-border)" }}>
            <span style={{ color: "var(--color-muted)", fontSize: 13 }}>Total Harga Beli</span>
            <span style={{ fontWeight: 700, fontSize: 18 }} className="rupiah">{formatRupiah(po.total_nilai)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--color-border)" }}>
            <span style={{ color: "var(--color-muted)", fontSize: 13 }}>Estimasi Harga Jual (×1.15)</span>
            <span style={{ fontWeight: 700, fontSize: 18, color: "var(--color-success)" }} className="rupiah">
              {formatRupiah(po.total_nilai * 1.15)}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0" }}>
            <span style={{ color: "var(--color-muted)", fontSize: 13 }}>Estimasi Keuntungan</span>
            <span style={{ fontWeight: 700, fontSize: 18, color: "var(--color-primary)" }} className="rupiah">
              {formatRupiah(po.total_nilai * 0.15)}
            </span>
          </div>
          <div style={{ fontSize: 11, color: "var(--color-muted)", textAlign: "right", marginTop: 4 }}>
            *Margin 15% dari harga beli
          </div>
        </div>
      </div>

      {/* Detail Items */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">📦 Item PO ({po.details?.length || 0} item)</div>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>No</th>
                <th>Nama Item</th>
                <th>Master Item</th>
                <th style={{ textAlign: "right" }}>Qty</th>
                <th>Satuan</th>
                <th style={{ textAlign: "right" }}>Harga Beli</th>
                <th style={{ textAlign: "right" }}>Harga Jual (×1.15)</th>
                <th style={{ textAlign: "right" }}>Subtotal Beli</th>
              </tr>
            </thead>
            <tbody>
              {po.details?.map((d, i) => {
                const hjual = d.harga_satuan * 1.15;
                return (
                  <tr key={d.id}>
                    <td>{i + 1}</td>
                    <td><strong>{d.nama_item_raw || d.item?.nama_item}</strong></td>
                    <td>
                      {d.item ? (
                        <span style={{ color: "var(--color-success)", fontSize: 12 }}>✓ {d.item.nama_item}</span>
                      ) : (
                        <span className="badge badge-warning">Belum dimap</span>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>{d.qty}</td>
                    <td>{d.satuan || "-"}</td>
                    <td style={{ textAlign: "right" }} className="rupiah">{formatRupiah(d.harga_satuan)}</td>
                    <td style={{ textAlign: "right", color: "var(--color-success)" }} className="rupiah">{formatRupiah(hjual)}</td>
                    <td style={{ textAlign: "right" }} className="rupiah">{formatRupiah(d.subtotal)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={7} style={{ textAlign: "right", fontWeight: 700, paddingTop: 12 }}>TOTAL BELI</td>
                <td style={{ textAlign: "right", fontWeight: 800, fontSize: 15 }} className="rupiah">{formatRupiah(po.total_nilai)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

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
                💡 Harga jual akan dihitung otomatis: <strong>Harga Beli × 1.15</strong>
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
