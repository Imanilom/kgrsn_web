import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { reimbursementApi, supplierApi } from "@/lib/api";

const formatRupiah = (v) => `Rp ${parseFloat(v || 0).toLocaleString("id-ID")}`;
const formatDate = (d) => d ? new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "-";

const STATUS_MAP = {
  pending: { label: "Pending", color: "#f59e0b", bg: "#fef3c7" },
  approved: { label: "Disetujui", color: "#10b981", bg: "#d1fae5" },
  rejected: { label: "Ditolak", color: "#ef4444", bg: "#fee2e2" },
  paid: { label: "Sudah Dibayar", color: "#6366f1", bg: "#ede9fe" },
};

export default function ReimbursementPage() {
  const [list, setList] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ status: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [detail, setDetail] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [editSupplier, setEditSupplier] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filter.status) params.status = filter.status;
      const [rRes, sRes] = await Promise.all([reimbursementApi.list(params), supplierApi.list()]);
      setList(rRes.data);
      setSuppliers(sRes.data);
    } catch { setError("Gagal memuat data reimbursement"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [filter.status]);

  const handleUpdateStatus = async (id, status) => {
    setUpdating(true);
    try {
      const payload = { status };
      if (editSupplier) payload.supplier_id = parseInt(editSupplier);
      await reimbursementApi.update(id, payload);
      setSuccess("Status diperbarui");
      setDetail(null); load();
    } catch (err) { setError(err.response?.data?.detail || "Gagal memperbarui"); }
    finally { setUpdating(false); }
  };

  const handleUploadBukti = async (id) => {
    if (!uploadFile) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", uploadFile);
      await reimbursementApi.uploadBukti(id, fd);
      setSuccess("Bukti berhasil diupload, status diubah ke Sudah Dibayar");
      setUploadFile(null); setDetail(null); load();
    } catch (err) { setError(err.response?.data?.detail || "Gagal upload bukti"); }
    finally { setUploading(false); }
  };

  const totalPending = list.filter(r => r.status === "pending").reduce((s, r) => s + parseFloat(r.total || 0), 0);
  const totalPaid = list.filter(r => r.status === "paid").reduce((s, r) => s + parseFloat(r.total || 0), 0);

  const inp = { width: "100%", padding: "8px 12px", border: "1.5px solid var(--color-border)", borderRadius: 8, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" };

  return (
    <Layout title="Reimbursement">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Reimbursement</h1>
          <p style={{ color: "var(--color-muted)", margin: "4px 0 0", fontSize: 13 }}>Item ekstra di realisasi yang tidak ada di PO asli — perlu dibayar ke supplier</p>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}<button onClick={() => setError("")} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer" }}>x</button></div>}
      {success && <div className="alert alert-success" style={{ marginBottom: 16 }}>{success}<button onClick={() => setSuccess("")} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer" }}>x</button></div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14, marginBottom: 20 }}>
        <div style={{ background: "white", borderRadius: 12, padding: "14px 18px", border: "1px solid var(--color-border)", borderTop: "3px solid #f59e0b" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase", marginBottom: 4 }}>Pending</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#f59e0b" }}>{formatRupiah(totalPending)}</div>
          <div style={{ fontSize: 12, color: "var(--color-muted)" }}>{list.filter(r => r.status === "pending").length} item</div>
        </div>
        <div style={{ background: "white", borderRadius: 12, padding: "14px 18px", border: "1px solid var(--color-border)", borderTop: "3px solid #6366f1" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase", marginBottom: 4 }}>Sudah Dibayar</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#6366f1" }}>{formatRupiah(totalPaid)}</div>
          <div style={{ fontSize: 12, color: "var(--color-muted)" }}>{list.filter(r => r.status === "paid").length} item</div>
        </div>
        <div style={{ background: "white", borderRadius: 12, padding: "14px 18px", border: "1px solid var(--color-border)", borderTop: "3px solid #10b981" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase", marginBottom: 4 }}>Total Semua</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#10b981" }}>{formatRupiah(list.reduce((s,r) => s + parseFloat(r.total||0), 0))}</div>
          <div style={{ fontSize: 12, color: "var(--color-muted)" }}>{list.length} item</div>
        </div>
      </div>

      <div style={{ background: "white", borderRadius: 12, padding: "12px 16px", marginBottom: 16, border: "1px solid var(--color-border)", display: "flex", gap: 12, alignItems: "flex-end" }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase", marginBottom: 4 }}>Filter Status</div>
          <select value={filter.status} onChange={e => setFilter({ ...filter, status: e.target.value })} style={{ ...inp, width: 180 }}>
            <option value="">Semua Status</option>
            {Object.entries(STATUS_MAP).map(([val, s]) => <option key={val} value={val}>{s.label}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60 }}><div className="spinner" style={{ margin: "0 auto" }} /></div>
      ) : list.length === 0 ? (
        <div style={{ background: "white", borderRadius: 14, padding: "60px 20px", textAlign: "center", border: "1px solid var(--color-border)" }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Belum ada data reimbursement</div>
          <div style={{ fontSize: 13, color: "var(--color-muted)" }}>Item akan muncul otomatis saat ada item ekstra di realisasi PO yang diapprove</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Dapur</th>
                  <th>Nama Item</th>
                  <th>Qty</th>
                  <th>Satuan</th>
                  <th style={{ textAlign: "right" }}>Harga</th>
                  <th style={{ textAlign: "right" }}>Total</th>
                  <th>Supplier</th>
                  <th>Rekening Relawan</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {list.map(r => {
                  const s = STATUS_MAP[r.status] || { label: r.status, color: "#64748b", bg: "#f1f5f9" };
                  return (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600 }}>{r.dapur?.nama || "-"}</td>
                      <td>{r.nama_item}</td>
                      <td>{parseFloat(r.qty).toLocaleString("id-ID")}</td>
                      <td style={{ color: "var(--color-muted)" }}>{r.satuan || "-"}</td>
                      <td style={{ textAlign: "right" }}>{formatRupiah(r.harga_satuan)}</td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>{formatRupiah(r.total)}</td>
                      <td>
                        {r.supplier ? (
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 12 }}>{r.supplier.nama}</div>
                            {r.supplier.rekening && <div style={{ fontSize: 11, color: "var(--color-muted)" }}>{r.supplier.nama_bank} - {r.supplier.rekening}</div>}
                          </div>
                        ) : <span style={{ color: "var(--color-muted)" }}>Belum diset</span>}
                      </td>
                      <td>
                        {r.rekening_relawan ? (
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 12 }}>{r.nama_relawan}</div>
                            <div style={{ fontSize: 11, color: "#6366f1", fontWeight: 600 }}>{r.nama_bank_relawan} · {r.rekening_relawan}</div>
                          </div>
                        ) : <span style={{ color: "var(--color-muted)" }}>—</span>}
                      </td>
                      <td><span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: s.bg, color: s.color }}>{s.label}</span></td>
                      <td>
                        <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => { setDetail(r); setEditSupplier(r.supplier_id || ""); }}>
                          Detail
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {detail && (
        <div onClick={() => setDetail(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: 16, width: "100%", maxWidth: 520, boxShadow: "0 24px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--color-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 17, fontWeight: 800 }}>Detail Reimbursement #{detail.id}</div>
              <button onClick={() => setDetail(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--color-muted)" }}>x</button>
            </div>
            <div style={{ padding: "20px 24px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                <div><div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase", marginBottom: 2 }}>Dapur</div><div style={{ fontWeight: 600 }}>{detail.dapur?.nama}</div></div>
                <div><div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase", marginBottom: 2 }}>Total</div><div style={{ fontWeight: 800, color: "#ef4444" }}>{formatRupiah(detail.total)}</div></div>
                <div style={{ gridColumn: "span 2" }}><div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase", marginBottom: 2 }}>Item</div><div style={{ fontWeight: 600 }}>{detail.nama_item} — {parseFloat(detail.qty).toLocaleString("id-ID")} {detail.satuan}</div></div>
              </div>

              {detail.rekening_relawan && (
                <div style={{ marginBottom: 14, padding: "10px 14px", background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#6d28d9", textTransform: "uppercase", marginBottom: 2 }}>💳 Rekening Relawan Dapur</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#4c1d95" }}>{detail.nama_relawan}</div>
                  <div style={{ fontSize: 12, color: "#5b21b6", fontWeight: 600 }}>{detail.nama_bank_relawan} · {detail.rekening_relawan}</div>
                </div>
              )}

              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase", marginBottom: 4 }}>Supplier (yang akan dibayar)</div>
                <select value={editSupplier} onChange={e => setEditSupplier(e.target.value)} style={inp}>
                  <option value="">-- Pilih Supplier --</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.nama} {s.rekening ? `(${s.nama_bank} - ${s.rekening})` : ""}</option>)}
                </select>
              </div>

              {detail.status === "pending" && (
                <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                  <button className="btn btn-primary" style={{ flex: 1 }} disabled={updating} onClick={() => handleUpdateStatus(detail.id, "approved")}>
                    Setujui
                  </button>
                  <button className="btn" style={{ flex: 1, background: "rgba(239,68,68,0.08)", color: "#dc2626", border: "1px solid rgba(239,68,68,0.2)" }} disabled={updating} onClick={() => handleUpdateStatus(detail.id, "rejected")}>
                    Tolak
                  </button>
                </div>
              )}

              {["pending", "approved"].includes(detail.status) && (
                <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase", marginBottom: 8 }}>Upload Bukti Pembayaran</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input type="file" accept="image/*,.pdf" onChange={e => setUploadFile(e.target.files[0])} style={{ flex: 1, fontSize: 12 }} />
                    <button className="btn btn-primary" style={{ whiteSpace: "nowrap" }} disabled={!uploadFile || uploading} onClick={() => handleUploadBukti(detail.id)}>
                      {uploading ? "Uploading..." : "Upload & Tandai Lunas"}
                    </button>
                  </div>
                </div>
              )}
              {detail.bukti_path && <div style={{ marginTop: 12, fontSize: 12, color: "#10b981" }}>Bukti sudah diupload</div>}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
