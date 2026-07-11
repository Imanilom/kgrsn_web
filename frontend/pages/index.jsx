import { useEffect, useState } from "react";
import { dashboardApi } from "@/lib/api";
import { formatRupiah } from "@/components/Layout";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6"];

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [trend, setTrend] = useState([]);
  const [perDapur, setPerDapur] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      dashboardApi.summary(),
      dashboardApi.monthlyTrend(),
      dashboardApi.poPerDapur(),
    ]).then(([s, t, d]) => {
      setSummary(s.data);
      setTrend(t.data);
      setPerDapur(d.data);
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="loading-overlay">
      <div style={{ textAlign: "center" }}>
        <div className="spinner" style={{ width: 40, height: 40, borderWidth: 4 }}></div>
        <p style={{ marginTop: 12, color: "var(--color-muted)" }}>Memuat dashboard...</p>
      </div>
    </div>
  );

  const stats = summary ? [
    { label: "Total PO", value: summary.total_po, icon: "📋", color: "primary" },
    { label: "PO Menunggu Approval", value: summary.po_draft, icon: "⏳", color: "warning" },
    { label: "Invoice Belum Lunas", value: summary.invoice_unpaid, icon: "💸", color: "danger" },
    { label: "Total Nilai Invoice", value: formatRupiah(summary.total_invoice_value), icon: "💰", color: "success" },
    { label: "Total Nilai PO (Beli)", value: formatRupiah(summary.total_po_value), icon: "📦", color: "info" },
    { label: "Jumlah Dapur Aktif", value: summary.total_dapur, icon: "🍳", color: "primary" },
  ] : [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Ringkasan aktivitas Purchase Order</p>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="stat-grid">
        {stats.map((s, i) => (
          <div key={i} className="stat-card">
            <div className={`stat-icon ${s.color}`}>{s.icon}</div>
            <div>
              <div className="stat-value">{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
        {/* Monthly Trend */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">📈 Trend PO per Bulan</div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={trend} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="bulan" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(val, name) => [
                  name === "total_nilai" ? formatRupiah(val) : val,
                  name === "total_nilai" ? "Nilai" : "Jumlah PO"
                ]}
              />
              <Bar dataKey="total_po" fill="#6366f1" radius={[4, 4, 0, 0]} name="total_po" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* PO per Dapur */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">🍳 PO per Dapur</div>
          </div>
          {perDapur.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={perDapur}
                  dataKey="total_po"
                  nameKey="nama"
                  cx="50%" cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={3}
                >
                  {perDapur.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(val) => [`${val} PO`, "Jumlah"]} />
                <Legend iconType="circle" iconSize={10} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">📊</div>
              <div className="empty-state-title">Belum ada data</div>
            </div>
          )}
        </div>
      </div>

      {/* Per Dapur Table */}
      {perDapur.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">📊 Rekapitulasi per Dapur</div>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Dapur</th>
                  <th style={{ textAlign: "right" }}>Total PO</th>
                  <th style={{ textAlign: "right" }}>Total Nilai PO</th>
                </tr>
              </thead>
              <tbody>
                {perDapur.map((d, i) => (
                  <tr key={i}>
                    <td><strong>{d.nama}</strong></td>
                    <td style={{ textAlign: "right" }}>{d.total_po}</td>
                    <td style={{ textAlign: "right" }} className="rupiah">{formatRupiah(d.total_nilai)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

Dashboard.title = "Dashboard";
Dashboard.subtitle = "Ringkasan sistem PO";
