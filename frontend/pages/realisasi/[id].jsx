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
    jatuh_tempo: (() => { const d = new Date(); d.setDate(d.getDate() + 3); return d.toISOString().slice(0, 10); })(),
    catatan: "",
  });
  const [actionLoading, setActionLoading] = useState(false);
  const [showGeserModal, setShowGeserModal] = useState(false);
  const [geserForm, setGeserForm] = useState({
    detail_id: null,
    nama_item: "",
    qty_realisasi: 0,
    qty_geser: "",
    tanggal_baru: new Date().toISOString().slice(0, 10),
  });
  const [showAddExtraModal, setShowAddExtraModal] = useState(false);
  const [extraForm, setExtraForm] = useState({
    nama_item_raw: "",
    qty_realisasi: "",
    satuan: "pcs",
    harga_satuan: "",
    catatan: "",
  });

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

  const handleAddExtraSubmit = async (e) => {
    e.preventDefault();
    if (!extraForm.nama_item_raw || !extraForm.qty_realisasi || !extraForm.harga_satuan) {
      alert("Lengkapi semua field wajib");
      return;
    }
    setActionLoading(true);
    try {
      await realisasiApi.addDetail(id, {
        nama_item_raw: extraForm.nama_item_raw,
        qty_realisasi: parseFloat(extraForm.qty_realisasi),
        satuan: extraForm.satuan,
        harga_satuan: parseFloat(extraForm.harga_satuan),
        catatan: extraForm.catatan || null,
      });
      setShowAddExtraModal(false);
      setExtraForm({ nama_item_raw: "", qty_realisasi: "", satuan: "pcs", harga_satuan: "", catatan: "" });
      load();
      alert("✅ Item ekstra berhasil ditambahkan!");
    } catch (err) {
      setError(err.response?.data?.detail || "Gagal menambahkan item ekstra");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteDetail = async (detailId) => {
    if (!confirm("Hapus item ini dari realisasi?")) return;
    try {
      await realisasiApi.deleteDetail(detailId);
      load();
    } catch (err) {
      alert(err.response?.data?.detail || "Gagal menghapus item dari realisasi");
    }
  };

  const handleOpenGeser = (detail) => {
    setGeserForm({
      detail_id: detail.id,
      nama_item: detail.nama_item_raw || detail.item?.nama_item || "Item",
      qty_realisasi: parseFloat(detail.qty_realisasi),
      qty_geser: parseFloat(detail.qty_realisasi),
      tanggal_baru: new Date().toISOString().slice(0, 10),
    });
    setShowGeserModal(true);
  };

  const handleGeserSubmit = async (e) => {
    e.preventDefault();
    if (!geserForm.qty_geser || geserForm.qty_geser <= 0 || geserForm.qty_geser > geserForm.qty_realisasi) {
      alert("Jumlah geser tidak valid");
      return;
    }
    if (!geserForm.tanggal_baru) {
      alert("Pilih tanggal tujuan");
      return;
    }
    setActionLoading(true);
    try {
      await realisasiApi.geser(id, {
        detail_id: geserForm.detail_id,
        qty_geser: parseFloat(geserForm.qty_geser),
        tanggal_baru: geserForm.tanggal_baru,
      });
      setShowGeserModal(false);
      load();
      alert("✅ Item berhasil digeser ke tanggal " + formatDate(geserForm.tanggal_baru));
    } catch (err) {
      setError(err.response?.data?.detail || "Gagal menggeser item");
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

      {/* Warning Over Budget */}
      {rel.po && (parseFloat(rel.po.budget_kecil) + parseFloat(rel.po.budget_besar)) > 0 && rel.total_nilai > (parseFloat(rel.po.budget_kecil) + parseFloat(rel.po.budget_besar)) && (
        <div style={{ background: "#fee2e2", border: "1px solid #fecaca", color: "#991b1b", padding: "14px 18px", borderRadius: 12, marginBottom: 16, fontSize: 13.5, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontWeight: 800, display: "flex", alignItems: "center", gap: 6 }}>
            ⚠️ TOTAL REALISASI MELEBIHI PAGU HARIAN
          </div>
          <div>
            Total realisasi saat ini adalah <strong>{formatRupiah(rel.total_nilai)}</strong>, sedangkan pagu anggaran harian dapur adalah <strong>{formatRupiah(parseFloat(rel.po.budget_kecil) + parseFloat(rel.po.budget_besar))}</strong>.
          </div>
          {rel.status === "draft" && (
            <div style={{ fontSize: 12, marginTop: 4, color: "#b91c1c", fontWeight: 600 }}>
              💡 Silakan geser sebagian atau seluruh kuantitas item ke tanggal lain menggunakan tombol "🔁 Geser" di tabel detail item di bawah agar total realisasi tidak melampaui pagu.
            </div>
          )}
        </div>
      )}

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
        <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="card-title">📦 Item Realisasi ({rel.details?.length || 0} item)</div>
          {rel.status === "draft" && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddExtraModal(true)}>
              ➕ Tambah Item Ekstra
            </button>
          )}
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
                {rel.status === "draft" && <th style={{ textAlign: "center" }}>Aksi</th>}
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
                    {rel.status === "draft" && (
                      <td style={{ textAlign: "center" }}>
                        <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                          <button className="btn btn-sm btn-ghost" style={{ fontSize: 11, padding: "4px 8px", border: "1px solid var(--color-border)" }} onClick={() => handleOpenGeser(d)}>
                            🔁 Geser
                          </button>
                          <button className="btn btn-sm btn-ghost" style={{ fontSize: 11, padding: "4px 8px", color: "#dc2626", border: "1px solid #fee2e2" }} onClick={() => handleDeleteDetail(d.id)} title="Hapus Item">
                            🗑️
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={rel.status === "draft" ? 9 : 8} style={{ textAlign: "right", fontWeight: 700, paddingTop: 12 }}>TOTAL NILAI JUAL</td>
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

      {/* Geser Item Modal */}
      {showGeserModal && (
        <div className="modal-overlay" onClick={() => setShowGeserModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <div className="modal-title">🔁 Geser Item ke Tanggal Lain</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowGeserModal(false)}>✕</button>
            </div>
            <form onSubmit={handleGeserSubmit}>
              <div className="modal-body">
                <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 12 }}>
                  Memindahkan kuantitas item <strong>{geserForm.nama_item}</strong> agar tidak melampaui pagu harian.
                </div>
                <div className="form-group">
                  <label className="form-label">Kuantitas yang Digeser (Maks {geserForm.qty_realisasi})</label>
                  <input type="number" step="any" className="form-control" value={geserForm.qty_geser}
                    onChange={e => setGeserForm({ ...geserForm, qty_geser: e.target.value })} max={geserForm.qty_realisasi} min={0.001} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Tanggal Tujuan Baru *</label>
                  <input type="date" className="form-control" value={geserForm.tanggal_baru}
                    onChange={e => setGeserForm({ ...geserForm, tanggal_baru: e.target.value })} required />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowGeserModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary" disabled={actionLoading}>
                  {actionLoading ? "Menggeser..." : "🔁 Geser Item"}
                </button>
              </div>
            </form>
          </div>
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
            <form onSubmit={handleAddExtraSubmit}>
              <div className="modal-body">
                <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 12 }}>
                  Item ekstra adalah item yang tidak terdaftar di PO asli tetapi dibeli secara riil dan perlu di-reimburse ke relawan.
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
                <div className="form-group">
                  <label className="form-label">Catatan</label>
                  <input className="form-control" placeholder="Keterangan item ekstra..." value={extraForm.catatan}
                    onChange={e => setExtraForm({ ...extraForm, catatan: e.target.value })} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowAddExtraModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary" disabled={actionLoading}>
                  {actionLoading ? "Menyimpan..." : "＋ Tambah Item"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

RealisasiDetail.title = "Detail Realisasi PO";
