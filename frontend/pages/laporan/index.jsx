import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { laporanApi } from "@/lib/api";
import Link from "next/link";

const formatRupiah = (v) => `Rp ${parseFloat(v || 0).toLocaleString("id-ID")}`;
const BULAN = ["", "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];
const BULAN_FULL = ["", "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

function KPICard({ icon, label, value, sub, color, accent, trend }) {
  return (
    <div style={{
      background: "white", borderRadius: 14, padding: "18px 20px",
      border: "1px solid var(--color-border)", boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
      borderTop: `3px solid ${accent}`, position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", top: 14, right: 16, fontSize: 28, opacity: 0.08 }}>{icon}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{
          width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
          background: `${accent}18`, fontSize: 16,
        }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color, lineHeight: 1.2, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--color-muted)" }}>{sub}</div>}
    </div>
  );
}

function BarChart({ data, bulan, formatRupiah }) {
  if (!data || data.length === 0) return null;
  const maxVal = Math.max(...data.map(b => Math.abs(b.laba_bersih || 0)), 1);
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 120, padding: "0 4px" }}>
      {data.map(b => {
        const val = b.laba_bersih || 0;
        const height = Math.max(4, (Math.abs(val) / maxVal) * 100);
        const isPos = val >= 0;
        const isCur = b.bulan === bulan;
        return (
          <div key={b.bulan} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}
            title={`${b.nama_bulan}: ${formatRupiah(val)}`}>
            <div style={{
              width: "100%", height,
              background: isCur
                ? (isPos ? "linear-gradient(to top, #059669, #34d399)" : "linear-gradient(to top, #dc2626, #f87171)")
                : (isPos ? "rgba(16,185,129,0.35)" : "rgba(239,68,68,0.35)"),
              borderRadius: "4px 4px 0 0",
              border: isCur ? `2px solid ${isPos ? "#059669" : "#dc2626"}` : "none",
              cursor: "default",
              transition: "all 0.2s",
              boxShadow: isCur ? `0 4px 12px ${isPos ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}` : "none",
            }} />
            <div style={{ fontSize: 10, color: isCur ? "var(--color-text)" : "var(--color-muted)", fontWeight: isCur ? 700 : 400 }}>
              {BULAN[b.bulan]}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function LaporanPage() {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const [startDate, setStartDate] = useState(firstDay.toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(now.toISOString().split("T")[0]);
  const [labaRugi, setLabaRugi] = useState(null);
  const [pembelanjaan, setPembelanjaan] = useState(null);
  const [hutangPiutang, setHutangPiutang] = useState(null);
  const [ringkasan, setRingkasan] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const tahunForTrend = parseInt(startDate.split("-")[0]) || new Date().getFullYear();
      const [lr, pb, hp, rs] = await Promise.all([
        laporanApi.labaRugi(startDate, endDate),
        laporanApi.pembelanjaan(startDate, endDate),
        laporanApi.hutangPiutang(),
        laporanApi.ringkasan(tahunForTrend),
      ]);
      setLabaRugi(lr.data);
      setPembelanjaan(pb.data);
      setHutangPiutang(hp.data);
      setRingkasan(rs.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [startDate, endDate]);

  const netPos = hutangPiutang?.net_position;

  return (
    <Layout title="Dashboard Laporan Keuangan">
      <style>{`
        .ql-link-card { transition: transform 0.2s, box-shadow 0.2s; }
        .ql-link-card:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(0,0,0,0.10) !important; }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>📈 Dashboard Laporan Keuangan</h1>
          <p style={{ color: "var(--color-muted)", margin: "4px 0 0", fontSize: 13 }}>
            Ringkasan keuangan perusahaan — pembelanjaan, pendapatan &amp; laba
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input style={{
            padding: "8px 12px", border: "1.5px solid var(--color-border)", borderRadius: 8,
            fontFamily: "inherit", fontSize: 13.5, color: "var(--color-text)", background: "white", cursor: "pointer",
          }} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          <span style={{ color: "var(--color-muted)", fontSize: 13 }}>s/d</span>
          <input style={{
            padding: "8px 12px", border: "1.5px solid var(--color-border)", borderRadius: 8,
            fontFamily: "inherit", fontSize: 13.5, color: "var(--color-text)", background: "white", cursor: "pointer",
          }} type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          <button className="btn btn-primary" onClick={load}>🔄 Refresh</button>
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <div className="spinner" style={{ width: 28, height: 28, margin: "0 auto 12px" }} />
          <div style={{ fontSize: 13, color: "var(--color-muted)" }}>Memuat laporan keuangan...</div>
        </div>
      )}

      {!loading && labaRugi && (
        <>
          {/* KPI Row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
            <KPICard icon="💰" label="Pendapatan" accent="#10b981" color="#059669"
              value={formatRupiah(labaRugi.pendapatan?.invoice_terbayar)}
              sub={`Invoice terbayar periode ini`} />
            <KPICard icon="🛒" label="HPP (Pembelian)" accent="#ef4444" color="#dc2626"
              value={formatRupiah(labaRugi.harga_pokok_pembelian?.total)}
              sub="Harga pokok pembelian" />
            <KPICard icon="⚙️" label="Biaya Operasional" accent="#f59e0b" color="#b45309"
              value={formatRupiah(labaRugi.biaya_operasional?.total)}
              sub="Gaji, utilitas, dll" />
            <KPICard
              icon={labaRugi.laba_bersih >= 0 ? "📈" : "📉"}
              label="Laba Bersih"
              accent={labaRugi.laba_bersih >= 0 ? "#10b981" : "#ef4444"}
              color={labaRugi.laba_bersih >= 0 ? "#059669" : "#dc2626"}
              value={`${labaRugi.laba_bersih >= 0 ? "+" : ""}${formatRupiah(labaRugi.laba_bersih)}`}
              sub={`Margin: ${labaRugi.margin_bersih_persen}%`} />
          </div>

          {/* Main Grid: Laba Rugi + Hutang Piutang */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>

            {/* Laba Rugi Detail */}
            <div style={{ background: "white", borderRadius: 14, border: "1px solid var(--color-border)", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--color-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 800, fontSize: 14 }}>📋 Laba Rugi — {labaRugi.periode}</div>
                <Link href="/laporan/laba-rugi" style={{ fontSize: 12, color: "var(--color-primary)", textDecoration: "none", fontWeight: 600 }}>Detail →</Link>
              </div>
              <div style={{ padding: "16px 20px" }}>
                {[
                  { label: "Pendapatan (Invoice Terbayar)", value: labaRugi.pendapatan?.invoice_terbayar, color: "#059669", sign: "+", indent: false },
                  { label: "HPP — Harga Pokok Pembelian", value: labaRugi.harga_pokok_pembelian?.total, color: "#dc2626", sign: "−", indent: false },
                  { label: "= LABA KOTOR", value: labaRugi.laba_kotor, color: "#3b82f6", bold: true, border: true },
                  { label: "Biaya Operasional", value: labaRugi.biaya_operasional?.total, color: "#b45309", sign: "−", indent: false },
                  { label: "= LABA BERSIH", value: labaRugi.laba_bersih, color: labaRugi.laba_bersih >= 0 ? "#059669" : "#dc2626", bold: true, big: true, border: true },
                ].map((row, i) => (
                  <div key={i} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: row.big ? "12px 0" : "8px 0",
                    borderTop: row.border ? "1px solid var(--color-border)" : undefined,
                    marginTop: row.border ? 4 : 0,
                  }}>
                    <span style={{ color: row.bold ? "var(--color-text)" : "var(--color-muted)", fontWeight: row.bold ? 700 : 400, fontSize: row.big ? 14 : 13 }}>
                      {row.label}
                    </span>
                    <span style={{ color: row.color, fontWeight: row.bold ? 800 : 600, fontSize: row.big ? 17 : 13, fontVariantNumeric: "tabular-nums" }}>
                      {row.sign}{formatRupiah(row.value)}
                    </span>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 20, marginTop: 14, padding: "12px 14px", background: "#f8fafc", borderRadius: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--color-muted)" }}>Margin Kotor</div>
                    <div style={{ fontWeight: 800, color: "#3b82f6", fontSize: 16 }}>{labaRugi.margin_kotor_persen}%</div>
                  </div>
                  <div style={{ width: 1, background: "var(--color-border)" }} />
                  <div>
                    <div style={{ fontSize: 11, color: "var(--color-muted)" }}>Margin Bersih</div>
                    <div style={{ fontWeight: 800, color: labaRugi.margin_bersih_persen >= 0 ? "#059669" : "#dc2626", fontSize: 16 }}>
                      {labaRugi.margin_bersih_persen}%
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Hutang Piutang */}
            {hutangPiutang && (
              <div style={{ background: "white", borderRadius: 14, border: "1px solid var(--color-border)", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
                <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--color-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>⚖️ Posisi Hutang &amp; Piutang</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Link href="/hutang" style={{ fontSize: 12, color: "#dc2626", textDecoration: "none", fontWeight: 600 }}>Hutang →</Link>
                    <Link href="/piutang" style={{ fontSize: 12, color: "#059669", textDecoration: "none", fontWeight: 600 }}>Piutang →</Link>
                  </div>
                </div>
                <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div style={{ background: "rgba(239,68,68,0.06)", borderRadius: 12, padding: 14, borderLeft: "4px solid #ef4444" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#dc2626", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>Hutang ke Supplier</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: "#dc2626" }}>{formatRupiah(hutangPiutang.hutang?.sisa)}</div>
                      <div style={{ fontSize: 11, color: "var(--color-muted)", marginTop: 4 }}>dari {formatRupiah(hutangPiutang.hutang?.total)}</div>
                    </div>
                    <div style={{ background: "rgba(16,185,129,0.06)", borderRadius: 12, padding: 14, borderLeft: "4px solid #10b981" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#059669", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>Piutang dari Dapur</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: "#059669" }}>{formatRupiah(hutangPiutang.piutang?.sisa)}</div>
                      <div style={{ fontSize: 11, color: "var(--color-muted)", marginTop: 4 }}>dari {formatRupiah(hutangPiutang.piutang?.total)}</div>
                    </div>
                  </div>

                  {/* Net Position */}
                  <div style={{
                    background: netPos >= 0 ? "rgba(16,185,129,0.06)" : "rgba(239,68,68,0.06)",
                    borderRadius: 12, padding: 14, textAlign: "center",
                    border: `1px solid ${netPos >= 0 ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)"}`,
                  }}>
                    <div style={{ fontSize: 11, color: "var(--color-muted)", marginBottom: 4 }}>Posisi Bersih (Piutang − Hutang)</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: netPos >= 0 ? "#059669" : "#dc2626" }}>
                      {netPos >= 0 ? "+" : ""}{formatRupiah(Math.abs(netPos))}
                    </div>
                    <div style={{ fontSize: 12, marginTop: 4, fontWeight: 600, color: netPos >= 0 ? "#059669" : "#dc2626" }}>
                      {netPos >= 0 ? "✅ Piutang lebih besar" : "⚠️ Hutang lebih besar"}
                    </div>
                  </div>

                  {/* Top hutang per supplier */}
                  {hutangPiutang.hutang?.per_supplier?.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase", marginBottom: 8 }}>Top Hutang Supplier</div>
                      {hutangPiutang.hutang.per_supplier.slice(0, 3).map(s => (
                        <div key={s.supplier_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--color-border)" }}>
                          <span style={{ fontSize: 13, color: "var(--color-text)" }}>{s.nama}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#dc2626" }}>{formatRupiah(s.sisa)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Trend Chart */}
          {ringkasan && (
            <div style={{ background: "white", borderRadius: 14, border: "1px solid var(--color-border)", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)", marginBottom: 24 }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--color-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 800, fontSize: 14 }}>📊 Tren Laba Bersih {ringkasan.tahun}</div>
                <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
                  <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#10b981", marginRight: 5 }} />Profit</span>
                  <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#ef4444", marginRight: 5 }} />Loss</span>
                </div>
              </div>
              <div style={{ padding: "20px 20px 12px" }}>
                <BarChart data={ringkasan.per_bulan} formatRupiah={formatRupiah} />
              </div>
              <div style={{ padding: "0 20px 16px", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, borderTop: "1px solid var(--color-border)", paddingTop: 14 }}>
                {[
                  { label: "Total Pendapatan", value: ringkasan.total_tahun?.pendapatan, color: "#059669" },
                  { label: "Total HPP", value: ringkasan.total_tahun?.hpp, color: "#dc2626" },
                  { label: "Total Operasional", value: ringkasan.total_tahun?.operasional, color: "#b45309" },
                  { label: "Laba Bersih Setahun", value: ringkasan.total_tahun?.laba_bersih, color: ringkasan.total_tahun?.laba_bersih >= 0 ? "#059669" : "#dc2626" },
                ].map(c => (
                  <div key={c.label} style={{ textAlign: "center", padding: "10px 0" }}>
                    <div style={{ fontSize: 11, color: "var(--color-muted)", marginBottom: 4 }}>{c.label}</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: c.color }}>{formatRupiah(c.value)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Quick Links */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {[
          { href: "/laporan/laba-rugi", icon: "💹", label: "Laporan Laba Rugi", desc: "Detail P&L per periode", accent: "#10b981" },
          { href: "/laporan/margin", icon: "📉", label: "Analisis Margin Item", desc: "Margin per nama bahan", accent: "#6366f1" },
          { href: "/operasional", icon: "🏢", label: "Biaya Operasional", desc: "Input & kelola biaya rutin", accent: "#f59e0b" },
        ].map(l => (
          <Link key={l.href} href={l.href} style={{ textDecoration: "none" }}>
            <div className="ql-link-card" style={{
              background: "white", borderRadius: 14, padding: "18px 20px",
              border: "1px solid var(--color-border)", cursor: "pointer",
              boxShadow: "0 1px 4px rgba(0,0,0,0.05)", borderTop: `3px solid ${l.accent}`,
            }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>{l.icon}</div>
              <div style={{ fontWeight: 800, fontSize: 14, color: "var(--color-text)" }}>{l.label}</div>
              <div style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 4 }}>{l.desc}</div>
            </div>
          </Link>
        ))}
      </div>
    </Layout>
  );
}
