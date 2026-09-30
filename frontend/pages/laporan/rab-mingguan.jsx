import { useState, useEffect, useRef } from "react";
import { dapurApi, laporanApi } from "@/lib/api";
import { formatRupiah } from "@/components/Layout";

export default function LaporanRABMingguan() {
  const [dapurId, setDapurId] = useState("");
  const [dapurList, setDapurList] = useState([]);
  const [tanggal, setTanggal] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [user, setUser] = useState(null);

  useEffect(() => {
    let u = null;
    try {
      u = JSON.parse(localStorage.getItem("user"));
      setUser(u);
    } catch {}

    if (u && ["operator", "akuntan"].includes(u.role)) {
      setDapurList([{ id: u.dapur_id, nama: "Dapur Saya" }]);
      setDapurId(String(u.dapur_id));
    } else {
      dapurApi.list({ is_active: true }).then((r) => {
        setDapurList(r.data);
      }).catch(console.error);
    }
  }, []);

  const loadData = async () => {
    if (!dapurId) {
      setError("Pilih dapur terlebih dahulu");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await laporanApi.rabMingguanAkuntan(dapurId, tanggal);
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Gagal memuat data laporan");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const displayDate = (isoString) => {
    if (!isoString) return "-";
    const d = new Date(isoString + "T00:00");
    return `${d.getDate().toString().padStart(2, "0")} / ${(d.getMonth() + 1).toString().padStart(2, "0")} / ${d.getFullYear()}`;
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 20px; }
          .no-print { display: none !important; }
          .print-header { text-align: center; margin-bottom: 20px; }
          .print-title { font-size: 20px; font-weight: bold; margin-bottom: 5px; }
          .print-subtitle { font-size: 14px; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
          th { background-color: #f3f4f6 !important; -webkit-print-color-adjust: exact; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .summary-box { margin-top: 20px; padding: 15px; border: 1px solid #ddd; border-radius: 8px; page-break-inside: avoid; }
        }
      `}</style>

      <div className="page-header no-print">
        <div>
          <h1 className="page-title">RAB & Rekap Harian (Mingguan)</h1>
          <p className="page-subtitle">Laporan operasional untuk akuntan</p>
        </div>
      </div>

      <div className="card no-print" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Dapur</label>
            <select
              className="form-control"
              value={dapurId}
              onChange={(e) => setDapurId(e.target.value)}
              disabled={user && ["operator", "akuntan"].includes(user.role)}
            >
              <option value="">-- Pilih Dapur --</option>
              {dapurList.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nama}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Pilih Tanggal (Otomatis cari 1 Minggu)</label>
            <input
              type="date"
              className="form-control"
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" onClick={loadData} disabled={loading} style={{ height: 42 }}>
            {loading ? "⏳ Memuat..." : "🔍 Generate Laporan"}
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-error no-print" style={{ marginBottom: 20 }}>
          {error}
        </div>
      )}

      {data && (
        <div className="card print-area">
          <div className="print-header">
            <div className="print-title">LAPORAN RAB & REKAPAN OPERASIONAL MINGGUAN</div>
            <div className="print-subtitle">
              <strong>Dapur:</strong> {data.dapur_nama} <br />
              <strong>Periode:</strong> {displayDate(data.tanggal_mulai)} s/d {displayDate(data.tanggal_selesai)}
            </div>
          </div>
          
          <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
            <button className="btn btn-outline" onClick={handlePrint}>🖨️ Cetak / Simpan PDF</button>
          </div>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th rowSpan="2" className="text-center" style={{ verticalAlign: "middle" }}>Tanggal</th>
                  <th rowSpan="2" className="text-center" style={{ verticalAlign: "middle" }}>Hari</th>
                  <th colSpan="2" className="text-center">Jumlah PM</th>
                  <th rowSpan="2" className="text-right" style={{ verticalAlign: "middle" }}>Anggaran (Rp)</th>
                  <th rowSpan="2" className="text-right" style={{ verticalAlign: "middle" }}>Invoice / PO<br/><small>(Bahan Baku)</small></th>
                  <th rowSpan="2" className="text-right" style={{ verticalAlign: "middle" }}>Sisa Harian (Rp)</th>
                  <th rowSpan="2" className="text-right" style={{ verticalAlign: "middle" }}>Akumulasi Sisa (Rp)</th>
                </tr>
                <tr>
                  <th className="text-center">Kecil</th>
                  <th className="text-center">Besar</th>
                </tr>
              </thead>
              <tbody>
                {data.hari.map((h, i) => (
                  <tr key={i} style={{ backgroundColor: h.sisa_anggaran < 0 ? "#fef2f2" : "inherit" }}>
                    <td className="text-center">{displayDate(h.tanggal)}</td>
                    <td className="text-center">{h.nama_hari}</td>
                    <td className="text-center">{h.pm_kecil}</td>
                    <td className="text-center">{h.pm_besar}</td>
                    <td className="text-right">{formatRupiah(h.anggaran)}</td>
                    <td className="text-right" style={{ color: "#d97706", fontWeight: 500 }}>
                      {formatRupiah(h.realisasi)}
                    </td>
                    <td className="text-right" style={{ color: h.sisa_anggaran < 0 ? "#dc2626" : "#16a34a", fontWeight: "bold" }}>
                      {h.sisa_anggaran > 0 ? "+" : ""}{formatRupiah(h.sisa_anggaran)}
                    </td>
                    <td className="text-right" style={{ color: h.akumulasi_sisa < 0 ? "#dc2626" : "#16a34a", fontWeight: "bold" }}>
                      {formatRupiah(h.akumulasi_sisa)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ backgroundColor: "#f8fafc", fontWeight: "bold" }}>
                  <td colSpan="4" className="text-right" style={{ padding: "12px 8px" }}>TOTAL MINGGU INI</td>
                  <td className="text-right">{formatRupiah(data.total_anggaran)}</td>
                  <td className="text-right">{formatRupiah(data.total_realisasi)}</td>
                  <td className="text-right" style={{ color: data.sisa_akhir < 0 ? "#dc2626" : "#16a34a" }}>
                    {formatRupiah(data.total_anggaran - data.total_realisasi)}
                  </td>
                  <td className="text-right" style={{ color: data.sisa_akhir < 0 ? "#dc2626" : "#16a34a" }}>
                    {formatRupiah(data.sisa_akhir)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          
          <div className="summary-box">
            <h3 style={{ fontSize: 14, margin: "0 0 10px 0" }}>Ringkasan Eksekutif</h3>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "#374151" }}>
              <li>Total Anggaran Pagu PM selama 1 minggu: <strong>{formatRupiah(data.total_anggaran)}</strong></li>
              <li>Total Pengeluaran / Invoice (Bahan Baku): <strong>{formatRupiah(data.total_realisasi)}</strong></li>
              <li>Status Keuangan: <strong style={{ color: data.sisa_akhir < 0 ? "#dc2626" : "#16a34a" }}>
                {data.sisa_akhir < 0 ? "OVER BUDGET" : "SURPLUS"} sebesar {formatRupiah(Math.abs(data.sisa_akhir))}
              </strong></li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
