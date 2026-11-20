import { useEffect, useMemo, useState } from "react";
import { rekonsiliasiKasApi } from "@/lib/api";
import { formatRupiah } from "@/components/Layout";
import WeekRangePicker from "@/components/WeekRangePicker";
import { getLocalDateString, getSundaySaturdayRange } from "@/lib/weekRange";

function formatDate(value) {
  if (!value) return "—";
  return new Date(`${value}T00:00:00`).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function ArusKasPage() {
  const [weekDate, setWeekDate] = useState("");
  const [dailySummary, setDailySummary] = useState([]);
  const [mutasis, setMutasis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const period = useMemo(() => getSundaySaturdayRange(weekDate), [weekDate]);
  const handleWeekChange = (value) => {
    setLoading(true);
    setWeekDate(value);
  };

  useEffect(() => {
    Promise.resolve().then(() => setWeekDate(getLocalDateString()));
  }, []);

  useEffect(() => {
    if (!period) return undefined;
    let active = true;
    const params = {
      tanggal_mulai: period.start,
      tanggal_selesai: period.end,
    };

    Promise.all([
      rekonsiliasiKasApi.dailySummary(params),
      rekonsiliasiKasApi.list(params),
    ])
      .then(([summaryResponse, mutasiResponse]) => {
        if (!active) return;
        setDailySummary(summaryResponse.data);
        setMutasis(mutasiResponse.data);
        setError("");
      })
      .catch(e => {
        if (active) setError(e.response?.data?.detail || "Gagal memuat arus kas.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [period]);

  const totals = dailySummary.reduce((result, day) => ({
    kredit: result.kredit + day.kredit,
    debit: result.debit + day.debit,
    arusBersih: result.arusBersih + day.arus_bersih,
    debitBelumCocok: result.debitBelumCocok + day.debit_belum_cocok,
    jumlahBelumCocok: result.jumlahBelumCocok + day.jumlah_belum_cocok,
  }), {
    kredit: 0,
    debit: 0,
    arusBersih: 0,
    debitBelumCocok: 0,
    jumlahBelumCocok: 0,
  });

  const firstDay = dailySummary[0];
  const lastDay = dailySummary[dailySummary.length - 1];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">💸 Arus Kas</h1>
          <p className="page-subtitle">Ringkasan kas masuk, kas keluar, dan saldo untuk closing mingguan.</p>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 12 }} onClick={() => setError("")}>
          {error} ✕
        </div>
      )}

      <div className="card" style={{ marginBottom: 16, padding: 16 }}>
        <WeekRangePicker value={weekDate} onChange={handleWeekChange} />
      </div>

      {loading ? (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <div className="spinner" style={{ width: 32, height: 32, margin: "auto" }} />
        </div>
      ) : (
        <>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
            marginBottom: 16,
          }}>
            {[
              { label: "Kas masuk", value: formatRupiah(totals.kredit), color: "#047857" },
              { label: "Kas keluar", value: formatRupiah(totals.debit), color: "#dc2626" },
              { label: "Arus bersih", value: formatRupiah(totals.arusBersih), color: "var(--color-text)" },
              {
                label: "Debit belum cocok",
                value: `${totals.jumlahBelumCocok} baris • ${formatRupiah(totals.debitBelumCocok)}`,
                color: totals.jumlahBelumCocok ? "#b91c1c" : "#047857",
              },
            ].map(item => (
              <div key={item.label} className="card" style={{ padding: 16 }}>
                <div style={{ color: "var(--color-muted)", fontSize: 12 }}>{item.label}</div>
                <strong style={{ display: "block", marginTop: 6, color: item.color, fontSize: 17 }}>
                  {item.value}
                </strong>
              </div>
            ))}
          </div>

          <div className="card" style={{ marginBottom: 16, padding: 16, overflowX: "auto" }}>
            <h2 style={{ fontSize: 16, margin: "0 0 12px" }}>Closing harian</h2>
            {dailySummary.length === 0 ? (
              <div style={{ padding: 20, textAlign: "center", color: "var(--color-muted)" }}>
                Belum ada mutasi pada periode ini.
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 850, fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
                    <th style={{ padding: 8 }}>Hari / tanggal</th>
                    <th style={{ padding: 8 }}>Uang masuk</th>
                    <th style={{ padding: 8 }}>Uang keluar</th>
                    <th style={{ padding: 8 }}>Arus bersih</th>
                    <th style={{ padding: 8 }}>Saldo awal*</th>
                    <th style={{ padding: 8 }}>Saldo akhir</th>
                    <th style={{ padding: 8 }}>Belum cocok</th>
                  </tr>
                </thead>
                <tbody>
                  {dailySummary.map(day => (
                    <tr key={day.tanggal} style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <td style={{ padding: 8 }}>{formatDate(day.tanggal)}</td>
                      <td style={{ padding: 8, color: "#047857" }}>{formatRupiah(day.kredit)}</td>
                      <td style={{ padding: 8, color: "#dc2626" }}>{formatRupiah(day.debit)}</td>
                      <td style={{ padding: 8 }}>{formatRupiah(day.arus_bersih)}</td>
                      <td style={{ padding: 8 }}>{day.saldo_awal == null ? "—" : formatRupiah(day.saldo_awal)}</td>
                      <td style={{ padding: 8 }}>{day.saldo_akhir == null ? "—" : formatRupiah(day.saldo_akhir)}</td>
                      <td style={{ padding: 8, color: day.jumlah_belum_cocok ? "#b91c1c" : "#047857" }}>
                        {day.jumlah_belum_cocok} baris • {formatRupiah(day.debit_belum_cocok)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ fontSize: 11, color: "var(--color-muted)", marginTop: 8 }}>
              * Saldo awal dihitung dari saldo akhir dikurangi arus bersih rekening koran yang diimpor.
              {firstDay?.saldo_awal != null && lastDay?.saldo_akhir != null
                ? ` Saldo periode: ${formatRupiah(firstDay.saldo_awal)} – ${formatRupiah(lastDay.saldo_akhir)}.`
                : ""}
            </div>
          </div>

          <div className="card" style={{ padding: 16, overflowX: "auto" }}>
            <h2 style={{ fontSize: 16, margin: "0 0 12px" }}>Rincian transaksi</h2>
            {mutasis.length === 0 ? (
              <div style={{ padding: 20, textAlign: "center", color: "var(--color-muted)" }}>
                Tidak ada transaksi pada periode ini.
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760, fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
                    <th style={{ padding: 8 }}>Tanggal</th>
                    <th style={{ padding: 8 }}>Deskripsi</th>
                    <th style={{ padding: 8 }}>Jenis</th>
                    <th style={{ padding: 8 }}>Jumlah</th>
                    <th style={{ padding: 8 }}>Saldo</th>
                    <th style={{ padding: 8 }}>Pencocokan</th>
                  </tr>
                </thead>
                <tbody>
                  {mutasis.map(mutasi => {
                    const isCredit = mutasi.jenis === "kredit";
                    return (
                      <tr key={mutasi.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <td style={{ padding: 8, whiteSpace: "nowrap" }}>
                          {formatDate(mutasi.tanggal)}
                          {mutasi.waktu ? ` • ${mutasi.waktu.slice(11, 19)}` : ""}
                        </td>
                        <td style={{ padding: 8 }}>{mutasi.deskripsi || "—"}</td>
                        <td style={{ padding: 8, color: isCredit ? "#047857" : "#dc2626" }}>
                          {isCredit ? "Kas masuk" : "Kas keluar"}
                        </td>
                        <td style={{ padding: 8, whiteSpace: "nowrap", color: isCredit ? "#047857" : "#dc2626" }}>
                          {isCredit ? "+" : "−"}{formatRupiah(mutasi.jumlah)}
                        </td>
                        <td style={{ padding: 8, whiteSpace: "nowrap" }}>
                          {mutasi.saldo == null ? "—" : formatRupiah(mutasi.saldo)}
                        </td>
                        <td style={{ padding: 8 }}>
                          {isCredit
                            ? "—"
                            : mutasi.transaksi_belanja
                              ? `Cocok • ${mutasi.transaksi_belanja.supplier_nama || "Tanpa supplier"}`
                              : "Belum cocok"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
