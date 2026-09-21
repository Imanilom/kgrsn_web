import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { laporanApi, dapurApi } from "@/lib/api";
import Link from "next/link";

const formatRupiah = (v) => `Rp ${parseFloat(v || 0).toLocaleString("id-ID")}`;
const BULAN = ["", "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];
const BULAN_FULL = ["", "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

function KPICard({ icon, label, value, sub, color, accent, trend, href }) {
  const inner = (
    <div style={{
      background: "white", borderRadius: 14, padding: "18px 20px",
      border: "1px solid var(--color-border)", boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
      borderTop: `3px solid ${accent}`, position: "relative", overflow: "hidden",
      transition: "transform 0.18s, box-shadow 0.18s",
      cursor: href ? "pointer" : "default",
    }}
      onMouseEnter={e => { if (href) { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.10)"; }}}
      onMouseLeave={e => { if (href) { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.05)"; }}}
    >
      <div style={{ position: "absolute", top: 14, right: 16, fontSize: 28, opacity: 0.08 }}>{icon}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{
          width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
          background: `${accent}18`, fontSize: 16,
        }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
        {href && <span style={{ marginLeft: "auto", fontSize: 11, color: accent, fontWeight: 600 }}>Lihat →</span>}
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color, lineHeight: 1.2, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--color-muted)" }}>{sub}</div>}
    </div>
  );
  return href ? <Link href={href} style={{ textDecoration: "none" }}>{inner}</Link> : inner;
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

  // Data per-grup L/R (gabungan + terpisah)
  const [grups, setGrups] = useState([]);
  const [grupsBelanja, setGrupsBelanja] = useState([]);
  const [selectedGrupIdx, setSelectedGrupIdx] = useState(0);

  // Data lain
  const [hutangPiutang, setHutangPiutang] = useState(null);
  const [ringkasan, setRingkasan] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const tahunForTrend = parseInt(startDate.split("-")[0]) || new Date().getFullYear();
      const [perGrupRes, belanjaPerGrupRes, hp, rs] = await Promise.all([
        laporanApi.labaRugiPerGrup(startDate, endDate),
        laporanApi.pembelianPerGrup(startDate, endDate),
        laporanApi.hutangPiutang(),
        laporanApi.ringkasan(tahunForTrend),
      ]);
      const newGrups = perGrupRes.data.grups || [];
      setGrups(newGrups);
      setGrupsBelanja(belanjaPerGrupRes.data.grups || []);
      setSelectedGrupIdx(idx => (idx >= newGrups.length ? 0 : idx));
      setHutangPiutang(hp.data);
      setRingkasan(rs.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [startDate, endDate]);

  // Grup yang sedang ditampilkan (L/R dan Belanja mengikuti selectedGrupIdx yang sama)
  const labaRugi = grups[selectedGrupIdx] || null;
  const belanjaGrup = grupsBelanja[selectedGrupIdx] || null;

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
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {/* Dropdown Grup Laporan */}
          {grups.length > 1 && (
            <select
              style={{
                padding: "8px 12px", border: "1.5px solid var(--color-border)", borderRadius: 8,
                fontFamily: "inherit", fontSize: 13.5, color: "var(--color-text)", background: "white",
                cursor: "pointer", outline: "none", minWidth: 160,
                borderColor: grups[selectedGrupIdx]?.grup_type === "terpisah" ? "#6366f1" : "var(--color-border)",
              }}
              value={selectedGrupIdx}
              onChange={e => setSelectedGrupIdx(Number(e.target.value))}
            >
              {grups.map((g, i) => (
                <option key={i} value={i}>
                  {g.grup_type === "terpisah" ? `🔒 ${g.grup_label}` : `📊 ${g.grup_label}`}
                  {g.grup_type === "terpisah" && g.overhead_persen_config ? ` (${g.overhead_persen_config}% overhead)` : ""}
                </option>
              ))}
            </select>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "center", borderLeft: grups.length > 1 ? "1px solid var(--color-border)" : "none", paddingLeft: grups.length > 1 ? 8 : 0 }}>
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
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <div className="spinner" style={{ width: 28, height: 28, margin: "0 auto 12px" }} />
          <div style={{ fontSize: 13, color: "var(--color-muted)" }}>Memuat laporan keuangan...</div>
        </div>
      )}

      {!loading && labaRugi && (
        <>
          {/* Grup Badge */}
          {labaRugi.grup_type && (
            <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{
                padding: "4px 14px", borderRadius: 999, fontSize: 12, fontWeight: 700,
                background: labaRugi.grup_type === "terpisah" ? "rgba(99,102,241,0.12)" : "rgba(16,185,129,0.12)",
                color: labaRugi.grup_type === "terpisah" ? "#6366f1" : "#059669",
                border: `1px solid ${labaRugi.grup_type === "terpisah" ? "rgba(99,102,241,0.3)" : "rgba(16,185,129,0.3)"}`,
              }}>
                {labaRugi.grup_type === "terpisah" ? "🔒 Laporan Mandiri" : "📊 Laporan Gabungan"}
              </span>
              <span style={{ fontSize: 12, color: "var(--color-muted)" }}>
                {labaRugi.dapur_list?.map(d => d.nama).join(", ")}
              </span>
              {labaRugi.overhead_mode === "persen" && (
                <span style={{
                  padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                  background: "rgba(245,158,11,0.1)", color: "#b45309",
                  border: "1px solid rgba(245,158,11,0.25)",
                }}>
                  ⚙️ Overhead: {labaRugi.overhead_persen_config || labaRugi.overhead_persen}% × Laba Kotor
                </span>
              )}
              {labaRugi.overhead_mode === "aktual" && (
                <span style={{
                  padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                  background: "rgba(59,130,246,0.08)", color: "#2563eb",
                  border: "1px solid rgba(59,130,246,0.2)",
                }}>
                  ⚙️ Overhead: Biaya Operasional Aktual
                </span>
              )}
            </div>
          )}
          {/* KPI Row */}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
            <KPICard icon="💰" label="Pendapatan" accent="#10b981" color="#059669"
              href="/invoice?status=paid"
              value={formatRupiah(labaRugi.pendapatan?.invoice_terbayar)}
              sub={`Invoice terbayar — klik untuk lihat`} />
            <KPICard icon="🛒" label="HPP (Pembelian)" accent="#ef4444" color="#dc2626"
              href="/belanja"
              value={formatRupiah(labaRugi.harga_pokok_pembelian?.total)}
              sub="Klik untuk lihat transaksi belanja" />
            <KPICard icon="⚙️" label="Biaya Operasional" accent="#f59e0b" color="#b45309"
              href="/operasional"
              value={formatRupiah(labaRugi.biaya_operasional?.total)}
              sub="Klik untuk kelola biaya" />
            <KPICard
              icon={labaRugi.laba_bersih >= 0 ? "📈" : "📉"}
              label="Laba Bersih"
              accent={labaRugi.laba_bersih >= 0 ? "#10b981" : "#ef4444"}
              color={labaRugi.laba_bersih >= 0 ? "#059669" : "#dc2626"}
              href="/laporan/laba-rugi"
              value={`${labaRugi.laba_bersih >= 0 ? "+" : ""}${formatRupiah(labaRugi.laba_bersih)}`}
              sub={`Margin: ${labaRugi.margin_bersih_persen}% — klik untuk detail`} />
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

          {/* Rincian Pembelanjaan per Dapur */}
          {belanjaGrup && (
            <div style={{ background: "white", borderRadius: 14, border: "1px solid var(--color-border)", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)", marginBottom: 24 }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--color-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>🛒 Rincian Pembelanjaan — {belanjaGrup.grup_label}</div>
                  <div style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 2 }}>
                    Berdasarkan PO (approved/delivered/invoiced) dalam periode ini
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 11, color: "var(--color-muted)" }}>Total Belanja</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#dc2626" }}>{formatRupiah(belanjaGrup.total_nilai_pembelanjaan)}</div>
                  </div>
                  <div style={{ textAlign: "right", borderLeft: "1px solid var(--color-border)", paddingLeft: 12 }}>
                    <div style={{ fontSize: 11, color: "var(--color-muted)" }}>Jumlah PO</div>
                    <div style={{ fontSize: 16, fontWeight: 800 }}>{belanjaGrup.total_po}</div>
                  </div>
                </div>
              </div>

              {belanjaGrup.per_dapur?.length > 0 ? (
                <div style={{ padding: "12px 20px" }}>
                  {/* Header */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 80px 100px", gap: 12, padding: "6px 0 10px", borderBottom: "1px solid var(--color-border)", marginBottom: 4 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase" }}>Dapur</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase", textAlign: "right" }}>Jumlah PO</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase", textAlign: "right" }}>%</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase", textAlign: "right" }}>Total</div>
                  </div>
                  {belanjaGrup.per_dapur.map((d, i) => {
                    const pct = belanjaGrup.total_nilai_pembelanjaan > 0
                      ? Math.round((d.total / belanjaGrup.total_nilai_pembelanjaan) * 100)
                      : 0;
                    return (
                      <div key={d.dapur_id} style={{
                        display: "grid", gridTemplateColumns: "1fr 120px 80px 100px", gap: 12,
                        padding: "10px 0", borderBottom: i < belanjaGrup.per_dapur.length - 1 ? "1px solid #f1f5f9" : "none",
                        alignItems: "center",
                      }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{d.nama}</div>
                          <div style={{ marginTop: 5, height: 5, borderRadius: 99, background: "#f1f5f9", overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${pct}%`, borderRadius: 99, background: "#ef4444", transition: "width 0.5s ease" }} />
                          </div>
                        </div>
                        <div style={{ fontSize: 13, textAlign: "right", color: "var(--color-muted)" }}>{d.jumlah_po} PO</div>
                        <div style={{ fontSize: 13, textAlign: "right", color: "var(--color-muted)", fontWeight: 600 }}>{pct}%</div>
                        <div style={{ fontSize: 13, textAlign: "right", fontWeight: 700, color: "#dc2626" }}>{formatRupiah(d.total)}</div>
                      </div>
                    );
                  })}
                  {/* Total row */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 80px 100px", gap: 12, padding: "10px 0 2px", borderTop: "2px solid var(--color-border)", marginTop: 4 }}>
                    <div style={{ fontSize: 13, fontWeight: 800 }}>Total</div>
                    <div style={{ fontSize: 13, textAlign: "right", fontWeight: 700 }}>{belanjaGrup.total_po} PO</div>
                    <div style={{ fontSize: 13, textAlign: "right", fontWeight: 700 }}>100%</div>
                    <div style={{ fontSize: 13, textAlign: "right", fontWeight: 800, color: "#dc2626" }}>{formatRupiah(belanjaGrup.total_nilai_pembelanjaan)}</div>
                  </div>
                </div>
              ) : (
                <div style={{ padding: 32, textAlign: "center", color: "var(--color-muted)", fontSize: 13 }}>
                  Tidak ada pembelanjaan dalam periode ini
                </div>
              )}
            </div>
          )}

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
      <div style={{ marginBottom: 8, fontWeight: 700, fontSize: 13, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Navigasi Cepat</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {[
          { href: "/laporan/laba-rugi", icon: "💹", label: "Laporan Laba Rugi", desc: "Detail P&L per periode", accent: "#10b981" },
          { href: "/laporan/margin", icon: "📉", label: "Analisis Margin Item", desc: "Margin per nama bahan", accent: "#6366f1" },
          { href: "/invoice", icon: "🧧", label: "Invoice & Tagihan", desc: "Daftar semua invoice & margin", accent: "#3b82f6" },
          { href: "/belanja", icon: "🛒", label: "Transaksi Belanja", desc: "Riwayat pembelian & HPP", accent: "#ef4444" },
          { href: "/hutang", icon: "🔴", label: "Hutang Supplier", desc: "Kelola hutang ke supplier", accent: "#f59e0b" },
          { href: "/operasional", icon: "🏢", label: "Biaya Operasional", desc: "Input & kelola biaya rutin", accent: "#8b5cf6" },
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
              <div style={{ fontSize: 11, color: l.accent, fontWeight: 600, marginTop: 8 }}>Buka halaman →</div>
            </div>
          </Link>
        ))}
      </div>
    </Layout>
  );
}
