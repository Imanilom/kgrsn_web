import { useEffect, useState } from "react";
import { invoiceApi, dapurApi } from "@/lib/api";
import { formatRupiah, formatDate, StatusBadge } from "@/components/Layout";
import Link from "next/link";

export default function InvoicePage() {
  const [invoices, setInvoices] = useState([]);
  const [dapur, setDapur] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, total: 0, total_pages: 1, size: 50 });
  const [listSummary, setListSummary] = useState({ total_value: 0, unpaid_value: 0 });
  const [filter, setFilter] = useState({
    dapur_id: "", status: "", search: "",
    tanggal_dari: "", tanggal_sampai: "",
  });
  const [marginModal, setMarginModal] = useState(null);
  const [marginLoading, setMarginLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData) setUser(JSON.parse(userData));
  }, []);
  const isAdmin = ["super_admin", "admin"].includes(user?.role);

  const load = async (page = currentPage) => {
    setLoading(true);
    const params = { page, limit: 50 };
    if (filter.dapur_id) params.dapur_id = filter.dapur_id;
    if (filter.status) params.status = filter.status;
    if (filter.tanggal_dari) params.tanggal_dari = filter.tanggal_dari;
    if (filter.tanggal_sampai) params.tanggal_sampai = filter.tanggal_sampai;
    if (filter.search) params.search = filter.search;
    try {
      const res = await invoiceApi.list(params);
      const body = res.data;
      setInvoices(body.data || []);
      setPagination({ page: body.page, total: body.total, total_pages: body.total_pages, size: body.size });
      setListSummary({ total_value: body.total_value || 0, unpaid_value: body.unpaid_value || 0 });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { dapurApi.list({ is_active: true }).then(r => setDapur(r.data)); }, []);
  useEffect(() => { setCurrentPage(1); load(1); }, [filter.dapur_id, filter.status, filter.tanggal_dari, filter.tanggal_sampai, filter.search]);

  const handleMarkPaid = async (id) => {
    if (!confirm("Tandai invoice ini sebagai LUNAS?")) return;
    try { await invoiceApi.markPaid(id); load(); }
    catch (err) { alert(err.response?.data?.detail || "Gagal"); }
  };

  const handleCekMargin = async (id) => {
    setMarginLoading(true);
    try {
      const res = await invoiceApi.margin(id);
      setMarginModal(res.data);
    } catch (err) {
      alert(err.response?.data?.detail || "Gagal memuat margin");
    } finally {
      setMarginLoading(false);
    }
  };

  const handleExportCSV = async () => {
    setExportLoading(true);
    try {
      const headers = [
        "Nomor Invoice", "Dapur", "Tanggal", "Jatuh Tempo", 
        "Total Harga Jual (Tagihan)", "Total Belanja (Modal)", "Margin Nominal", "Margin (%)", "Status"
      ];
      
      const rows = await Promise.all(invoices.map(async (inv) => {
        let total_beli = 0;
        let margin_nominal = 0;
        let margin_persen = 0;
        
        try {
          const res = await invoiceApi.margin(inv.id);
          total_beli = res.data.total_harga_beli || 0;
          margin_nominal = res.data.total_margin_nominal || 0;
          margin_persen = res.data.margin_persen_total || 0;
        } catch (err) {
          console.error("Gagal get margin untuk invoice", inv.id, err);
        }

        return [
          inv.nomor_invoice,
          inv.dapur?.nama || "",
          inv.tanggal_invoice,
          inv.jatuh_tempo || "",
          inv.total,
          total_beli,
          margin_nominal,
          margin_persen,
          inv.status
        ];
      }));

      const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Invoice_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
    } catch (err) {
      alert("Gagal export CSV");
    } finally {
      setExportLoading(false);
    }
  };

  // Setelah pagination, filter search sudah dikirim ke backend — tidak perlu filter client-side
  const filtered = invoices;
  const totalUnpaid = parseFloat(listSummary.unpaid_value || 0);
  const totalAll = parseFloat(listSummary.total_value || 0);
  const totalMarginAll = filtered.reduce((s, inv) => s + parseFloat(inv.total_margin_nominal || 0), 0);
  const totalModalAll = filtered.reduce((s, inv) => s + parseFloat(inv.total_harga_beli || 0), 0);
  const marginPctAll = totalModalAll > 0 ? (totalMarginAll / totalModalAll * 100).toFixed(1) : 0;

  const getMarginColor = (pct) => {
    if (pct >= 15) return "#10b981";
    if (pct >= 10) return "#f59e0b";
    return "#ef4444";
  };

  const marginPerDapur = {};
  if (isAdmin) {
    filtered.forEach(inv => {
      const dapurId = inv.dapur?.id;
      const dapurName = inv.dapur?.nama || "Tidak Ada Dapur";
      if (!dapurId) return;
      if (!marginPerDapur[dapurId]) {
        marginPerDapur[dapurId] = { nama: dapurName, totalJual: 0, totalBeli: 0, totalMargin: 0 };
      }
      if (inv.total_harga_beli != null) {
        marginPerDapur[dapurId].totalJual += parseFloat(inv.total_harga_jual || 0);
        marginPerDapur[dapurId].totalBeli += parseFloat(inv.total_harga_beli || 0);
        marginPerDapur[dapurId].totalMargin += parseFloat(inv.total_margin_nominal || 0);
      } else {
        marginPerDapur[dapurId].totalJual += parseFloat(inv.total || 0);
      }
    });
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Invoice &amp; Pengarsipan</h1>
          <p className="page-subtitle">
            {pagination.total} invoice ·
            Belum lunas: {formatRupiah(totalUnpaid)} ·
            Total: {formatRupiah(totalAll)}
            {isAdmin && filtered.length > 0 && (
              <> · <span style={{ color: getMarginColor(parseFloat(marginPctAll)) }}>
                Margin: {marginPctAll}% ({formatRupiah(totalMarginAll)})
              </span></>
            )}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleExportCSV} className="btn btn-ghost" style={{ gap: 6 }} disabled={exportLoading}>
            {exportLoading ? <div className="spinner" style={{ width: 14, height: 14 }} /> : "📊"} Export CSV
          </button>
          <Link href="/po" className="btn btn-primary">📋 Ke Daftar PO</Link>
        </div>
      </div>

      {/* Summary Cards — Admin Only */}
      {isAdmin && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
          {[
            {
              icon: "🧾", label: "Total Tagihan", accent: "#3b82f6", color: "#1d4ed8",
              value: formatRupiah(totalAll),
              sub: `${pagination.total} invoice · Unpaid: ${formatRupiah(totalUnpaid)}`,
            },
            {
              icon: "🛒", label: "Total Modal (Beli)", accent: "#ef4444", color: "#dc2626",
              value: formatRupiah(totalModalAll),
              sub: "Total harga beli dari detail invoice",
            },
            {
              icon: "💹", label: "Total Keuntungan", accent: "#10b981", color: "#059669",
              value: formatRupiah(totalMarginAll),
              sub: "Margin nominal halaman ini",
            },
            {
              icon: "📊", label: "Margin %", accent: getMarginColor(parseFloat(marginPctAll)), color: getMarginColor(parseFloat(marginPctAll)),
              value: `${marginPctAll}%`,
              sub: parseFloat(marginPctAll) >= 15 ? "✅ Margin sehat" : parseFloat(marginPctAll) >= 10 ? "⚠️ Margin cukup" : "❌ Margin rendah",
              big: true,
            },
          ].map((card, idx) => (
            <div key={idx} style={{
              background: "white", borderRadius: 14, padding: "16px 18px",
              border: "1px solid var(--color-border)", borderTop: `3px solid ${card.accent}`,
              boxShadow: "0 1px 4px rgba(0,0,0,0.05)", position: "relative", overflow: "hidden",
            }}>
              <div style={{ position: "absolute", top: 12, right: 14, fontSize: 26, opacity: 0.07 }}>{card.icon}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                <span style={{
                  width: 28, height: 28, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center",
                  background: `${card.accent}18`, fontSize: 14,
                }}>{card.icon}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{card.label}</span>
              </div>
              <div style={{ fontSize: card.big ? 26 : 17, fontWeight: 800, color: card.color, lineHeight: 1.2, marginBottom: 3 }}>{card.value}</div>
              <div style={{ fontSize: 11, color: "var(--color-muted)" }}>{card.sub}</div>
            </div>
          ))}
        </div>
      )}

      {isAdmin && Object.keys(marginPerDapur).length > 0 && (
        <details style={{ marginBottom: 20, background: "white", padding: "14px 18px", borderRadius: 14, border: "1px solid var(--color-border)", boxShadow: "0 1px 4px rgba(0,0,0,0.02)" }}>
          <summary style={{ fontWeight: 600, cursor: "pointer", color: "var(--color-primary)", display: "flex", alignItems: "center", gap: 8 }}>
            📊 Lihat Summary Keuntungan per Dapur
          </summary>
          <div className="table-responsive" style={{ marginTop: 16 }}>
            <table className="table">
              <thead>
                <tr style={{ background: "var(--color-bg)" }}>
                  <th>Nama Dapur</th>
                  <th style={{ textAlign: "right" }}>Total Tagihan (Jual)</th>
                  <th style={{ textAlign: "right" }}>Total Modal (Beli)</th>
                  <th style={{ textAlign: "right" }}>Keuntungan (Margin)</th>
                  <th style={{ textAlign: "center" }}>Persentase Margin</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(marginPerDapur).map(md => {
                  const mPct = md.totalBeli > 0 ? (md.totalMargin / md.totalBeli * 100).toFixed(1) : 0;
                  return (
                    <tr key={md.nama}>
                      <td style={{ fontWeight: 600 }}>{md.nama}</td>
                      <td style={{ textAlign: "right" }}>{formatRupiah(md.totalJual)}</td>
                      <td style={{ textAlign: "right" }}>{formatRupiah(md.totalBeli)}</td>
                      <td style={{ textAlign: "right", color: "var(--color-primary)", fontWeight: 700 }}>
                        {formatRupiah(md.totalMargin)}
                      </td>
                      <td style={{ textAlign: "center", color: getMarginColor(mPct), fontWeight: 700 }}>
                        {mPct}%
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <div className="card">
        <div className="filter-bar" style={{ flexWrap: "wrap", gap: 8 }}>
          <div className="search-box">
            <span className="search-box-icon">🔍</span>
            <input placeholder="Cari nomor invoice atau dapur..."
              value={filter.search} onChange={e => setFilter({ ...filter, search: e.target.value })} />
          </div>
          <select className="form-control" style={{ width: 180 }} value={filter.dapur_id}
            onChange={e => setFilter({ ...filter, dapur_id: e.target.value })}>
            <option value="">Semua Dapur</option>
            {dapur.map(d => <option key={d.id} value={d.id}>{d.nama}</option>)}
          </select>
          <select className="form-control" style={{ width: 150 }} value={filter.status}
            onChange={e => setFilter({ ...filter, status: e.target.value })}>
            <option value="">Semua Status</option>
            <option value="unpaid">⏳ Belum Lunas</option>
            <option value="paid">✅ Lunas</option>
            <option value="cancelled">❌ Batal</option>
          </select>
          {/* Filter Tanggal */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--color-muted)", whiteSpace: "nowrap" }}>Dari:</span>
            <input type="date" className="form-control" style={{ width: 140 }}
              value={filter.tanggal_dari}
              onChange={e => setFilter({ ...filter, tanggal_dari: e.target.value })} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--color-muted)", whiteSpace: "nowrap" }}>S/d:</span>
            <input type="date" className="form-control" style={{ width: 140 }}
              value={filter.tanggal_sampai}
              onChange={e => setFilter({ ...filter, tanggal_sampai: e.target.value })} />
          </div>
          {(filter.tanggal_dari || filter.tanggal_sampai) && (
            <button className="btn btn-ghost btn-sm" onClick={() => setFilter({ ...filter, tanggal_dari: "", tanggal_sampai: "" })}>
              ✕ Reset Tanggal
            </button>
          )}
        </div>

        {loading ? (
          <div className="loading-overlay"><div className="spinner" style={{ width: 32, height: 32 }}></div></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🧾</div>
            <div className="empty-state-title">Belum ada invoice</div>
            <div className="empty-state-sub">Generate invoice dari halaman Detail PO</div>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Nomor Invoice</th>
                  <th>Dapur</th>
                  <th>Tanggal</th>
                  <th>Jatuh Tempo</th>
                  <th style={{ textAlign: "right" }}>Total (Rp)</th>
                  {isAdmin && <th style={{ textAlign: "center", minWidth: 120 }}>Margin</th>}
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(inv => {
                  return (
                    <tr key={inv.id} style={{ opacity: inv.status === "cancelled" ? 0.6 : 1 }}>
                      <td>
                        <Link href={`/invoice/${inv.id}`} style={{ color: "var(--color-primary)", fontWeight: 600, textDecoration: "none" }}>
                          {inv.nomor_invoice}
                        </Link>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{inv.dapur?.nama}</div>
                      </td>
                      <td>{formatDate(inv.tanggal_invoice)}</td>
                      <td>
                        <span style={{
                          color: inv.status === "unpaid" && new Date(inv.jatuh_tempo) < new Date()
                            ? "var(--color-danger)" : "inherit"
                        }}>
                          {formatDate(inv.jatuh_tempo) || "-"}
                          {inv.status === "unpaid" && inv.jatuh_tempo && new Date(inv.jatuh_tempo) < new Date()
                            ? " ⚠️" : ""}
                        </span>
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 700 }} className="rupiah">
                        {formatRupiah(inv.total)}
                      </td>
                      {isAdmin && (
                        <td style={{ textAlign: "center", minWidth: 120 }}>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                            <span style={{
                              fontWeight: 800, fontSize: 14,
                              color: getMarginColor(parseFloat(inv.margin_persen_total || 0)),
                            }}>
                              {parseFloat(inv.margin_persen_total || 0).toFixed(1)}%
                            </span>
                            <span style={{ fontSize: 11, color: "var(--color-muted)" }}>
                              {formatRupiah(inv.total_margin_nominal)}
                            </span>
                          </div>
                        </td>
                      )}
                      <td><StatusBadge status={inv.status} /></td>
                      <td>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <Link href={`/invoice/${inv.id}`} className="btn btn-ghost btn-sm">
                            👁️ Lihat
                          </Link>
                          <button
                            onClick={() => {
                              invoiceApi.download(inv.id).then(res => {
                                const url = window.URL.createObjectURL(new Blob([res.data]));
                                const link = document.createElement("a");
                                link.href = url;
                                link.setAttribute("download", `Invoice_${inv.nomor_invoice.replace(/\//g, "-")}.pdf`);
                                document.body.appendChild(link);
                                link.click();
                                link.remove();
                              }).catch(() => alert("Gagal download PDF"));
                            }}
                            className="btn btn-ghost btn-sm"
                          >
                            📥 PDF
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => {
                                invoiceApi.downloadWithMargin(inv.id).then(res => {
                                  const url = window.URL.createObjectURL(new Blob([res.data]));
                                  const link = document.createElement("a");
                                  link.href = url;
                                  link.setAttribute("download", `Invoice_${inv.nomor_invoice.replace(/\//g, "-")}_MARGIN.pdf`);
                                  document.body.appendChild(link);
                                  link.click();
                                  link.remove();
                                }).catch(() => alert("Gagal download PDF Margin"));
                              }}
                              className="btn btn-ghost btn-sm"
                              title="Download PDF versi admin (dengan margin)"
                            >
                              📊 PDF+Margin
                            </button>
                          )}
                          {isAdmin && (
                            <button className="btn btn-ghost btn-sm" onClick={() => handleCekMargin(inv.id)} disabled={marginLoading}>
                              🔍 Detail
                            </button>
                          )}
                          {inv.status === "unpaid" && ["super_admin", "admin", "finance"].includes(user?.role) && (
                            <button className="btn btn-success btn-sm" onClick={() => handleMarkPaid(inv.id)}>
                              ✓ Lunas
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {pagination.total_pages > 1 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderTop: "1px solid var(--color-border)" }}>
            <span style={{ fontSize: 13, color: "var(--color-muted)" }}>
              Halaman {pagination.page} dari {pagination.total_pages} · Total {pagination.total} invoice
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn btn-ghost btn-sm"
                disabled={currentPage <= 1 || loading}
                onClick={() => { const p = currentPage - 1; setCurrentPage(p); load(p); }}
              >
                ← Sebelumnya
              </button>
              <button
                className="btn btn-ghost btn-sm"
                disabled={currentPage >= pagination.total_pages || loading}
                onClick={() => { const p = currentPage + 1; setCurrentPage(p); load(p); }}
              >
                Berikutnya →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Margin */}
      {marginModal && (
        <div onClick={() => setMarginModal(null)} style={{
          position: "fixed", inset: 0, background: "rgba(15,23,42,0.65)",
          zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
          padding: "24px 16px", backdropFilter: "blur(4px)",
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "white", borderRadius: 16, width: "100%", maxWidth: 760,
            maxHeight: "90vh", overflowY: "auto",
            boxShadow: "0 24px 60px rgba(0,0,0,0.2)",
          }}>
            {/* Header */}
            <div style={{ padding: "20px 26px", borderBottom: "1px solid var(--color-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800 }}>📊 Analisis Margin — {marginModal.nomor_invoice}</div>
                <div style={{ fontSize: 13, color: "var(--color-muted)", marginTop: 2 }}>
                  {marginModal.dapur} · {formatDate(marginModal.tanggal_invoice)}
                </div>
              </div>
              <button onClick={() => setMarginModal(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--color-muted)" }}>✕</button>
            </div>

            {/* Summary */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, padding: "20px 26px", background: "#f8fafc" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "var(--color-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Total Harga Beli</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{formatRupiah(marginModal.total_harga_beli)}</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "var(--color-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Total Harga Jual</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#10b981" }}>{formatRupiah(marginModal.total_harga_jual)}</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "var(--color-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Margin Total</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: getMarginColor(marginModal.margin_persen_total) }}>
                  {marginModal.margin_persen_total}%
                </div>
                <div style={{ fontSize: 12, color: "var(--color-muted)" }}>{formatRupiah(marginModal.total_margin_nominal)}</div>
              </div>
            </div>

            {/* Detail Tabel */}
            <div style={{ padding: "0 26px 26px" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f1f5f9" }}>
                      <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 700 }}>Item</th>
                      <th style={{ padding: "10px 12px", textAlign: "right" }}>Qty PO</th>
                      <th style={{ padding: "10px 12px", textAlign: "right" }}>Qty Real</th>
                      <th style={{ padding: "10px 12px", textAlign: "right" }}>H. Beli</th>
                      <th style={{ padding: "10px 12px", textAlign: "right" }}>H. Jual</th>
                      <th style={{ padding: "10px 12px", textAlign: "right" }}>Subtotal Jual</th>
                      <th style={{ padding: "10px 12px", textAlign: "center" }}>Margin %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {marginModal.items.map((item, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "10px 12px", fontWeight: 600 }}>{item.nama_item}</td>
                        <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--color-muted)" }}>
                          {item.qty_po != null ? `${item.qty_po} ${item.satuan || ""}` : "-"}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--color-muted)" }}>
                          {item.qty_realisasi != null ? `${item.qty_realisasi} ${item.satuan || ""}` : `${item.qty} ${item.satuan || ""}`}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right" }}>{formatRupiah(item.harga_beli)}</td>
                        <td style={{ padding: "10px 12px", textAlign: "right", color: "#10b981" }}>{formatRupiah(item.harga_jual)}</td>
                        <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600 }}>{formatRupiah(item.subtotal_jual)}</td>
                        <td style={{ padding: "10px 12px", textAlign: "center" }}>
                          <span style={{
                            padding: "2px 8px", borderRadius: 99, fontSize: 12, fontWeight: 700,
                            background: getMarginColor(item.margin_persen) + "20",
                            color: getMarginColor(item.margin_persen),
                          }}>
                            {item.margin_persen}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

InvoicePage.title = "Invoice";
InvoicePage.subtitle = "Kelola tagihan ke dapur";
