import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { invoiceKendaraanApi, dapurApi } from "@/lib/api";
import Link from "next/link";
import { parseCookies } from "nookies";

const formatRupiah = (v) => `Rp ${parseFloat(v || 0).toLocaleString("id-ID")}`;

function StatusBadge({ status }) {
  if (status === "paid") return <span className="badge badge-success">✅ Lunas</span>;
  if (status === "cancelled") return <span className="badge badge-error">❌ Batal</span>;
  return <span className="badge badge-warning">⏳ Belum Lunas</span>;
}

export default function InvoiceKendaraanPage() {
  const [invoices, setInvoices] = useState([]);
  const [dapur, setDapur] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ dapur_id: "", status: "" });
  const [pagination, setPagination] = useState({ page: 1, total: 0, total_pages: 1 });
  const [user, setUser] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Modal Create
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    dapur_id: "",
    tanggal_invoice: new Date().toISOString().split("T")[0],
    kendaraan: "",
    harga_satuan: "",
    satuan_waktu: "hari",
    kuantitas: 1,
    catatan: ""
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    try {
      const c = parseCookies();
      if (c.user) setUser(JSON.parse(c.user));
    } catch (e) {}
  }, []);

  const isAdmin = ["super_admin", "admin", "finance"].includes(user?.role);

  const load = async (page = 1) => {
    setLoading(true);
    try {
      const res = await invoiceKendaraanApi.list({ ...filter, page, limit: 50 });
      setInvoices(res.data.data);
      setPagination({ page: res.data.page, total: res.data.total, total_pages: res.data.total_pages });
    } catch (err) {
      alert("Gagal memuat data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { dapurApi.list({ is_active: true }).then(r => setDapur(r.data)); }, []);
  useEffect(() => { setCurrentPage(1); load(1); }, [filter.dapur_id, filter.status]);

  const handleMarkPaid = async (id) => {
    if (!confirm("Tandai invoice ini sebagai LUNAS?")) return;
    try { await invoiceKendaraanApi.markPaid(id); load(currentPage); }
    catch (err) { alert(err.response?.data?.detail || "Gagal"); }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!createForm.dapur_id || !createForm.kendaraan || !createForm.harga_satuan || !createForm.kuantitas) {
      return alert("Harap lengkapi form (Dapur, Kendaraan, Harga, Kuantitas)");
    }
    setSubmitting(true);
    try {
      await invoiceKendaraanApi.create(createForm);
      setShowCreateModal(false);
      setCreateForm({ ...createForm, kendaraan: "", harga_satuan: "", catatan: "" });
      load(currentPage);
    } catch (err) {
      alert(err.response?.data?.detail || "Gagal membuat invoice");
    } finally {
      setSubmitting(false);
    }
  };

  const totalUnpaid = invoices.filter(i => i.status === "unpaid").reduce((s, i) => s + parseFloat(i.total_harga || 0), 0);
  const totalAll = invoices.reduce((s, i) => s + parseFloat(i.total_harga || 0), 0);

  return (
    <Layout title="Invoice Kendaraan">
      <div className="page-header">
        <div>
          <h1 className="page-title">Invoice Sewa Kendaraan</h1>
          <p className="page-subtitle">
            {pagination.total} invoice · 
            Belum lunas: {formatRupiah(totalUnpaid)} · 
            Total: {formatRupiah(totalAll)}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {isAdmin && (
            <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
              ➕ Buat Invoice Baru
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <div className="filter-bar" style={{ flexWrap: "wrap", gap: 8 }}>
          <select className="form-control" style={{ width: 220 }} value={filter.dapur_id}
            onChange={e => setFilter({ ...filter, dapur_id: e.target.value })}>
            <option value="">Semua Dapur</option>
            {dapur.map(d => <option key={d.id} value={d.id}>{d.nama}</option>)}
          </select>
          <select className="form-control" style={{ width: 180 }} value={filter.status}
            onChange={e => setFilter({ ...filter, status: e.target.value })}>
            <option value="">Semua Status</option>
            <option value="unpaid">⏳ Belum Lunas</option>
            <option value="paid">✅ Lunas</option>
            <option value="cancelled">❌ Batal</option>
          </select>
        </div>

        {loading ? (
          <div className="loading-overlay"><div className="spinner" style={{ width: 32, height: 32 }}></div></div>
        ) : invoices.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🚚</div>
            <div className="empty-state-title">Belum ada invoice kendaraan</div>
          </div>
        ) : (
          <>
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Nomor Invoice</th>
                    <th>Dapur</th>
                    <th>Kendaraan</th>
                    <th>Satuan / Durasi</th>
                    <th style={{ textAlign: "right" }}>Total (Rp)</th>
                    <th>Status</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(inv => (
                    <tr key={inv.id}>
                      <td>
                        <div style={{ fontWeight: 700, color: "var(--color-primary)" }}>{inv.nomor_invoice}</div>
                        <div style={{ fontSize: 12, color: "var(--color-muted)" }}>{inv.tanggal_invoice}</div>
                      </td>
                      <td>{inv.dapur?.nama}</td>
                      <td>{inv.kendaraan}</td>
                      <td>
                        <div>{inv.kuantitas} {inv.satuan_waktu.replace("_", " ")}</div>
                        <div style={{ fontSize: 11, color: "var(--color-muted)" }}>@ {formatRupiah(inv.harga_satuan)}</div>
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 700, fontFamily: "monospace", fontSize: 15 }}>
                        {formatRupiah(inv.total_harga)}
                      </td>
                      <td><StatusBadge status={inv.status} /></td>
                      <td>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button
                            onClick={() => {
                              invoiceKendaraanApi.download(inv.id).then(res => {
                                const url = window.URL.createObjectURL(new Blob([res.data]));
                                const link = document.createElement("a");
                                link.href = url;
                                link.setAttribute("download", `Invoice_Kendaraan_${inv.nomor_invoice.replace(/\//g, "-")}.pdf`);
                                document.body.appendChild(link);
                                link.click();
                                link.remove();
                              }).catch(() => alert("Gagal download PDF"));
                            }}
                            className="btn btn-ghost btn-sm"
                          >
                            📥 PDF
                          </button>
                          {inv.status === "unpaid" && isAdmin && (
                            <button className="btn btn-success btn-sm" onClick={() => handleMarkPaid(inv.id)}>
                              ✓ Lunas
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pagination.total_pages > 1 && (
              <div className="pagination">
                <button className="btn btn-ghost" disabled={currentPage === 1}
                  onClick={() => { setCurrentPage(c => c - 1); load(currentPage - 1); }}>Prev</button>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Page {currentPage} of {pagination.total_pages}</span>
                <button className="btn btn-ghost" disabled={currentPage === pagination.total_pages}
                  onClick={() => { setCurrentPage(c => c + 1); load(currentPage + 1); }}>Next</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal Create */}
      {showCreateModal && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h3 className="modal-title">Buat Invoice Kendaraan</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCreateModal(false)}>✕</button>
            </div>
            <form className="modal-body" onSubmit={handleCreate}>
              <div className="form-group">
                <label className="form-label">Dapur</label>
                <select className="form-control" required value={createForm.dapur_id} onChange={e => setCreateForm({...createForm, dapur_id: e.target.value})}>
                  <option value="">-- Pilih Dapur --</option>
                  {dapur.map(d => <option key={d.id} value={d.id}>{d.nama}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Tanggal Invoice</label>
                <input type="date" className="form-control" required value={createForm.tanggal_invoice} onChange={e => setCreateForm({...createForm, tanggal_invoice: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Kendaraan yang Disewa</label>
                <input type="text" className="form-control" required placeholder="Cth: Mobil Pick Up Grand Max B 1234 CD" value={createForm.kendaraan} onChange={e => setCreateForm({...createForm, kendaraan: e.target.value})} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Harga per Satuan (Rp)</label>
                  <input type="number" className="form-control" required value={createForm.harga_satuan} onChange={e => setCreateForm({...createForm, harga_satuan: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Satuan Waktu</label>
                  <select className="form-control" required value={createForm.satuan_waktu} onChange={e => setCreateForm({...createForm, satuan_waktu: e.target.value})}>
                    <option value="hari">Hari</option>
                    <option value="minggu">Minggu</option>
                    <option value="2 minggu">2 Minggu</option>
                    <option value="bulan">Bulan</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Kuantitas (Durasi Sewa)</label>
                <input type="number" step="0.5" className="form-control" required value={createForm.kuantitas} onChange={e => setCreateForm({...createForm, kuantitas: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Catatan (Opsional)</label>
                <textarea className="form-control" rows={3} value={createForm.catatan} onChange={e => setCreateForm({...createForm, catatan: e.target.value})} />
              </div>

              <div style={{ background: "var(--color-bg)", padding: 16, borderRadius: 8, marginTop: 16 }}>
                <div style={{ fontSize: 12, color: "var(--color-muted)" }}>Estimasi Total Tagihan</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: "var(--color-primary)" }}>
                  {formatRupiah(parseFloat(createForm.harga_satuan || 0) * parseFloat(createForm.kuantitas || 0))}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 24 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowCreateModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? "Menyimpan..." : "Simpan & Buat PDF"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
