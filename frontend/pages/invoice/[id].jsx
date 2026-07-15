import { useEffect, useState } from "react";
import { invoiceApi } from "@/lib/api";
import { formatRupiah, formatDate } from "@/components/Layout";
import { useRouter } from "next/router";
import Link from "next/link";

export default function InvoiceDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [marking, setMarking] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData) setUser(JSON.parse(userData));
  }, []);
  const isAdmin = ["super_admin", "admin"].includes(user?.role);

  useEffect(() => {
    if (!id) return;
    invoiceApi.get(id)
      .then(res => setInvoice(res.data))
      .catch(err => setError(err.response?.data?.detail || "Gagal memuat invoice"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleMarkPaid = async () => {
    if (!confirm("Tandai invoice ini sebagai LUNAS?")) return;
    setMarking(true);
    try {
      const res = await invoiceApi.markPaid(id);
      setInvoice(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Gagal mengupdate status");
    } finally {
      setMarking(false);
    }
  };

  const handleDownload = async () => {
    try {
      const res = await invoiceApi.download(id);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `Invoice_${invoice?.nomor_invoice?.replace(/\//g, "-")}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentElement.removeChild(link);
    } catch (err) {
      alert("Gagal download PDF");
    }
  };

  if (loading) return <div className="page-container"><div className="spinner" style={{ margin: "40px auto" }}></div></div>;
  if (error) return <div className="page-container"><div className="alert alert-error">{error}</div></div>;
  if (!invoice) return <div className="page-container"><div className="alert alert-warning">Invoice tidak ditemukan</div></div>;

  const statusColor = {
    unpaid: "#f59e0b",
    paid: "#10b981",
    cancelled: "#ef4444",
  };

  // Hitung margin total
  let totalBeli = 0, totalJual = 0;
  (invoice.details || []).forEach(d => {
    totalBeli += parseFloat(d.qty || 0) * parseFloat(d.harga_beli || 0);
    totalJual += parseFloat(d.qty || 0) * parseFloat(d.harga_jual || 0);
  });
  const marginTotal = totalJual - totalBeli;
  const marginPct = totalBeli > 0 ? (marginTotal / totalBeli * 100).toFixed(1) : 0;

  const getMarginColor = (pct) => {
    const n = parseFloat(pct);
    if (n >= 15) return "#10b981";
    if (n >= 10) return "#f59e0b";
    return "#ef4444";
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{invoice.nomor_invoice}</h1>
          <p className="page-subtitle">Tanggal: {formatDate(invoice.tanggal_invoice)}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/invoice" className="btn btn-ghost">← Kembali</Link>
          <button onClick={handleDownload} className="btn btn-primary" style={{ gap: 6 }}>
            📥 Download PDF
          </button>
        </div>
      </div>

      {/* Status & Total Card */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 4 }}>Status</div>
            <div style={{
              display: "inline-block",
              padding: "6px 12px",
              background: statusColor[invoice.status] + "20",
              color: statusColor[invoice.status],
              borderRadius: 6,
              fontWeight: 600,
              fontSize: 13,
              textTransform: "uppercase",
              letterSpacing: "0.05em"
            }}>
              {invoice.status === "unpaid" ? "⏳ Belum Lunas" : invoice.status === "paid" ? "✅ Lunas" : "❌ Batal"}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 4 }}>Total Tagihan</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: statusColor[invoice.status] }}>
              {formatRupiah(invoice.total)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 4 }}>Margin</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: getMarginColor(marginPct) }}>
              {marginPct}%
            </div>
            <div style={{ fontSize: 12, color: "var(--color-muted)" }}>{formatRupiah(marginTotal)}</div>
          </div>
          {invoice.status === "unpaid" && ["super_admin", "admin", "finance"].includes(user?.role) && (
            <button onClick={handleMarkPaid} disabled={marking} className="btn btn-success">
              {marking ? "⏳" : "✅"} Tandai Lunas
            </button>
          )}
        </div>
      </div>

      {/* Dapur Info */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title">Informasi Dapur</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 4 }}>Nama Dapur</div>
            <div style={{ fontWeight: 600 }}>{invoice.dapur?.nama}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 4 }}>Alamat</div>
            <div style={{ fontSize: 13, color: "#666" }}>{invoice.dapur?.alamat || "-"}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 4 }}>Kontak</div>
            <div style={{ fontWeight: 500 }}>{invoice.dapur?.kontak || "-"}</div>
          </div>
        </div>
      </div>

      {/* Jatuh Tempo */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 4 }}>Tanggal Invoice</div>
            <div style={{ fontWeight: 600 }}>{formatDate(invoice.tanggal_invoice)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 4 }}>Jatuh Tempo</div>
            <div style={{ fontWeight: 600 }}>{formatDate(invoice.jatuh_tempo)}</div>
          </div>
          {invoice.po_id && (
            <div>
              <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 4 }}>Nomor PO</div>
              <div style={{ fontWeight: 600 }}>
                <Link href={`/po/${invoice.po_id}`} style={{ color: "var(--color-primary)", textDecoration: "none" }}>
                  #{invoice.po_id}
                </Link>
              </div>
            </div>
          )}
          {invoice.realisasi_id && (
            <div>
              <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 4 }}>Nomor Realisasi</div>
              <div style={{ fontWeight: 600 }}>
                <Link href={`/realisasi/${invoice.realisasi_id}`} style={{ color: "var(--color-primary)", textDecoration: "none" }}>
                  #{invoice.realisasi_id}
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Items */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title">Detail Item</div>
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Item</th>
                <th style={{ textAlign: "right" }}>Qty PO</th>
                <th style={{ textAlign: "right" }}>Qty Realisasi</th>
                {isAdmin && <th style={{ textAlign: "right" }}>H. Beli</th>}
                <th style={{ textAlign: "right" }}>{isAdmin ? "H. Jual" : "Harga"}</th>
                {isAdmin && <th style={{ textAlign: "center" }}>Margin</th>}
                <th style={{ textAlign: "right" }}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {invoice.details?.map(d => {
                const mb = parseFloat(d.harga_beli || 0);
                const mj = parseFloat(d.harga_jual || 0);
                const mp = mb > 0 ? ((mj - mb) / mb * 100).toFixed(1) : 0;
                return (
                  <tr key={d.id}>
                    <td style={{ fontWeight: 600 }}>{d.nama_item}</td>
                    <td style={{ textAlign: "right", color: "var(--color-muted)" }}>
                      {d.qty_po != null ? `${parseFloat(d.qty_po)} ${d.satuan || ""}` : `${parseFloat(d.qty)} ${d.satuan || ""}`}
                    </td>
                    <td style={{ textAlign: "right", color: "var(--color-muted)" }}>
                      {d.qty_realisasi != null
                        ? <span style={{ fontWeight: parseFloat(d.qty_realisasi) !== parseFloat(d.qty_po) ? 700 : 400, color: parseFloat(d.qty_realisasi) !== parseFloat(d.qty_po) ? "#f59e0b" : "inherit" }}>
                            {parseFloat(d.qty_realisasi)} {d.satuan || ""}
                          </span>
                        : "-"}
                    </td>
                    {isAdmin && <td style={{ textAlign: "right", color: "#64748b" }}>{formatRupiah(d.harga_beli)}</td>}
                    <td style={{ textAlign: "right", color: "#10b981", fontWeight: 600 }}>{formatRupiah(d.harga_jual)}</td>
                    {isAdmin && (
                      <td style={{ textAlign: "center" }}>
                        <span style={{
                          padding: "2px 8px", borderRadius: 99, fontSize: 12, fontWeight: 700,
                          background: getMarginColor(mp) + "20", color: getMarginColor(mp),
                        }}>
                          {mp}%
                        </span>
                      </td>
                    )}
                    <td style={{ textAlign: "right", fontWeight: 600 }}>{formatRupiah(d.subtotal)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "2px solid var(--color-border)" }}>
                <td colSpan="6" style={{ textAlign: "right", fontWeight: 600 }}>Total</td>
                <td style={{ textAlign: "right", fontWeight: 700, fontSize: 16 }}>{formatRupiah(invoice.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Catatan */}
      {invoice.catatan && (
        <div className="card">
          <div className="card-title">Catatan</div>
          <div style={{ padding: 12, background: "#f3f4f6", borderRadius: 6, fontSize: 13, lineHeight: 1.6 }}>
            {invoice.catatan}
          </div>
        </div>
      )}
    </div>
  );
}
