import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { dapurApi, invoiceApi } from "@/lib/api";
import { formatDate, formatRupiah } from "@/components/Layout";

function formatQty(value) {
  return Number(value || 0).toLocaleString("id-ID", { maximumFractionDigits: 3 });
}

function getMonthStart() {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
}

export default function InvoiceRecapPage() {
  const [dapur, setDapur] = useState([]);
  const [filter, setFilter] = useState({
    dapur_id: "",
    tanggal_dari: getMonthStart(),
    tanggal_sampai: new Date().toISOString().slice(0, 10),
  });
  const [report, setReport] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    dapurApi.list({ is_active: true })
      .then(response => setDapur(response.data || []))
      .catch(() => setError("Gagal memuat daftar dapur"));
  }, []);

  const load = useCallback(async () => {
    if (!filter.tanggal_dari || !filter.tanggal_sampai) return;
    setLoading(true);
    setError("");
    setExpanded({});
    try {
      const params = {
        tanggal_dari: filter.tanggal_dari,
        tanggal_sampai: filter.tanggal_sampai,
      };
      if (filter.dapur_id) params.dapur_id = filter.dapur_id;
      const response = await invoiceApi.recap(params);
      setReport(response.data);
    } catch (err) {
      setReport(null);
      setError(err.response?.data?.detail || "Gagal memuat rekap invoice");
    } finally {
      setLoading(false);
    }
  }, [filter.dapur_id, filter.tanggal_dari, filter.tanggal_sampai]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const toggleItem = (index) => {
    setExpanded(current => ({ ...current, [index]: !current[index] }));
  };

  const updateFilter = (field, value) => {
    setFilter(current => ({ ...current, [field]: value }));
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Rekap Item Invoice</h1>
          <p className="page-subtitle">Akumulasi pesanan per dapur dan rincian invoice sumber</p>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="filter-bar" style={{ flexWrap: "wrap", gap: 10 }}>
          <select
            className="form-control"
            style={{ width: 210 }}
            value={filter.dapur_id}
            onChange={event => updateFilter("dapur_id", event.target.value)}
          >
            <option value="">Semua Dapur</option>
            {dapur.map(item => <option key={item.id} value={item.id}>{item.nama}</option>)}
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-muted)" }}>
            Dari
            <input
              type="date"
              className="form-control"
              value={filter.tanggal_dari}
              onChange={event => updateFilter("tanggal_dari", event.target.value)}
            />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-muted)" }}>
            S/d
            <input
              type="date"
              className="form-control"
              value={filter.tanggal_sampai}
              onChange={event => updateFilter("tanggal_sampai", event.target.value)}
            />
          </label>
          <button className="btn btn-primary" onClick={load} disabled={loading}>
            {loading ? "Memuat..." : "Tampilkan"}
          </button>
        </div>
      </div>

      {report && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 20 }}>
            {[
              { label: "Invoice", value: report.summary.total_invoice },
              { label: "Jenis Item", value: report.summary.total_item },
              { label: "Total Qty", value: formatQty(report.summary.total_qty) },
              { label: "Total Nilai", value: formatRupiah(report.summary.total_nilai) },
            ].map(summary => (
              <div key={summary.label} className="card" style={{ padding: 16 }}>
                <div style={{ color: "var(--color-muted)", fontSize: 12, marginBottom: 6 }}>{summary.label}</div>
                <div style={{ fontWeight: 800, fontSize: 18 }}>{summary.value}</div>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">Item yang Dipesan</div>
              <div style={{ color: "var(--color-muted)", fontSize: 12 }}>
                {formatDate(report.tanggal_dari)} s/d {formatDate(report.tanggal_sampai)}
              </div>
            </div>
            {loading ? (
              <div className="loading-overlay"><div className="spinner" style={{ width: 32, height: 32 }} /></div>
            ) : report.items.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📭</div>
                <div className="empty-state-title">Tidak ada item dipesan</div>
                <div className="empty-state-sub">Coba ubah dapur atau rentang tanggal.</div>
              </div>
            ) : (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 44 }} />
                      <th>Item</th>
                      <th>Satuan</th>
                      <th style={{ textAlign: "right" }}>Qty Akumulasi</th>
                      <th style={{ textAlign: "right" }}>Total Nilai</th>
                      <th style={{ textAlign: "center" }}>Invoice</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.items.map((item, index) => (
                      <>
                        <tr key={`item-${index}`}>
                          <td>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => toggleItem(index)}
                              aria-label={`${expanded[index] ? "Tutup" : "Buka"} breakdown ${item.nama_item}`}
                            >
                              {expanded[index] ? "▾" : "▸"}
                            </button>
                          </td>
                          <td style={{ fontWeight: 700 }}>{item.nama_item || "-"}</td>
                          <td>{item.satuan || "-"}</td>
                          <td style={{ textAlign: "right", fontWeight: 700 }}>{formatQty(item.qty_total)}</td>
                          <td style={{ textAlign: "right", fontWeight: 700 }} className="rupiah">{formatRupiah(item.total_nilai)}</td>
                          <td style={{ textAlign: "center" }}>{item.invoices.length}</td>
                        </tr>
                        {expanded[index] && (
                          <tr key={`detail-${index}`}>
                            <td colSpan={6} style={{ background: "var(--color-bg)", padding: 0 }}>
                              <div style={{ padding: "10px 18px 14px 58px" }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-muted)", marginBottom: 6 }}>BREAKDOWN INVOICE</div>
                                <table>
                                  <thead>
                                    <tr>
                                      <th>Invoice</th>
                                      <th>Dapur</th>
                                      <th>Tanggal</th>
                                      <th style={{ textAlign: "right" }}>Qty</th>
                                      <th style={{ textAlign: "right" }}>Subtotal</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {item.invoices.map(invoice => (
                                      <tr key={`${invoice.invoice_id}-${invoice.qty}`}>
                                        <td><Link href={`/invoice/${invoice.invoice_id}`} style={{ color: "var(--color-primary)", fontWeight: 600 }}>{invoice.nomor_invoice}</Link></td>
                                        <td>{invoice.dapur_nama}</td>
                                        <td>{formatDate(invoice.tanggal_invoice)}</td>
                                        <td style={{ textAlign: "right" }}>{formatQty(invoice.qty)}</td>
                                        <td style={{ textAlign: "right" }} className="rupiah">{formatRupiah(invoice.subtotal)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
