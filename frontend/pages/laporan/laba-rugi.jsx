import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { laporanApi } from "@/lib/api";

const formatRupiah = (v) => `Rp ${parseFloat(v || 0).toLocaleString("id-ID")}`;
const BULAN_FULL = ["", "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

function Section({ roman, title, children, accentColor = "#6366f1" }) {
  return (
    <div style={{ borderBottom: "1px solid var(--color-border)" }}>
      <div style={{
        padding: "14px 22px", background: "#f8fafc",
        borderLeft: `4px solid ${accentColor}`,
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {roman}. {title}
        </span>
      </div>
      <div style={{ padding: "0 22px" }}>{children}</div>
    </div>
  );
}

function LedgerRow({ label, value, color, italic, note }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f1f5f9" }}>
      <span style={{ fontSize: 13, color: italic ? "var(--color-muted)" : "var(--color-text)", fontStyle: italic ? "italic" : undefined }}>{label}</span>
      <div style={{ textAlign: "right" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: color || "var(--color-text)", fontVariantNumeric: "tabular-nums" }}>{value}</span>
        {note && <div style={{ fontSize: 11, color: "var(--color-muted)", marginTop: 2 }}>{note}</div>}
      </div>
    </div>
  );
}

export default function LabaRugiPage() {
  const now = new Date();
  const [bulan, setBulan] = useState(now.getMonth() + 1);
  const [tahun, setTahun] = useState(now.getFullYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const res = await laporanApi.labaRugi(bulan, tahun);
      setData(res.data);
    } catch { setError("Gagal memuat laporan laba rugi"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [bulan, tahun]);

  const isProfit = data?.laba_bersih >= 0;

  return (
    <Layout title="Laporan Laba Rugi">
      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:none; } }
        .lr-animate { animation: fadeIn 0.3s ease; }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>💹 Laporan Laba Rugi</h1>
          <p style={{ color: "var(--color-muted)", margin: "4px 0 0", fontSize: 13 }}>
            Pendapatan, HPP, biaya operasional, dan laba bersih per periode
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select style={{
            padding: "8px 12px", border: "1.5px solid var(--color-border)", borderRadius: 8,
            fontFamily: "inherit", fontSize: 13.5, background: "white", cursor: "pointer",
          }} value={bulan} onChange={e => setBulan(parseInt(e.target.value))}>
            {BULAN_FULL.slice(1).map((b, i) => <option key={i + 1} value={i + 1}>{b}</option>)}
          </select>
          <input style={{
            padding: "8px 12px", border: "1.5px solid var(--color-border)", borderRadius: 8,
            fontFamily: "inherit", fontSize: 13.5, background: "white", width: 90,
          }} type="number" value={tahun} onChange={e => setTahun(parseInt(e.target.value))} />
          <button className="btn btn-primary" onClick={load}>🔄 Tampilkan</button>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>⚠️ {error}</div>}

      {loading && (
        <div style={{ textAlign: "center", padding: 80 }}>
          <div className="spinner" style={{ width: 28, height: 28, margin: "0 auto 12px" }} />
          <div style={{ fontSize: 13, color: "var(--color-muted)" }}>Memuat laporan...</div>
        </div>
      )}

      {data && !loading && (
        <div className="lr-animate" style={{ maxWidth: 680, margin: "0 auto" }}>

          {/* Header Card */}
          <div style={{
            borderRadius: 16, padding: "24px 28px", marginBottom: 20,
            background: "linear-gradient(135deg, #1e293b 0%, #334155 100%)",
            color: "white", display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Laporan Laba Rugi</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{data.periode}</div>
              <div style={{ fontSize: 12, opacity: 0.5, marginTop: 4 }}>Data periode 1 bulan penuh</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, opacity: 0.6, textTransform: "uppercase", marginBottom: 4 }}>Status</div>
              <div style={{
                padding: "4px 14px", borderRadius: 99, fontSize: 12, fontWeight: 800,
                background: isProfit ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)",
                color: isProfit ? "#4ade80" : "#f87171",
                border: `1px solid ${isProfit ? "rgba(74,222,128,0.4)" : "rgba(248,113,113,0.4)"}`,
              }}>
                {isProfit ? "✅ Profit" : "❌ Rugi"}
              </div>
            </div>
          </div>

          {/* Ledger Body */}
          <div style={{ background: "white", borderRadius: 16, border: "1px solid var(--color-border)", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>

            {/* I. Pendapatan */}
            <Section roman="I" title="Pendapatan" accentColor="#10b981">
              <LedgerRow
                label="Penjualan / Invoice Terbayar"
                value={formatRupiah(data.pendapatan?.invoice_terbayar)}
                color="#059669"
              />
              <LedgerRow
                label="Invoice total (termasuk belum bayar)"
                value={formatRupiah(data.pendapatan?.invoice_semua)}
                color="var(--color-muted)" italic
              />
            </Section>

            {/* II. HPP */}
            <Section roman="II" title="Harga Pokok Pembelian (HPP)" accentColor="#ef4444">
              <LedgerRow
                label="Pembelian Bahan Baku (dari PO)"
                value={formatRupiah(data.harga_pokok_pembelian?.total)}
                color="#dc2626"
              />
            </Section>

            {/* Subtotal: Laba Kotor */}
            <div style={{
              padding: "14px 22px", background: "linear-gradient(90deg, #eff6ff, #f0f9ff)",
              borderBottom: "1px solid #bfdbfe", display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#1e40af" }}>LABA KOTOR</div>
                <div style={{ fontSize: 11, color: "#3b82f6", marginTop: 2 }}>Margin Kotor: {data.margin_kotor_persen}%</div>
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: data.laba_kotor >= 0 ? "#1d4ed8" : "#dc2626" }}>
                {formatRupiah(data.laba_kotor)}
              </div>
            </div>

            {/* III. Biaya Operasional */}
            <Section roman="III" title="Biaya Operasional" accentColor="#f59e0b">
              <LedgerRow
                label="Total Biaya Operasional (Gaji, Utilitas, dll)"
                value={formatRupiah(data.biaya_operasional?.total)}
                color="#b45309"
              />
              {parseFloat(data.biaya_operasional?.total || 0) === 0 && (
                <div style={{ padding: "8px 0 10px", fontSize: 12, color: "var(--color-muted)" }}>
                  💡 Belum ada data biaya operasional.{" "}
                  <a href="/operasional" style={{ color: "var(--color-primary)", fontWeight: 600 }}>Input di sini →</a>
                </div>
              )}
            </Section>

            {/* Final: Laba Bersih */}
            <div style={{
              padding: "22px 28px",
              background: isProfit
                ? "linear-gradient(135deg, #052e16 0%, #14532d 100%)"
                : "linear-gradient(135deg, #450a0a 0%, #7f1d1d 100%)",
              color: "white",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 11, opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Hasil Akhir</div>
                  <div style={{ fontWeight: 800, fontSize: 17, textTransform: "uppercase", letterSpacing: "0.04em" }}>LABA BERSIH</div>
                  <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>Margin Bersih: {data.margin_bersih_persen}%</div>
                </div>
                <div style={{ fontSize: 30, fontWeight: 900, color: isProfit ? "#4ade80" : "#f87171" }}>
                  {data.laba_bersih >= 0 ? "+" : ""}{formatRupiah(data.laba_bersih)}
                </div>
              </div>
            </div>
          </div>

          {/* Disclaimer */}
          <div style={{ marginTop: 16, padding: "12px 16px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, fontSize: 12, color: "#92400e" }}>
            ⚠️ <strong>Catatan:</strong> Laporan ini bersifat indikatif. Pendapatan dihitung dari invoice berstatus PAID, HPP dari PO approved/delivered.
            Konsultasikan dengan akuntan untuk laporan audit formal.
          </div>
        </div>
      )}
    </Layout>
  );
}
