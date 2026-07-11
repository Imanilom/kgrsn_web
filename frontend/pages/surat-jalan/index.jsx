import { useEffect, useState } from "react";
import { sjApi } from "@/lib/api";
import { formatDate, StatusBadge } from "@/components/Layout";
import Link from "next/link";

export default function SuratJalanPage() {
  const [sjs, setSjs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ status: "", search: "" });

  const load = async () => {
    setLoading(true);
    try {
      const res = await sjApi.list();
      setSjs(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const markReceived = async (id) => {
    if (!confirm("Tandai surat jalan ini sebagai DITERIMA?")) return;
    try { 
      await sjApi.markReceived(id); 
      load();
    }
    catch (err) { 
      alert(err.response?.data?.detail || "Gagal"); 
    }
  };

  const handleExportCSV = () => {
    const headers = ["Nomor SJ", "Dapur", "Tanggal Kirim", "Pengirim", "Penerima", "Status"];
    const rows = filtered.map(sj => [
      sj.nomor_sj,
      sj.dapur?.nama || "",
      sj.tanggal_kirim,
      sj.pengirim || "",
      sj.penerima || "",
      sj.status
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `SuratJalan_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  let filtered = sjs;
  if (filter.status) {
    filtered = filtered.filter(s => s.status === filter.status);
  }
  if (filter.search) {
    const s = filter.search.toLowerCase();
    filtered = filtered.filter(sj => 
      sj.nomor_sj?.toLowerCase().includes(s) || sj.dapur?.nama?.toLowerCase().includes(s)
    );
  }

  const stats = {
    total: filtered.length,
    pending: filtered.filter(s => s.status === "pending").length,
    sent: filtered.filter(s => s.status === "sent").length,
    received: filtered.filter(s => s.status === "received").length,
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Surat Jalan & Pengarsipan</h1>
          <p className="page-subtitle">
            {stats.total} surat jalan · 
            {stats.pending > 0 && `⏳ ${stats.pending} Pending · `}
            {stats.sent > 0 && `📤 ${stats.sent} Dikirim · `}
            {stats.received > 0 && `✅ ${stats.received} Diterima`}
          </p>
        </div>
        <button onClick={handleExportCSV} className="btn btn-ghost" style={{ gap: 6 }}>
          📊 Export CSV
        </button>
      </div>

      <div className="card">
        <div className="filter-bar">
          <div className="search-box">
            <span className="search-box-icon">🔍</span>
            <input 
              placeholder="Cari nomor atau dapur..." 
              value={filter.search} 
              onChange={e => setFilter({ ...filter, search: e.target.value })} 
            />
          </div>
          <select 
            className="form-control" 
            style={{ width: 150 }} 
            value={filter.status}
            onChange={e => setFilter({ ...filter, status: e.target.value })}
          >
            <option value="">Semua Status</option>
            <option value="pending">⏳ Pending</option>
            <option value="sent">📤 Dikirim</option>
            <option value="received">✅ Diterima</option>
          </select>
        </div>

        {loading ? (
          <div className="loading-overlay"><div className="spinner" style={{ width: 32, height: 32 }}></div></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🚚</div>
            <div className="empty-state-title">Belum ada surat jalan</div>
            <div className="empty-state-sub">Buat dari halaman Detail PO</div>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Nomor SJ</th>
                  <th>Dapur Tujuan</th>
                  <th>Tanggal Kirim</th>
                  <th>Pengirim</th>
                  <th>Penerima</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(sj => (
                  <tr key={sj.id}>
                    <td>
                      <Link 
                        href={`/surat-jalan/${sj.id}`} 
                        style={{ fontWeight: 600, color: "var(--color-primary)", textDecoration: "none" }}
                      >
                        {sj.nomor_sj}
                      </Link>
                    </td>
                    <td style={{ fontWeight: 600 }}>{sj.dapur?.nama}</td>
                    <td>{formatDate(sj.tanggal_kirim)}</td>
                    <td>{sj.pengirim || "-"}</td>
                    <td>{sj.penerima || "-"}</td>
                    <td><StatusBadge status={sj.status} /></td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <Link href={`/surat-jalan/${sj.id}`} className="btn btn-ghost btn-sm">
                          👁️ Lihat
                        </Link>
                        <a 
                          href={sjApi.downloadUrl(sj.id)} 
                          target="_blank" 
                          className="btn btn-ghost btn-sm"
                        >
                          📥 PDF
                        </a>
                        {sj.status !== "received" && (
                          <button className="btn btn-success btn-sm" onClick={() => markReceived(sj.id)}>
                            ✓ Diterima
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

SuratJalanPage.title = "Surat Jalan";
SuratJalanPage.subtitle = "Kelola pengiriman ke dapur";
