import { useEffect, useState } from "react";
import { sjApi } from "@/lib/api";
import { formatDate, StatusBadge } from "@/components/Layout";
import { useRouter } from "next/router";
import Link from "next/link";

export default function SuratJalanDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [sj, setSj] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    if (!id) return;
    sjApi.get(id)
      .then(res => setSj(res.data))
      .catch(err => setError(err.response?.data?.detail || "Gagal memuat surat jalan"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleMarkReceived = async () => {
    if (!confirm("Tandai surat jalan ini sebagai DITERIMA?")) return;
    setMarking(true);
    try {
      const res = await sjApi.markReceived(id);
      setSj(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Gagal mengupdate status");
    } finally {
      setMarking(false);
    }
  };

  const handleDownload = async () => {
    try {
      window.open(`/api/surat-jalan/${id}/download`, "_blank");
    } catch (err) {
      alert("Gagal download PDF");
    }
  };

  if (loading) return <div className="page-container"><div className="spinner" style={{ margin: "40px auto" }}></div></div>;
  if (error) return <div className="page-container"><div className="alert alert-error">{error}</div></div>;
  if (!sj) return <div className="page-container"><div className="alert alert-warning">Surat jalan tidak ditemukan</div></div>;

  const statusColor = {
    pending: "#f59e0b",
    sent: "#3b82f6",
    received: "#10b981",
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{sj.nomor_sj}</h1>
          <p className="page-subtitle">Tanggal Kirim: {formatDate(sj.tanggal_kirim)}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/surat-jalan" className="btn btn-ghost">← Kembali</Link>
          <button onClick={handleDownload} className="btn btn-primary" style={{ gap: 6 }}>
            📥 Download PDF
          </button>
        </div>
      </div>

      {/* Status Card */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 4 }}>Status</div>
            <div style={{
              display: "inline-block",
              padding: "6px 12px",
              background: statusColor[sj.status] + "20",
              color: statusColor[sj.status],
              borderRadius: 6,
              fontWeight: 600,
              fontSize: 13,
              textTransform: "uppercase",
              letterSpacing: "0.05em"
            }}>
              {sj.status === "pending" ? "⏳ Pending" : sj.status === "sent" ? "📤 Dikirim" : "✅ Diterima"}
            </div>
          </div>
          {sj.status !== "received" && (
            <button onClick={handleMarkReceived} disabled={marking} className="btn btn-success">
              {marking ? "⏳" : "✅"} Tandai Diterima
            </button>
          )}
        </div>
      </div>

      {/* Dapur & PO Info */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title">Informasi Pengiriman</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 4 }}>Dapur</div>
            <div style={{ fontWeight: 600 }}>{sj.dapur?.nama}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 4 }}>Nomor PO</div>
            <Link href={`/po/${sj.po?.id}`} style={{ color: "var(--color-primary)", fontWeight: 600, textDecoration: "none" }}>
              {sj.po?.nomor_po}
            </Link>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 4 }}>Pengirim</div>
            <div>{sj.pengirim || "-"}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 4 }}>Penerima</div>
            <div>{sj.penerima || "-"}</div>
          </div>
        </div>
      </div>

      {/* Alamat Dapur */}
      {sj.dapur?.alamat && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-title">Alamat Pengiriman</div>
          <div style={{ padding: 12, background: "#f3f4f6", borderRadius: 6, fontSize: 13, lineHeight: 1.6 }}>
            {sj.dapur.alamat}
          </div>
        </div>
      )}

      {/* Items */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title">Detail Item</div>
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Item</th>
                <th style={{ textAlign: "right" }}>Qty</th>
                <th style={{ textAlign: "center" }}>Keterangan</th>
              </tr>
            </thead>
            <tbody>
              {sj.details?.map(d => (
                <tr key={d.id}>
                  <td>{d.nama_item}</td>
                  <td style={{ textAlign: "right" }}>{d.qty} {d.satuan || ""}</td>
                  <td style={{ textAlign: "center", fontSize: 13, color: "#999" }}>
                    {d.keterangan || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Catatan */}
      {sj.catatan && (
        <div className="card">
          <div className="card-title">Catatan</div>
          <div style={{ padding: 12, background: "#f3f4f6", borderRadius: 6, fontSize: 13, lineHeight: 1.6 }}>
            {sj.catatan}
          </div>
        </div>
      )}
    </div>
  );
}
