import { useEffect, useState, useCallback } from "react";
import { rekapApi } from "@/lib/api";
import { formatRupiah, formatDate } from "@/components/Layout";
import Link from "next/link";

function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.setDate(diff)).toISOString().slice(0, 10);
}

function getSunday(monday) {
  const d = new Date(monday);
  d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
}

export default function RekapPage() {
  const [rekapList, setRekapList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [generatingInv, setGeneratingInv] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showInvModal, setShowInvModal] = useState(null); // rekap_id

  const today = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(today);
  const monday = getMonday(selectedDate);
  const sunday = getSunday(monday);

  const [invForm, setInvForm] = useState({
    tanggal_invoice: today,
    jatuh_tempo: "",
    catatan: "",
  });

  const load = async () => {
    setLoading(true);
    try {
      const res = await rekapApi.list();
      setRekapList(res.data);
    } catch { } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handlePreview = useCallback(async () => {
    setPreviewLoading(true); setPreview(null); setError("");
    try {
      const res = await rekapApi.preview(monday);
      setPreview(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Gagal memuat preview");
    } finally { setPreviewLoading(false); }
  }, [monday]);

  const handleCreate = async () => {
    setCreating(true); setError("");
    try {
      await rekapApi.create({
        tanggal_mulai: monday,
        tanggal_selesai: sunday,
        catatan: "",
      });
      setSuccess("✅ Rekap minggu berhasil dibuat!");
      setShowCreateModal(false);
      setPreview(null);
      load();
    } catch (err) {
      setError(err.response?.data?.detail || "Gagal membuat rekap");
    } finally { setCreating(false); }
  };

  const handleGenerateInvoice = async (rekapId) => {
    setGeneratingInv(rekapId); setError("");
    try {
      await rekapApi.generateInvoice(rekapId, {
        tanggal_invoice: invForm.tanggal_invoice,
        jatuh_tempo: invForm.jatuh_tempo || null,
        catatan: invForm.catatan,
        is_draft: true,
      });
      setSuccess("✅ Draft invoice berhasil dibuat!");
      setShowInvModal(null);
      load();
    } catch (err) {
      setError(err.response?.data?.detail || "Gagal generate invoice");
    } finally { setGeneratingInv(null); }
  };

  // Kelompokkan preview rows by tanggal
  const previewByDate = preview?.rows.reduce((acc, row) => {
    const k = row.tanggal;
    if (!acc[k]) acc[k] = [];
    acc[k].push(row);
    return acc;
  }, {}) || {};

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Rekap Mingguan</h1>
          <p className="page-subtitle">Konsolidasi PO Realisasi semua dapur per minggu → draft invoice</p>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
      {success && <div className="alert alert-success" style={{ marginBottom: 16 }}>{success}</div>}

      {/* Preview Section */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <div className="card-title">🔍 Preview Rekap Minggu</div>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap" }}>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 200 }}>
            <label className="form-label">Pilih Tanggal (dalam minggu yang diinginkan)</label>
            <input type="date" className="form-control" value={selectedDate}
              onChange={e => { setSelectedDate(e.target.value); setPreview(null); }} />
          </div>
          <div style={{ fontSize: 13, color: "var(--color-muted)", paddingBottom: 4 }}>
            Minggu: <strong>{formatDate(monday)}</strong> s/d <strong>{formatDate(sunday)}</strong>
          </div>
          <button className="btn btn-primary" onClick={handlePreview} disabled={previewLoading}>
            {previewLoading ? "Memuat..." : "👁 Preview"}
          </button>
          {preview && preview.total_realisasi > 0 && (
            <button className="btn btn-success" onClick={() => setShowCreateModal(true)}>
              📊 Buat Rekap Resmi
            </button>
          )}
        </div>

        {previewLoading && (
          <div style={{ textAlign: "center", padding: 40, color: "var(--color-muted)" }}>
            ⏳ Memuat data realisasi minggu ini...
          </div>
        )}

        {preview && (
          <>
            {/* Summary Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 20 }}>
              {[
                { label: "Total Realisasi", value: preview.total_realisasi + " dokumen", color: "var(--color-primary)" },
                { label: "Total Nilai Beli", value: formatRupiah(preview.total_nilai_beli), color: "#1e293b" },
                { label: "Total Nilai Jual", value: formatRupiah(preview.total_nilai_jual), color: "var(--color-success)" },
                { label: "Estimasi Margin", value: formatRupiah(preview.total_nilai_jual - preview.total_nilai_beli), color: "var(--color-primary)" },
              ].map(c => (
                <div key={c.label} style={{
                  background: "var(--color-bg)", border: "1px solid var(--color-border)",
                  borderRadius: 10, padding: 16,
                }}>
                  <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 4 }}>{c.label}</div>
                  <div style={{ fontWeight: 800, fontSize: 16, color: c.color }} className="rupiah">{c.value}</div>
                </div>
              ))}
            </div>

            {preview.rows.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📭</div>
                <div className="empty-state-title">Tidak ada PO Realisasi approved</div>
                <div className="empty-state-sub">Pastikan akuntan sudah submit dan admin sudah approve realisasi dalam minggu ini.</div>
              </div>
            ) : (
              Object.entries(previewByDate).sort(([a], [b]) => a.localeCompare(b)).map(([tanggal, rows]) => (
                <div key={tanggal} style={{ marginBottom: 24 }}>
                  <div style={{
                    background: "var(--color-primary)", color: "white",
                    padding: "8px 16px", borderRadius: "8px 8px 0 0", fontWeight: 700, fontSize: 14,
                  }}>
                    📅 {formatDate(tanggal)}
                  </div>
                  <div className="table-wrapper" style={{ borderRadius: "0 0 8px 8px", border: "1px solid var(--color-border)", borderTop: "none" }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Dapur</th>
                          <th>Item</th>
                          <th>Satuan</th>
                          <th style={{ textAlign: "right" }}>Qty Total</th>
                          <th style={{ textAlign: "right" }}>Harga Beli</th>
                          <th style={{ textAlign: "right" }}>Harga Jual</th>
                          <th style={{ textAlign: "right" }}>Subtotal Jual</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, i) => (
                          <tr key={i}>
                            <td><span className="badge badge-draft">{row.dapur_nama}</span></td>
                            <td style={{ fontWeight: 600 }}>{row.nama_item}</td>
                            <td>{row.satuan}</td>
                            <td style={{ textAlign: "right", fontWeight: 700 }}>{row.qty_total}</td>
                            <td style={{ textAlign: "right" }} className="rupiah">{formatRupiah(row.harga_beli)}</td>
                            <td style={{ textAlign: "right", color: "var(--color-success)" }} className="rupiah">{formatRupiah(row.harga_jual)}</td>
                            <td style={{ textAlign: "right", fontWeight: 700 }} className="rupiah">{formatRupiah(row.subtotal_jual)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={6} style={{ textAlign: "right", fontWeight: 700, fontSize: 13 }}>Subtotal Hari Ini:</td>
                          <td style={{ textAlign: "right", fontWeight: 800, color: "var(--color-success)" }} className="rupiah">
                            {formatRupiah(rows.reduce((s, r) => s + r.subtotal_jual, 0))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>

      {/* Rekap Resmi List */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">📋 Daftar Rekap Resmi</div>
        </div>
        {loading ? (
          <div className="loading-overlay"><div className="spinner" style={{ width: 32, height: 32 }}></div></div>
        ) : rekapList.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📊</div>
            <div className="empty-state-title">Belum ada rekap resmi</div>
            <div className="empty-state-sub">Preview minggu di atas lalu klik "Buat Rekap Resmi"</div>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Nomor Rekap</th>
                  <th>Periode</th>
                  <th style={{ textAlign: "right" }}>Total Beli</th>
                  <th style={{ textAlign: "right" }}>Total Jual</th>
                  <th>Status</th>
                  <th>Invoice</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rekapList.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 700, color: "var(--color-primary)" }}>{r.nomor_rekap}</td>
                    <td>
                      <div style={{ fontSize: 13 }}>{formatDate(r.tanggal_mulai)}</div>
                      <div style={{ fontSize: 11, color: "var(--color-muted)" }}>s/d {formatDate(r.tanggal_selesai)}</div>
                    </td>
                    <td style={{ textAlign: "right" }} className="rupiah">{formatRupiah(r.total_nilai_beli)}</td>
                    <td style={{ textAlign: "right", fontWeight: 700, color: "var(--color-success)" }} className="rupiah">
                      {formatRupiah(r.total_nilai_jual)}
                    </td>
                    <td>
                      <span className={`badge badge-${r.status === "final" ? "approved" : "draft"}`}>
                        {r.status}
                      </span>
                    </td>
                    <td>
                      {r.invoice_path ? (
                        <a href={rekapApi.downloadInvoiceUrl(r.id)} target="_blank" className="btn btn-ghost btn-sm">
                          📥 Download
                        </a>
                      ) : (
                        <span style={{ color: "var(--color-muted)", fontSize: 12 }}>Belum</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        {r.status !== "final" && (
                          <button className="btn btn-warning btn-sm" onClick={() => setShowInvModal(r.id)}>
                            🧾 Draft Invoice
                          </button>
                        )}
                        {r.status === "final" && !r.invoice_path && (
                          <button className="btn btn-warning btn-sm" onClick={() => setShowInvModal(r.id)}>
                            🧾 Re-generate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Confirm Buat Rekap */}
      {showCreateModal && preview && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">📊 Konfirmasi Buat Rekap Resmi</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCreateModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: 16, marginBottom: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Rekap Minggu:</div>
                <div style={{ fontSize: 14 }}>📅 {formatDate(monday)} s/d {formatDate(sunday)}</div>
                <div style={{ marginTop: 8 }}>
                  <span style={{ color: "var(--color-muted)", fontSize: 13 }}>Total Realisasi: </span>
                  <strong>{preview.total_realisasi} dokumen</strong>
                </div>
                <div>
                  <span style={{ color: "var(--color-muted)", fontSize: 13 }}>Total Nilai Jual: </span>
                  <strong className="rupiah">{formatRupiah(preview.total_nilai_jual)}</strong>
                </div>
              </div>
              <div className="alert alert-info">
                Rekap ini akan mengkonsolidasi semua PO Realisasi approved dalam periode tersebut. Proses ini tidak bisa dibatalkan untuk periode yang sama.
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowCreateModal(false)}>Batal</button>
              <button className="btn btn-success" onClick={handleCreate} disabled={creating}>
                {creating ? "Membuat..." : "✅ Buat Rekap"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Generate Draft Invoice */}
      {showInvModal && (
        <div className="modal-overlay" onClick={() => setShowInvModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">🧾 Generate Draft Invoice / Penawaran Harga</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowInvModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13 }}>
                📋 Draft invoice ini merupakan rekap konsolidasi semua dapur. Berlabel <strong>DRAFT</strong> dan bisa digunakan sebagai penawaran harga.
              </div>
              <div className="form-group">
                <label className="form-label">Tanggal Invoice *</label>
                <input className="form-control" type="date" value={invForm.tanggal_invoice}
                  onChange={e => setInvForm({ ...invForm, tanggal_invoice: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Jatuh Tempo (kosong = +14 hari)</label>
                <input className="form-control" type="date" value={invForm.jatuh_tempo}
                  onChange={e => setInvForm({ ...invForm, jatuh_tempo: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Catatan</label>
                <textarea className="form-control" rows={3} value={invForm.catatan}
                  onChange={e => setInvForm({ ...invForm, catatan: e.target.value })} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowInvModal(null)}>Batal</button>
              <button className="btn btn-warning" onClick={() => handleGenerateInvoice(showInvModal)}
                disabled={!!generatingInv}>
                {generatingInv ? "Generating..." : "🧾 Generate Draft Invoice"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

RekapPage.title = "Rekap Mingguan";
RekapPage.subtitle = "Konsolidasi PO Realisasi semua dapur per minggu";
