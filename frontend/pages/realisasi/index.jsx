import { useEffect, useState } from "react";
import { realisasiApi, dapurApi } from "@/lib/api";
import { formatRupiah, formatDate, StatusBadge } from "@/components/Layout";
import Link from "next/link";

const STATUS_OPTS = [
  { value: "", label: "Semua Status" },
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Diajukan" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Ditolak" },
];

const STATUS_COLOR = {
  draft: "draft",
  submitted: "warning",
  approved: "approved",
  rejected: "cancelled",
};

export default function RealisasiPage() {
  const [list, setList] = useState([]);
  const [dapur, setDapur] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ dapur_id: "", status: "", search: "" });
  const [user, setUser] = useState(null);

  const load = async () => {
    setLoading(true);
    const params = {};
    if (filter.dapur_id) params.dapur_id = filter.dapur_id;
    if (filter.status) params.status = filter.status;
    try {
      const res = await realisasiApi.list(params);
      setList(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    try { setUser(JSON.parse(localStorage.getItem("user"))); } catch {}
    dapurApi.list({ is_active: true }).then(r => setDapur(r.data)).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [filter.dapur_id, filter.status]);

  const handleApprove = async (id) => {
    if (!confirm("Approve PO Realisasi ini?")) return;
    try { await realisasiApi.approve(id); load(); }
    catch (err) { alert(err.response?.data?.detail || "Gagal"); }
  };

  const handleReject = async (id) => {
    if (!confirm("Tolak PO Realisasi ini?")) return;
    try { await realisasiApi.reject(id); load(); }
    catch (err) { alert(err.response?.data?.detail || "Gagal"); }
  };

  const isAdmin = user?.role && ["admin", "super_admin", "finance"].includes(user.role);
  const isAkuntan = user?.role && ["akuntan", "operator"].includes(user.role);

  const filtered = filter.search
    ? list.filter(r => {
        const s = filter.search.toLowerCase();
        return r.nomor_realisasi?.toLowerCase().includes(s) ||
          r.po?.nomor_po?.toLowerCase().includes(s) ||
          r.dapur?.nama?.toLowerCase().includes(s);
      })
    : list;

  const totalApproved = filtered.filter(r => r.status === "approved")
    .reduce((s, r) => s + parseFloat(r.total_nilai_jual || 0), 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">PO Realisasi</h1>
          <p className="page-subtitle">
            {filtered.length} realisasi · Total nilai jual approved: {formatRupiah(totalApproved)}
          </p>
        </div>
        {isAkuntan && (
          <Link href="/realisasi/create" className="btn btn-primary">
            ➕ Buat Realisasi
          </Link>
        )}
      </div>

      <div className="card">
        <div className="filter-bar">
          <div className="search-box">
            <span className="search-box-icon">🔍</span>
            <input
              placeholder="Cari nomor realisasi, PO, atau dapur..."
              value={filter.search}
              onChange={e => setFilter({ ...filter, search: e.target.value })}
            />
          </div>
          {isAdmin && (
            <select className="form-control" style={{ width: 180 }} value={filter.dapur_id}
              onChange={e => setFilter({ ...filter, dapur_id: e.target.value })}>
              <option value="">Semua Dapur</option>
              {dapur.map(d => <option key={d.id} value={d.id}>{d.nama}</option>)}
            </select>
          )}
          <select className="form-control" style={{ width: 150 }} value={filter.status}
            onChange={e => setFilter({ ...filter, status: e.target.value })}>
            {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="loading-overlay"><div className="spinner" style={{ width: 32, height: 32 }}></div></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">✅</div>
            <div className="empty-state-title">Belum ada PO Realisasi</div>
            <div className="empty-state-sub">
              {isAkuntan ? "Klik \"Buat Realisasi\" untuk membuat realisasi dari PO yang sudah approved." : "Belum ada data."}
            </div>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Nomor Realisasi</th>
                  <th>PO Referensi</th>
                  <th>Dapur</th>
                  <th>Tanggal</th>
                  <th style={{ textAlign: "right" }}>Nilai Beli</th>
                  <th style={{ textAlign: "right" }}>Nilai Jual</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600, color: "var(--color-primary)" }}>
                      <Link href={`/realisasi/${r.id}`}>{r.nomor_realisasi}</Link>
                    </td>
                    <td style={{ fontSize: 12, color: "var(--color-muted)" }}>
                      {r.po?.nomor_po || "-"}
                    </td>
                    <td>{r.dapur?.nama}</td>
                    <td>{formatDate(r.tanggal_realisasi)}</td>
                    <td style={{ textAlign: "right" }} className="rupiah">
                      {formatRupiah(r.total_nilai)}
                    </td>
                    <td style={{ textAlign: "right", color: "var(--color-success)", fontWeight: 700 }} className="rupiah">
                      {formatRupiah(r.total_nilai_jual)}
                    </td>
                    <td>
                      <span className={`badge badge-${STATUS_COLOR[r.status] || "draft"}`}>
                        {r.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <Link href={`/realisasi/${r.id}`} className="btn btn-ghost btn-sm">
                          👁 Detail
                        </Link>
                        {isAdmin && r.status === "submitted" && (
                          <>
                            <button className="btn btn-success btn-sm" onClick={() => handleApprove(r.id)}>
                              ✓ Approve
                            </button>
                            <button className="btn btn-ghost btn-sm" style={{ color: "var(--color-danger)" }}
                              onClick={() => handleReject(r.id)}>
                              ✕ Tolak
                            </button>
                          </>
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

RealisasiPage.title = "PO Realisasi";
RealisasiPage.subtitle = "Realisasi qty aktual dari PO yang sudah approved";
