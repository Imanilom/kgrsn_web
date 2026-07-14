import { useEffect, useState } from "react";
import { invoiceApi, dapurApi } from "@/lib/api";
import { formatRupiah, formatDate, StatusBadge } from "@/components/Layout";
import Link from "next/link";

export default function InvoicePage() {
  const [invoices, setInvoices] = useState([]);
  const [dapur, setDapur] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({
    dapur_id: "", status: "", search: "",
    tanggal_dari: "", tanggal_sampai: "",
  });
  const [marginModal, setMarginModal] = useState(null);
  const [marginLoading, setMarginLoading] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData) setUser(JSON.parse(userData));
  }, []);
  const isAdmin = ["super_admin", "admin"].includes(user?.role);

  const load = async () => {
    setLoading(true);
    const params = {};
    if (filter.dapur_id) params.dapur_id = filter.dapur_id;
    if (filter.status) params.status = filter.status;
    if (filter.tanggal_dari) params.tanggal_dari = filter.tanggal_dari;
    if (filter.tanggal_sampai) params.tanggal_sampai = filter.tanggal_sampai;
    try {
      const res = await invoiceApi.list(params);
      setInvoices(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { dapurApi.list({ is_active: true }).then(r => setDapur(r.data)); }, []);
  useEffect(() => { load(); }, [filter.dapur_id, filter.status, filter.tanggal_dari, filter.tanggal_sampai]);

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

  const handleExportCSV = () => {
    const headers = ["Nomor Invoice", "Dapur", "Tanggal", "Jatuh Tempo", "Total", "Status"];
    const rows = filtered.map(inv => [
      inv.nomor_invoice,
      inv.dapur?.nama || "",
      inv.tanggal_invoice,
      inv.jatuh_tempo,
      inv.total,
      inv.status
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Invoice_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const filtered = filter.search
    ? invoices.filter(inv => {
        const s = filter.search.toLowerCase();
        return inv.nomor_invoice?.toLowerCase().includes(s) || inv.dapur?.nama?.toLowerCase().includes(s);
      })
    : invoices;

  const totalUnpaid = filtered.filter(i => i.status === "unpaid").reduce((s, i) => s + parseFloat(i.total || 0), 0);
  const totalAll = filtered.reduce((s, i) => s + parseFloat(i.total || 0), 0);

  const getMarginColor = (pct) => {
    if (pct >= 15) return "#10b981";
    if (pct >= 10) return "#f59e0b";
    return "#ef4444";
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Invoice &amp; Pengarsipan</h1>
          <p className="page-subtitle">
            {filtered.length} invoice · 
            Belum lunas: {formatRupiah(totalUnpaid)} · 
            Total: {formatRupiah(totalAll)}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleExportCSV} className="btn btn-ghost" style={{ gap: 6 }}>
            📊 Export CSV
          </button>
          <Link href="/po" className="btn btn-primary">📋 Ke Daftar PO</Link>
        </div>
      </div>

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
                  {isAdmin && <th style={{ textAlign: "center" }}>Margin</th>}
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(inv => {
                  // Hitung estimasi margin dari details
                  let totalBeli = 0, totalJual = 0;
                  (inv.details || []).forEach(d => {
                    totalBeli += parseFloat(d.qty || 0) * parseFloat(d.harga_beli || 0);
                    totalJual += parseFloat(d.qty || 0) * parseFloat(d.harga_jual || 0);
                  });
                  const marginPct = totalBeli > 0 ? ((totalJual - totalBeli) / totalBeli * 100).toFixed(1) : null;

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
                        <td style={{ textAlign: "center" }}>
                          {marginPct !== null ? (
                            <span style={{
                              padding: "2px 8px", borderRadius: 99, fontSize: 12, fontWeight: 700,
                              background: getMarginColor(parseFloat(marginPct)) + "20",
                              color: getMarginColor(parseFloat(marginPct)),
                            }}>
                              {marginPct}%
                            </span>
                          ) : "-"}
                        </td>
                      )}
                      <td><StatusBadge status={inv.status} /></td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          <Link href={`/invoice/${inv.id}`} className="btn btn-ghost btn-sm">
                            👁️ Lihat
                          </Link>
                          <a
                            href={invoiceApi.downloadUrl(inv.id)}
                            target="_blank"
                            className="btn btn-ghost btn-sm"
                          >
                            📥 PDF
                          </a>
                          {isAdmin && (
                            <button className="btn btn-ghost btn-sm" onClick={() => handleCekMargin(inv.id)} disabled={marginLoading}>
                              📊 Margin
                            </button>
                          )}
                          {inv.status === "unpaid" && (
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
