import { useEffect, useState } from "react";
import { poApi, dapurApi } from "@/lib/api";
import { formatRupiah, formatDate, StatusBadge } from "@/components/Layout";
import Link from "next/link";

export default function POPage() {
  const [pos, setPos] = useState([]);
  const [dapur, setDapur] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ dapur_id: "", status: "", search: "", jenis_po: "" });
  const [error, setError] = useState("");
  const [user, setUser] = useState(null);

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem("user"));
      setUser(u);
    } catch {}
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filter.dapur_id) params.dapur_id = filter.dapur_id;
      if (filter.status) params.status = filter.status;
      if (filter.jenis_po) params.jenis_po = filter.jenis_po;
      const res = await poApi.list(params);
      let data = res.data;
      if (filter.search) {
        const s = filter.search.toLowerCase();
        data = data.filter(p => p.nomor_po?.toLowerCase().includes(s) || p.dapur?.nama?.toLowerCase().includes(s));
      }
      setPos(data);
    } catch (err) {
      setError("Gagal memuat data PO");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    dapurApi.list({ is_active: true }).then(r => setDapur(r.data)).catch(console.error);
  }, []);

  useEffect(() => { load(); }, [filter.dapur_id, filter.status, filter.jenis_po]);

  const handleApprove = async (id) => {
    if (!confirm("Approve PO ini?")) return;
    try {
      await poApi.approve(id);
      load();
    } catch (err) {
      alert(err.response?.data?.detail || "Gagal approve");
    }
  };

  const filtered = pos.filter(p => {
    const s = filter.search ? filter.search.toLowerCase() : "";
    const matchSearch = !s || p.nomor_po?.toLowerCase().includes(s) || p.dapur?.nama?.toLowerCase().includes(s);
    const matchJenis = !filter.jenis_po || p.jenis_po === filter.jenis_po;
    return matchSearch && matchJenis;
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Daftar Purchase Order</h1>
          <p className="page-subtitle">{filtered.length} PO ditemukan</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/po/create" className="btn btn-outline">
            ➕ Buat PO Manual
          </Link>
          <Link href="/po/import" className="btn btn-primary">
            📥 Import PO dari Tabel
          </Link>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        {/* Filter Bar */}
        <div className="filter-bar">
          <div className="search-box">
            <span className="search-box-icon">🔍</span>
            <input
              placeholder="Cari nomor PO atau dapur..."
              value={filter.search}
              onChange={e => setFilter({ ...filter, search: e.target.value })}
            />
          </div>
          {(!user || user.role !== 'operator') && (
            <select
              className="form-control"
              style={{ width: 180 }}
              value={filter.dapur_id}
              onChange={e => setFilter({ ...filter, dapur_id: e.target.value })}
            >
              <option value="">Semua Dapur</option>
              {dapur.map(d => <option key={d.id} value={d.id}>{d.nama}</option>)}
            </select>
          )}
          <select
            className="form-control"
            style={{ width: 160 }}
            value={filter.status}
            onChange={e => setFilter({ ...filter, status: e.target.value })}
          >
            <option value="">Semua Status</option>
            <option value="draft">Draft</option>
            <option value="approved">Approved</option>
            <option value="delivered">Delivered</option>
            <option value="invoiced">Invoiced</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select
            className="form-control"
            style={{ width: 160 }}
            value={filter.jenis_po}
            onChange={e => setFilter({ ...filter, jenis_po: e.target.value })}
          >
            <option value="">Semua Kategori</option>
            <option value="bahan_baku">📦 Bahan Baku</option>
            <option value="ops">⚙️ Operasional / OPS</option>
          </select>
        </div>

        {loading ? (
          <div className="loading-overlay"><div className="spinner" style={{ width: 32, height: 32 }}></div></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <div className="empty-state-title">Belum ada PO</div>
            <div className="empty-state-sub">Buat PO manual atau import dari tabel untuk memulai</div>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Nomor PO</th>
                  <th>Dapur</th>
                  <th>Kategori</th>
                  <th>Tanggal PO</th>
                  <th>Tanggal Kirim</th>
                  <th style={{ textAlign: "right" }}>Total Nilai</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(po => (
                  <tr key={po.id}>
                    <td>
                      <Link href={`/po/${po.id}`} style={{ color: "var(--color-primary)", fontWeight: 600, textDecoration: "none" }}>
                        {po.nomor_po}
                      </Link>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{po.dapur?.nama}</div>
                      <div style={{ fontSize: 11, color: "var(--color-muted)" }}>{po.dapur?.kode}</div>
                    </td>
                    <td>
                      <span style={{
                        padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                        background: po.jenis_po === "ops" ? "rgba(245,158,11,0.12)" : "rgba(99,102,241,0.12)",
                        color: po.jenis_po === "ops" ? "#d97706" : "#4f46e5"
                      }}>
                        {po.jenis_po === "ops" ? "⚙️ OPS" : "📦 Bahan Baku"}
                      </span>
                    </td>
                    <td>{formatDate(po.tanggal_po)}</td>
                    <td>{formatDate(po.tanggal_kirim) || "-"}</td>
                    <td style={{ textAlign: "right" }} className="rupiah">{formatRupiah(po.total_nilai)}</td>
                    <td><StatusBadge status={po.status} /></td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <Link href={`/po/${po.id}`} className="btn btn-ghost btn-sm">👁 Detail</Link>
                        {po.status === "draft" && (
                          <button className="btn btn-success btn-sm" onClick={() => handleApprove(po.id)}>
                            ✓ Approve
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
    </div>
  );
}

POPage.title = "Purchase Order";
POPage.subtitle = "Kelola semua PO masuk dari dapur";
