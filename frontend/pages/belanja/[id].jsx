import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { belanjaApi } from "@/lib/api";
import { formatRupiah } from "@/components/Layout";

function formatDate(d) {
  if (!d) return "—";
  return new Date(d + "T00:00").toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

const STATUS_COLOR = {
  draft: { bg: "#f1f5f9", text: "#475569", label: "📝 Draft" },
  lunas: { bg: "rgba(16,185,129,0.1)", text: "#059669", label: "✅ Lunas" },
  sebagian: { bg: "rgba(245,158,11,0.1)", text: "#b45309", label: "⏳ Sebagian" },
};

export default function BelanjaDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    belanjaApi.get(id)
      .then(r => setData(r.data))
      .catch(() => setError("Gagal memuat data"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleBayar = async () => {
    if (!confirm("Tandai transaksi ini sebagai lunas?")) return;
    try {
      await belanjaApi.bayar(id);
      const r = await belanjaApi.get(id);
      setData(r.data);
    } catch (e) {
      setError(e.response?.data?.detail || "Gagal");
    }
  };

  const handleDelete = async () => {
    if (!confirm("Hapus transaksi ini?")) return;
    try {
      await belanjaApi.delete(id);
      router.push("/belanja");
    } catch (e) {
      setError(e.response?.data?.detail || "Gagal menghapus");
    }
  };

  if (loading) return <div className="card" style={{ padding: 40, textAlign: "center" }}><div className="spinner" style={{ width: 32, height: 32, margin: "auto" }} /></div>;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return null;

  const sc = STATUS_COLOR[data.status] || STATUS_COLOR.draft;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">🛒 {data.nomor_transaksi}</h1>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
            <span style={{ padding: "3px 10px", borderRadius: 99, fontSize: 12, fontWeight: 700, background: sc.bg, color: sc.text }}>{sc.label}</span>
            <span style={{ color: "var(--color-muted)", fontSize: 13 }}>📅 {formatDate(data.tanggal_belanja)}</span>
            {data.supplier_nama && <span style={{ color: "var(--color-muted)", fontSize: 13 }}>🏭 {data.supplier_nama}</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href={`/belanja/edit/${id}`} className="btn btn-ghost" style={{ color: "#4f46e5", border: "1px solid #e0e7ff" }}>✏️ Edit</Link>
          {data.status === "draft" && (
            <button className="btn btn-success" onClick={handleBayar}>✓ Tandai Lunas</button>
          )}
          <button className="btn btn-ghost" style={{ color: "#ef4444" }} onClick={handleDelete}>🗑️ Hapus</button>
          <Link href="/belanja" className="btn btn-ghost">← Daftar Belanja</Link>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Total Belanja", value: formatRupiah(data.total), color: "var(--color-primary)", icon: "💰" },
          { label: "Jumlah Item", value: `${data.details?.length || 0} item`, color: "#374151", icon: "📦" },
          { label: "Supplier", value: data.supplier_nama || "—", color: "#374151", icon: "🏭" },
          { label: "Status Hutang", value: data.hutang_id ? "Terkonsolidasi" : "Belum", color: data.hutang_id ? "#059669" : "#f59e0b", icon: "🔗" },
        ].map(c => (
          <div key={c.label} className="card" style={{ padding: "12px 16px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted)" }}>{c.icon} {c.label}</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: c.color, marginTop: 4 }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Detail Items */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 16 }}>📦 Detail Item & Alokasi PO</div>
        {data.details?.map((d, idx) => {
          const totalAlokasiQty = d.alokasi?.reduce((s, a) => s + a.qty_alokasi, 0) || 0;
          const sisaQty = d.qty_beli - totalAlokasiQty;
          return (
            <div key={d.id} style={{
              border: "1px solid var(--color-border)", borderRadius: 10, marginBottom: 12,
              overflow: "hidden",
            }}>
              {/* Item Header */}
              <div style={{
                padding: "12px 16px", background: "#f8fafc",
                display: "flex", justifyContent: "space-between", alignItems: "center"
              }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{d.nama_item}</span>
                  <span style={{ color: "var(--color-muted)", fontSize: 12, marginLeft: 8 }}>
                    {d.qty_beli} {d.satuan} × {formatRupiah(d.harga_satuan)}
                  </span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 800, fontSize: 16 }} className="rupiah">{formatRupiah(d.subtotal)}</div>
                  {d.alokasi?.length > 0 && (
                    <div style={{ fontSize: 11, color: sisaQty > 0 ? "#f59e0b" : "#22c55e", marginTop: 2 }}>
                      {sisaQty > 0 ? `⚠️ ${sisaQty} ${d.satuan} belum dialokasi` : `✓ Semua dialokasi ke ${d.alokasi.length} PO`}
                    </div>
                  )}
                </div>
              </div>

              {/* Alokasi table */}
              {d.alokasi?.length > 0 ? (
                <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "rgba(99,102,241,0.06)" }}>
                      <th style={{ padding: "6px 16px", textAlign: "left", color: "#6366f1" }}>Nomor PO</th>
                      <th style={{ padding: "6px 16px", textAlign: "left", color: "#6366f1" }}>Tanggal PO</th>
                      <th style={{ padding: "6px 16px", textAlign: "left", color: "#6366f1" }}>Dapur</th>
                      <th style={{ padding: "6px 16px", textAlign: "right", color: "#6366f1" }}>Qty Alokasi</th>
                      <th style={{ padding: "6px 16px", textAlign: "right", color: "#6366f1" }}>Subtotal</th>
                      <th style={{ padding: "6px 16px", textAlign: "center", color: "#6366f1" }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.alokasi.map((a, ai) => (
                      <tr key={ai} style={{ borderTop: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "8px 16px" }}>
                          <Link href={`/po/${a.po_id}`} style={{ color: "#6366f1", fontWeight: 700, textDecoration: "none" }}>
                            {a.nomor_po}
                          </Link>
                        </td>
                        <td style={{ padding: "8px 16px", color: "var(--color-muted)" }}>{formatDate(a.tanggal_po)}</td>
                        <td style={{ padding: "8px 16px" }}>{a.dapur || "—"}</td>
                        <td style={{ padding: "8px 16px", textAlign: "right", fontWeight: 700 }}>{a.qty_alokasi} {d.satuan}</td>
                        <td style={{ padding: "8px 16px", textAlign: "right" }} className="rupiah">{formatRupiah(a.subtotal)}</td>
                        <td style={{ padding: "8px 16px", textAlign: "center" }}>
                          <Link href={`/po/${a.po_id}`} className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}>
                            Buka PO →
                          </Link>
                        </td>
                      </tr>
                    ))}
                    {sisaQty > 0 && (
                      <tr style={{ borderTop: "1px solid #f1f5f9", background: "rgba(245,158,11,0.04)" }}>
                        <td colSpan={3} style={{ padding: "6px 16px", color: "#92400e", fontSize: 12, fontStyle: "italic" }}>
                          ⚠️ Tidak teralokasi ke PO manapun
                        </td>
                        <td style={{ padding: "6px 16px", textAlign: "right", color: "#92400e", fontWeight: 700 }}>
                          {sisaQty} {d.satuan}
                        </td>
                        <td colSpan={2} style={{ padding: "6px 16px", textAlign: "right", color: "#92400e" }} className="rupiah">
                          {formatRupiah(sisaQty * d.harga_satuan)}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              ) : (
                <div style={{ padding: "10px 16px", fontSize: 12, color: "#94a3b8" }}>
                  Tidak ada alokasi ke PO — item dicatat sebagai pembelian bebas
                </div>
              )}
            </div>
          );
        })}

        {/* Total */}
        <div style={{ borderTop: "2px solid var(--color-border)", paddingTop: 12, display: "flex", justifyContent: "flex-end" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, color: "var(--color-muted)" }}>Total Belanja</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: "var(--color-primary)" }} className="rupiah">{formatRupiah(data.total)}</div>
          </div>
        </div>
      </div>

      {data.catatan && (
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, color: "var(--color-muted)", fontWeight: 700, marginBottom: 4 }}>📝 CATATAN</div>
          <div>{data.catatan}</div>
        </div>
      )}
    </div>
  );
}

BelanjaDetail.title = "Detail Belanja";
