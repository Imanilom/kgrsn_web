import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { realisasiApi, invoiceApi } from "@/lib/api";
import { formatRupiah, formatDate } from "@/components/Layout";
import Link from "next/link";

const STATUS_LABEL = {
  draft: { label: "Draft", color: "#64748b" },
  submitted: { label: "Diajukan", color: "#f59e0b" },
  approved: { label: "Approved", color: "#22c55e" },
  rejected: { label: "Ditolak", color: "#ef4444" },
};

export default function RealisasiDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [rel, setRel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [user, setUser] = useState(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({
    tanggal_invoice: new Date().toISOString().slice(0, 10),
    jatuh_tempo: "",
    catatan: "",
  });
  const [actionLoading, setActionLoading] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await realisasiApi.get(id);
      setRel(res.data);
    } catch { setError("Realisasi tidak ditemukan"); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    try { setUser(JSON.parse(localStorage.getItem("user"))); } catch {}
  }, []);
  useEffect(() => { load(); }, [id]);

  const handleSubmit = async () => {
    if (!confirm("Ajukan realisasi ini ke admin?")) return;
    setActionLoading(true);
    try { await realisasiApi.submit(id); load(); }
    catch (err) { setError(err.response?.data?.detail || "Gagal"); }
    finally { setActionLoading(false); }
  };

  const handleApprove = async () => {
    if (!confirm("Approve realisasi ini?")) return;
    setActionLoading(true);
    try { await realisasiApi.approve(id); load(); }
    catch (err) { setError(err.response?.data?.detail || "Gagal"); }
    finally { setActionLoading(false); }
  };

  const handleReject = async () => {
    if (!confirm("Tolak realisasi ini?")) return;
    setActionLoading(true);
    try { await realisasiApi.reject(id); load(); }
    catch (err) { setError(err.response?.data?.detail || "Gagal"); }
    finally { setActionLoading(false); }
  };

  const handleGenerateInvoice = async () => {
    setActionLoading(true);
    try {
      await realisasiApi.generateInvoice(id, {
        ...invoiceForm,
        tanggal_invoice: invoiceForm.tanggal_invoice,
        jatuh_tempo: invoiceForm.jatuh_tempo || null,
        is_draft: false,
      });
      setShowInvoiceModal(false);
      load();
      alert("✅ Invoice berhasil dibuat!");
    } catch (err) {
      setError(err.response?.data?.detail || "Gagal generate invoice");
    } finally {
      setActionLoading(false);
    }
  };

  const isAdmin = user?.role && ["admin", "super_admin", "finance"].includes(user.role);
  const isAkuntan = user?.role && ["akuntan", "operator"].includes(user.role);

  if (loading) return <div className="loading-overlay"><div className="spinner" style={{ width: 32, height: 32 }}></div></div>;
  if (!rel) return (
    <div className="card">
      <div className="empty-state">
        <div className="empty-state-icon">❌</div>
        <div className="empty-state-title">Realisasi tidak ditemukan</div>
        <Link href="/realisasi" className="btn btn-primary" style={{ marginTop: 16 }}>← Kembali</Link>
      </div>
    </div>
  );

  const statusInfo = STATUS_LABEL[rel.status] || { label: rel.status, color: "#64748b" };
  const hasInvoice = rel.invoices?.some(inv => !inv.is_draft);

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <div style={{ fontSize: 13, color: "var(--color-muted)", marginBottom: 4 }}>
            <Link href="/realisasi" style={{ color: "var(--color-muted)", textDecoration: "none" }}>← Daftar Realisasi</Link>
          </div>
          <h1 className="page-title">{rel.nomor_realisasi}</h1>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 6 }}>
            <span style={{
              background: statusInfo.color + "20", color: statusInfo.color,
              border: `1px solid ${statusInfo.color}40`, borderRadius: 20,
              padding: "3px 12px", fontSize: 13, fontWeight: 700,
            }}>
              {statusInfo.label}
            </span>
            <span style={{ color: "var(--color-muted)", fontSize: 13 }}>
              {rel.dapur?.nama} · {formatDate(rel.tanggal_realisasi)}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {/* Akuntan: submit ke admin */}
          {isAkuntan && rel.status === "draft" && (
            <button className="btn btn-warning" onClick={handleSubmit} disabled={actionLoading}>
              📤 Ajukan ke Admin
            </button>
          )}
          {/* Admin: approve / reject */}
          {isAdmin && ["draft", "submitted"].includes(rel.status) && (
            <>
              <button className="btn btn-success" onClick={handleApprove} disabled={actionLoading}>
                ✓ Approve
              </button>
              <button className="btn btn-ghost" style={{ color: "var(--color-danger)" }}
                onClick={handleReject} disabled={actionLoading}>
                ✕ Tolak
              </button>
            </>
          )}
          {/* Admin: generate invoice jika approved & belum ada invoice */}
          {isAdmin && rel.status === "approved" && !hasInvoice && (
            <button className="btn btn-primary" onClick={() => setShowInvoiceModal(true)}>
              🧾 Generate Invoice
            </button>
          )}
          {hasInvoice && (
            <span style={{ color: "var(--color-success)", fontWeight: 700, fontSize: 13, alignSelf: "center" }}>
              ✅ Invoice sudah dibuat
            </span>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Info Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>📋 Info Realisasi</div>
          {[
            ["Nomor Realisasi", rel.nomor_realisasi],
            ["PO Referensi", rel.po?.nomor_po || "-"],
            ["Dapur", rel.dapur?.nama],
            ["Tanggal Realisasi", formatDate(rel.tanggal_realisasi)],
            ["Status", statusInfo.label],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", marginBottom: 10, fontSize: 13 }}>
              <span style={{ color: "var(--color-muted)", width: 140, flexShrink: 0 }}>{k}</span>
              <span style={{ fontWeight: 600 }}>{v}</span>
            </div>
          ))}
          {rel.catatan && (
            <div style={{ marginTop: 8, padding: 10, background: "#f8fafc", borderRadius: 8, fontSize: 13 }}>
              <strong>Catatan:</strong> {rel.catatan}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>💰 Ringkasan Nilai</div>
          {[
            ["Total Harga Beli", formatRupiah(rel.total_nilai), "#1e293b"],
            ["Total Harga Jual (×1.15)", formatRupiah(rel.total_nilai_jual), "var(--color-success)"],
            ["Estimasi Keuntungan", formatRupiah(rel.total_nilai_jual - rel.total_nilai), "var(--color-primary)"],
          ].map(([label, value, color]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--color-border)" }}>
              <span style={{ color: "var(--color-muted)", fontSize: 13 }}>{label}</span>
              <span style={{ fontWeight: 700, fontSize: 16, color }} className="rupiah">{value}</span>
            </div>
          ))}
          <div style={{ fontSize: 11, color: "var(--color-muted)", textAlign: "right", marginTop: 8 }}>
            *Margin 15% dari harga beli
          </div>
        </div>
      </div>

      {/* Tabel Item */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">📦 Item Realisasi ({rel.details?.length || 0} item)</div>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>No</th>
                <th>Nama Item</th>
                <th style={{ textAlign: "right" }}>Qty PO</th>
                <th style={{ textAlign: "right" }}>Qty Realisasi</th>
                <th style={{ textAlign: "right" }}>Selisih</th>
                <th>Satuan</th>
                <th style={{ textAlign: "right" }}>Harga Beli</th>
                <th style={{ textAlign: "right" }}>Harga Jual</th>
                <th style={{ textAlign: "right" }}>Subtotal Jual</th>
              </tr>
            </thead>
            <tbody>
              {rel.details?.map((d, i) => {
                const selisih = parseFloat(d.qty_realisasi) - parseFloat(d.qty_po);
                return (
                  <tr key={d.id} style={{ background: selisih !== 0 ? "rgba(245,158,11,0.04)" : undefined }}>
                    <td>{i + 1}</td>
                    <td style={{ fontWeight: 600 }}>{d.nama_item_raw || d.item?.nama_item}</td>
                    <td style={{ textAlign: "right", color: "var(--color-muted)" }}>{d.qty_po}</td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>{d.qty_realisasi}</td>
                    <td style={{
                      textAlign: "right",
                      color: selisih > 0 ? "var(--color-success)" : selisih < 0 ? "var(--color-danger)" : "var(--color-muted)",
                      fontWeight: selisih !== 0 ? 700 : 400,
                    }}>
                      {selisih > 0 ? "+" : ""}{parseFloat(selisih).toFixed(3)}
                    </td>
                    <td>{d.satuan || "-"}</td>
                    <td style={{ textAlign: "right" }} className="rupiah">{formatRupiah(d.harga_satuan)}</td>
                    <td style={{ textAlign: "right", color: "var(--color-success)" }} className="rupiah">{formatRupiah(d.harga_jual)}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }} className="rupiah">{formatRupiah(d.subtotal_jual)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={8} style={{ textAlign: "right", fontWeight: 700, paddingTop: 12 }}>TOTAL NILAI JUAL</td>
                <td style={{ textAlign: "right", fontWeight: 800, fontSize: 15, color: "var(--color-success)" }} className="rupiah">
                  {formatRupiah(rel.total_nilai_jual)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Generate Invoice Modal */}
      {showInvoiceModal && (
        <div className="modal-overlay" onClick={() => setShowInvoiceModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">🧾 Generate Invoice dari Realisasi</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowInvoiceModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 13 }}>
                Invoice akan dibuat berdasarkan <strong>qty realisasi</strong> (bukan qty PO asli) dengan harga jual dari master harga terkini.
              </div>
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
              <div style={{ background: "#f8fafc", borderRadius: 8, padding: 14 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Total Invoice:</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "var(--color-primary)" }} className="rupiah">
                  {formatRupiah(rel.total_nilai_jual)}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowInvoiceModal(false)}>Batal</button>
              <button className="btn btn-primary" onClick={handleGenerateInvoice} disabled={actionLoading}>
                {actionLoading ? <span className="spinner"></span> : "🧾 Generate Invoice"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

RealisasiDetail.title = "Detail Realisasi PO";
