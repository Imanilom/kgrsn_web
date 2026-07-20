import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { piutangApi, invoiceApi, dapurApi } from "@/lib/api";

const formatRupiah = (v) => `Rp ${parseFloat(v || 0).toLocaleString("id-ID")}`;
const formatDate = (d) => d ? new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const STATUS_MAP = {
  belum_lunas: { bg: "rgba(239,68,68,0.10)", text: "#dc2626", border: "rgba(239,68,68,0.25)", dot: "#ef4444", label: "Belum Lunas" },
  sebagian:    { bg: "rgba(245,158,11,0.10)", text: "#b45309", border: "rgba(245,158,11,0.25)", dot: "#f59e0b", label: "Sebagian" },
  lunas:       { bg: "rgba(16,185,129,0.10)", text: "#059669", border: "rgba(16,185,129,0.25)", dot: "#10b981", label: "Lunas" },
};

function StatusBadge({ status }) {
  const s = STATUS_MAP[status] || STATUS_MAP.belum_lunas;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700,
      background: s.bg, color: s.text, border: `1px solid ${s.border}`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot, display: "inline-block" }} />
      {s.label}
    </span>
  );
}

function SummaryCard({ icon, label, value, sub, color, accent }) {
  return (
    <div style={{
      background: "white", borderRadius: 14, padding: "20px 22px",
      border: "1px solid var(--color-border)", boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
      borderLeft: `4px solid ${accent}`, position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", top: 12, right: 16, fontSize: 26, opacity: 0.12 }}>{icon}</div>
      <div style={{ fontSize: 11, color: "var(--color-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Modal({ show, onClose, title, subtitle, children }) {
  if (!show) return null;
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)",
      zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20, backdropFilter: "blur(4px)",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "white", borderRadius: 16, width: "100%", maxWidth: 520,
        maxHeight: "90vh", overflow: "auto",
        boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
        animation: "slideUp 0.2s ease",
      }}>
        <div style={{ padding: "22px 26px", borderBottom: "1px solid var(--color-border)" }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>{title}</div>
          {subtitle && <div style={{ fontSize: 13, color: "var(--color-muted)", marginTop: 3 }}>{subtitle}</div>}
        </div>
        <div style={{ padding: "22px 26px" }}>{children}</div>
      </div>
    </div>
  );
}

function FormRow({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</label>
      {children}
    </div>
  );
}

export default function PiutangPage() {
  const [piutangs, setPiutangs] = useState([]);
  const [dapur, setDapur] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ dapur_id: "", status: "" });
  const [showCreate, setShowCreate] = useState(false);
  const [showBayar, setShowBayar] = useState(null);
  const defaultJatuhTempoStr = (() => { const d = new Date(); d.setDate(d.getDate() + 3); return d.toISOString().slice(0, 10); })();
  const [form, setForm] = useState({ invoice_id: "", dapur_id: "", jumlah: "", jatuh_tempo: defaultJatuhTempoStr });
  const [bayarForm, setBayarForm] = useState({ jumlah_bayar: "", catatan: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filter.dapur_id) params.dapur_id = filter.dapur_id;
      if (filter.status) params.status = filter.status;
      const [pRes, dRes, sumRes] = await Promise.all([
        piutangApi.list(params),
        dapurApi.list(),
        piutangApi.summary(),
      ]);
      setPiutangs(pRes.data);
      setDapur(dRes.data);
      setSummary(sumRes.data);
    } catch { setError("Gagal memuat data"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [filter]);
  useEffect(() => {
    invoiceApi.list({ status: "unpaid" }).then(r => setInvoices(r.data)).catch(() => {});
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      await piutangApi.create({ ...form, jumlah: parseFloat(form.jumlah), invoice_id: parseInt(form.invoice_id), dapur_id: parseInt(form.dapur_id) });
      setSuccess("Piutang berhasil dicatat");
      setShowCreate(false);
      setForm({ invoice_id: "", dapur_id: "", jumlah: "", jatuh_tempo: "" });
      load();
    } catch (err) { setError(err.response?.data?.detail || "Gagal menyimpan"); }
    finally { setSaving(false); }
  };

  const handleBayar = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      await piutangApi.bayar(showBayar.id, { jumlah_bayar: parseFloat(bayarForm.jumlah_bayar), catatan: bayarForm.catatan });
      setSuccess("Pembayaran piutang dicatat");
      setShowBayar(null);
      setBayarForm({ jumlah_bayar: "", catatan: "" });
      load();
    } catch (err) { setError(err.response?.data?.detail || "Gagal menyimpan"); }
    finally { setSaving(false); }
  };

  const overdueCount = piutangs.filter(p => p.jatuh_tempo && new Date(p.jatuh_tempo) < new Date() && p.status !== "lunas").length;

  return (
    <Layout title="Piutang Dapur">
      <style>{`
        @keyframes slideUp { from { transform: translateY(16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .inp { width:100%; padding:9px 12px; border:1.5px solid var(--color-border); border-radius:8px; font-size:13.5px; font-family:inherit; color:var(--color-text); background:white; outline:none; transition:border-color 0.15s,box-shadow 0.15s; }
        .inp:focus { border-color:var(--color-primary); box-shadow:0 0 0 3px rgba(99,102,241,0.12); }
        .ptrow:hover td { background:#fffdf5; }
        .ptrow td { transition:background 0.12s; }
      `}</style>

      {/* Page Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>💰 Piutang Dapur</h1>
          <p style={{ color: "var(--color-muted)", margin: "4px 0 0", fontSize: 13 }}>
            Tagihan invoice yang belum dibayar oleh dapur
            {overdueCount > 0 && (
              <span style={{ marginLeft: 10, background: "rgba(245,158,11,0.12)", color: "#b45309", padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 700 }}>
                ⚠️ {overdueCount} jatuh tempo
              </span>
            )}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>＋ Catat Piutang</button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          <span>⚠️ {error}</span>
          <button onClick={() => setError("")} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
      )}
      {success && (
        <div className="alert alert-success" style={{ marginBottom: 16 }}>
          <span>✅ {success}</span>
          <button onClick={() => setSuccess("")} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
          <SummaryCard icon="📊" label="Total Piutang" value={formatRupiah(summary.total_piutang)} color="#6366f1" accent="#6366f1"
            sub={`${summary.jumlah_piutang || 0} transaksi`} />
          <SummaryCard icon="✅" label="Sudah Diterima" value={formatRupiah(summary.total_terbayar)} color="#059669" accent="#10b981"
            sub="Pembayaran terkonfirmasi" />
          <SummaryCard icon="⏳" label="Sisa Piutang" value={formatRupiah(summary.total_sisa)} color="#b45309" accent="#f59e0b"
            sub={overdueCount > 0 ? `⚠️ ${overdueCount} melewati jatuh tempo` : "Belum ada yang jatuh tempo"} />
        </div>
      )}

      {/* Filter Bar */}
      <div style={{
        background: "white", borderRadius: 12, padding: "14px 18px", marginBottom: 20,
        border: "1px solid var(--color-border)", display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 160 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Dapur</label>
          <select className="inp" style={{ padding: "7px 10px" }} value={filter.dapur_id} onChange={e => setFilter({ ...filter, dapur_id: e.target.value })}>
            <option value="">Semua Dapur</option>
            {dapur.map(d => <option key={d.id} value={d.id}>{d.nama}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 140 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Status</label>
          <select className="inp" style={{ padding: "7px 10px" }} value={filter.status} onChange={e => setFilter({ ...filter, status: e.target.value })}>
            <option value="">Semua Status</option>
            <option value="belum_lunas">Belum Lunas</option>
            <option value="sebagian">Sebagian</option>
            <option value="lunas">Lunas</option>
          </select>
        </div>
        {(filter.dapur_id || filter.status) && (
          <button className="btn btn-ghost btn-sm" onClick={() => setFilter({ dapur_id: "", status: "" })}>✕ Reset</button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 80, color: "var(--color-muted)" }}>
          <div className="spinner" style={{ width: 28, height: 28, margin: "0 auto 12px" }} />
          <div style={{ fontSize: 13 }}>Memuat data piutang...</div>
        </div>
      ) : (
        <div style={{ background: "white", borderRadius: 14, border: "1px solid var(--color-border)", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Invoice", "Dapur", "Jatuh Tempo", "Total Piutang", "Terbayar", "Sisa", "Status", "Aksi"].map(h => (
                  <th key={h} style={{
                    padding: "11px 14px", textAlign: "left", fontSize: 11, fontWeight: 700,
                    color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.05em",
                    borderBottom: "2px solid var(--color-border)", whiteSpace: "nowrap",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {piutangs.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: "56px 20px", color: "var(--color-muted)" }}>
                    <div style={{ fontSize: 36, marginBottom: 10 }}>📭</div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>Belum ada data piutang</div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>Klik "Catat Piutang" untuk mulai mencatat</div>
                  </td>
                </tr>
              ) : piutangs.map(p => {
                const isOverdue = p.jatuh_tempo && new Date(p.jatuh_tempo) < new Date() && p.status !== "lunas";
                const sisaPct = p.jumlah > 0 ? Math.round((p.jumlah_terbayar / p.jumlah) * 100) : 0;
                return (
                  <tr key={p.id} className="ptrow" style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "12px 14px" }}>
                      <span style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--color-primary)", fontSize: 12 }}>
                        #{p.invoice_id}
                      </span>
                    </td>
                    <td style={{ padding: "12px 14px", fontWeight: 700, fontSize: 13 }}>{p.dapur?.nama}</td>
                    <td style={{ padding: "12px 14px", fontSize: 13 }}>
                      <span style={{ color: isOverdue ? "#dc2626" : "var(--color-text)", fontWeight: isOverdue ? 700 : 400 }}>
                        {formatDate(p.jatuh_tempo)}
                        {isOverdue && <span style={{ marginLeft: 4, background: "rgba(245,158,11,0.12)", color: "#b45309", padding: "1px 6px", borderRadius: 99, fontSize: 10, fontWeight: 700 }}>OVERDUE</span>}
                      </span>
                    </td>
                    <td style={{ padding: "12px 14px", fontWeight: 700, fontSize: 13 }}>{formatRupiah(p.jumlah)}</td>
                    <td style={{ padding: "12px 14px", fontSize: 13 }}>
                      <div style={{ color: "#059669", fontWeight: 600 }}>{formatRupiah(p.jumlah_terbayar)}</div>
                      <div style={{ marginTop: 4, height: 4, background: "#f1f5f9", borderRadius: 99, overflow: "hidden", width: 70 }}>
                        <div style={{ height: "100%", width: `${sisaPct}%`, background: "#10b981", borderRadius: 99 }} />
                      </div>
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <span style={{ fontWeight: 800, fontSize: 13, color: parseFloat(p.sisa) > 0 ? "#b45309" : "#059669" }}>
                        {formatRupiah(p.sisa)}
                      </span>
                    </td>
                    <td style={{ padding: "12px 14px" }}><StatusBadge status={p.status} /></td>
                    <td style={{ padding: "12px 14px" }}>
                      {p.status !== "lunas" ? (
                        <button className="btn btn-success btn-sm"
                          onClick={() => { setShowBayar(p); setBayarForm({ jumlah_bayar: p.sisa, catatan: "" }); }}>
                          💵 Terima
                        </button>
                      ) : (
                        <span style={{ fontSize: 18 }}>✅</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: Catat Piutang */}
      <Modal show={showCreate} onClose={() => setShowCreate(false)} title="Catat Piutang dari Invoice" subtitle="Buat catatan piutang dapur baru">
        <form onSubmit={handleCreate}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <FormRow label="Invoice (Unpaid) *">
              <select className="inp" value={form.invoice_id}
                onChange={e => {
                  const inv = invoices.find(i => i.id === parseInt(e.target.value));
                  setForm({ ...form, invoice_id: e.target.value, dapur_id: inv?.dapur_id || "", jumlah: inv?.total || "" });
                }} required>
                <option value="">Pilih invoice...</option>
                {invoices.map(i => (
                  <option key={i.id} value={i.id}>{i.nomor_invoice} — {i.dapur?.nama} — {formatRupiah(i.total)}</option>
                ))}
              </select>
            </FormRow>
            <FormRow label="Dapur *">
              <select className="inp" value={form.dapur_id} onChange={e => setForm({ ...form, dapur_id: e.target.value })} required>
                <option value="">Pilih dapur...</option>
                {dapur.map(d => <option key={d.id} value={d.id}>{d.nama}</option>)}
              </select>
            </FormRow>
            <FormRow label="Jumlah Piutang (Rp) *">
              <input className="inp" type="number" value={form.jumlah} onChange={e => setForm({ ...form, jumlah: e.target.value })} required min={0} />
            </FormRow>
            <FormRow label="Jatuh Tempo">
              <input className="inp" type="date" value={form.jatuh_tempo} onChange={e => setForm({ ...form, jatuh_tempo: e.target.value })} />
            </FormRow>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-ghost" onClick={() => setShowCreate(false)}>Batal</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Menyimpan..." : "Simpan Piutang"}</button>
          </div>
        </form>
      </Modal>

      {/* Modal: Terima Pembayaran */}
      <Modal
        show={!!showBayar} onClose={() => setShowBayar(null)}
        title="Terima Pembayaran Piutang"
        subtitle={showBayar ? `${showBayar.dapur?.nama} • Sisa: ${formatRupiah(showBayar.sisa)}` : ""}
      >
        <form onSubmit={handleBayar}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {showBayar && (
              <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                  <span style={{ color: "#92400e" }}>Terbayar</span>
                  <span style={{ fontWeight: 700, color: "#b45309" }}>
                    {showBayar.jumlah > 0 ? Math.round((showBayar.jumlah_terbayar / showBayar.jumlah) * 100) : 0}%
                  </span>
                </div>
                <div style={{ height: 8, background: "#fde68a", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    width: `${showBayar.jumlah > 0 ? Math.round((showBayar.jumlah_terbayar / showBayar.jumlah) * 100) : 0}%`,
                    background: "linear-gradient(90deg, #f59e0b, #d97706)", borderRadius: 99,
                  }} />
                </div>
              </div>
            )}
            <FormRow label="Jumlah Diterima (Rp) *">
              <input className="inp" type="number" value={bayarForm.jumlah_bayar}
                onChange={e => setBayarForm({ ...bayarForm, jumlah_bayar: e.target.value })}
                max={showBayar ? parseFloat(showBayar.sisa) : undefined} required min={0} />
            </FormRow>
            <FormRow label="Catatan">
              <input className="inp" value={bayarForm.catatan}
                onChange={e => setBayarForm({ ...bayarForm, catatan: e.target.value })} placeholder="Opsional..." />
            </FormRow>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-ghost" onClick={() => setShowBayar(null)}>Batal</button>
            <button type="submit" className="btn btn-success" disabled={saving}>{saving ? "Menyimpan..." : "Konfirmasi Terima"}</button>
          </div>
        </form>
      </Modal>
    </Layout>
  );
}
