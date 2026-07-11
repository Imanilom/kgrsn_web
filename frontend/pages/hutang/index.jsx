import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { hutangApi, supplierApi } from "@/lib/api";

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
          <div style={{ fontSize: 17, fontWeight: 800, color: "var(--color-text)" }}>{title}</div>
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

export default function HutangPage() {
  const [hutangs, setHutangs] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ supplier_id: "", status: "" });
  const [showCreate, setShowCreate] = useState(false);
  const [showBayar, setShowBayar] = useState(null);
  const [form, setForm] = useState({ supplier_id: "", tanggal: new Date().toISOString().split("T")[0], jatuh_tempo: "", jumlah: "", deskripsi: "" });
  const [bayarForm, setBayarForm] = useState({ tanggal_bayar: new Date().toISOString().split("T")[0], jumlah_bayar: "", metode: "transfer", referensi: "", catatan: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filter.supplier_id) params.supplier_id = filter.supplier_id;
      if (filter.status) params.status = filter.status;
      const [hRes, sRes, sumRes] = await Promise.all([
        hutangApi.list(params),
        supplierApi.list(),
        hutangApi.summary(),
      ]);
      setHutangs(hRes.data);
      setSuppliers(sRes.data);
      setSummary(sumRes.data);
    } catch { setError("Gagal memuat data"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [filter]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      await hutangApi.create({ ...form, jumlah: parseFloat(form.jumlah), supplier_id: parseInt(form.supplier_id) });
      setSuccess("Hutang berhasil dicatat");
      setShowCreate(false);
      setForm({ supplier_id: "", tanggal: new Date().toISOString().split("T")[0], jatuh_tempo: "", jumlah: "", deskripsi: "" });
      load();
    } catch (err) { setError(err.response?.data?.detail || "Gagal menyimpan"); }
    finally { setSaving(false); }
  };

  const handleBayar = async (e) => {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      await hutangApi.bayar(showBayar.id, { ...bayarForm, jumlah_bayar: parseFloat(bayarForm.jumlah_bayar) });
      setSuccess("Pembayaran berhasil dicatat");
      setShowBayar(null);
      setBayarForm({ tanggal_bayar: new Date().toISOString().split("T")[0], jumlah_bayar: "", metode: "transfer", referensi: "", catatan: "" });
      load();
    } catch (err) { setError(err.response?.data?.detail || "Gagal menyimpan pembayaran"); }
    finally { setSaving(false); }
  };

  const overdueCount = hutangs.filter(h => h.jatuh_tempo && new Date(h.jatuh_tempo) < new Date() && h.status !== "lunas").length;

  return (
    <Layout title="Hutang Supplier">
      <style>{`
        @keyframes slideUp { from { transform: translateY(16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .inp { width:100%; padding:9px 12px; border:1.5px solid var(--color-border); border-radius:8px; font-size:13.5px; font-family:inherit; color:var(--color-text); background:white; outline:none; transition:border-color 0.15s,box-shadow 0.15s; }
        .inp:focus { border-color:var(--color-primary); box-shadow:0 0 0 3px rgba(99,102,241,0.12); }
        .htrow:hover td { background:#fafbff; }
        .htrow td { transition: background 0.12s; }
      `}</style>

      {/* Page Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: "var(--color-text)" }}>
            💸 Hutang Supplier
          </h1>
          <p style={{ color: "var(--color-muted)", margin: "4px 0 0", fontSize: 13 }}>
            Kelola hutang pembelian ke supplier
            {overdueCount > 0 && (
              <span style={{ marginLeft: 10, background: "rgba(239,68,68,0.12)", color: "#dc2626", padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 700 }}>
                ⚠️ {overdueCount} lewat jatuh tempo
              </span>
            )}
          </p>
        </div>
        <button className="btn btn-primary" style={{ gap: 6 }} onClick={() => setShowCreate(true)}>
          ＋ Catat Hutang
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          <span>⚠️ {error}</span>
          <button onClick={() => setError("")} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: 16 }}>✕</button>
        </div>
      )}
      {success && (
        <div className="alert alert-success" style={{ marginBottom: 16 }}>
          <span>✅ {success}</span>
          <button onClick={() => setSuccess("")} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: 16 }}>✕</button>
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
          <SummaryCard icon="📊" label="Total Hutang" value={formatRupiah(summary.total_hutang)} color="#6366f1" accent="#6366f1"
            sub={`${summary.jumlah_hutang || 0} transaksi`} />
          <SummaryCard icon="✅" label="Sudah Dibayar" value={formatRupiah(summary.total_terbayar)} color="#059669" accent="#10b981"
            sub="Pembayaran terkonfirmasi" />
          <SummaryCard icon="🔴" label="Sisa Hutang" value={formatRupiah(summary.total_sisa)} color="#dc2626" accent="#ef4444"
            sub={summary.jumlah_lewat_jatuh_tempo > 0 ? `⚠️ ${summary.jumlah_lewat_jatuh_tempo} tagihan jatuh tempo` : "Belum ada yang jatuh tempo"} />
        </div>
      )}

      {/* Filter Bar */}
      <div style={{
        background: "white", borderRadius: 12, padding: "14px 18px", marginBottom: 20,
        border: "1px solid var(--color-border)", display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 180 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Supplier</label>
          <select className="inp" style={{ padding: "7px 10px" }} value={filter.supplier_id} onChange={e => setFilter({ ...filter, supplier_id: e.target.value })}>
            <option value="">Semua Supplier</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.nama}</option>)}
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
        {(filter.supplier_id || filter.status) && (
          <button className="btn btn-ghost btn-sm" onClick={() => setFilter({ supplier_id: "", status: "" })}>
            ✕ Reset Filter
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 80, color: "var(--color-muted)" }}>
          <div className="spinner" style={{ width: 28, height: 28, margin: "0 auto 12px" }} />
          <div style={{ fontSize: 13 }}>Memuat data hutang...</div>
        </div>
      ) : (
        <div style={{ background: "white", borderRadius: 14, border: "1px solid var(--color-border)", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["No. Hutang", "Supplier", "Tanggal", "Jatuh Tempo", "Total Hutang", "Terbayar", "Sisa", "Status", "Aksi"].map(h => (
                  <th key={h} style={{
                    padding: "11px 14px", textAlign: "left", fontSize: 11, fontWeight: 700,
                    color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.05em",
                    borderBottom: "2px solid var(--color-border)", whiteSpace: "nowrap",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hutangs.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", padding: "56px 20px", color: "var(--color-muted)" }}>
                    <div style={{ fontSize: 36, marginBottom: 10 }}>📭</div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>Belum ada data hutang</div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>Klik "Catat Hutang" untuk mulai mencatat</div>
                  </td>
                </tr>
              ) : hutangs.map(h => {
                const isOverdue = h.jatuh_tempo && new Date(h.jatuh_tempo) < new Date() && h.status !== "lunas";
                const sisaPct = h.jumlah > 0 ? Math.round((h.jumlah_terbayar / h.jumlah) * 100) : 0;
                return (
                  <tr key={h.id} className="htrow" style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "12px 14px" }}>
                      <span style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--color-primary)", fontSize: 12 }}>{h.nomor_hutang}</span>
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{h.supplier?.nama}</div>
                      {h.deskripsi && <div style={{ fontSize: 11, color: "var(--color-muted)", marginTop: 2 }}>{h.deskripsi}</div>}
                    </td>
                    <td style={{ padding: "12px 14px", fontSize: 13, color: "var(--color-muted)" }}>{formatDate(h.tanggal)}</td>
                    <td style={{ padding: "12px 14px", fontSize: 13 }}>
                      <span style={{ color: isOverdue ? "#dc2626" : "var(--color-text)", fontWeight: isOverdue ? 700 : 400 }}>
                        {formatDate(h.jatuh_tempo)}
                        {isOverdue && <span style={{ marginLeft: 4, background: "rgba(239,68,68,0.12)", color: "#dc2626", padding: "1px 6px", borderRadius: 99, fontSize: 10, fontWeight: 700 }}>OVERDUE</span>}
                      </span>
                    </td>
                    <td style={{ padding: "12px 14px", fontWeight: 700, fontSize: 13 }}>{formatRupiah(h.jumlah)}</td>
                    <td style={{ padding: "12px 14px", fontSize: 13 }}>
                      <div style={{ color: "#059669", fontWeight: 600 }}>{formatRupiah(h.jumlah_terbayar)}</div>
                      <div style={{ marginTop: 4, height: 4, background: "#f1f5f9", borderRadius: 99, overflow: "hidden", width: 70 }}>
                        <div style={{ height: "100%", width: `${sisaPct}%`, background: "#10b981", borderRadius: 99 }} />
                      </div>
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <span style={{ fontWeight: 800, fontSize: 13, color: parseFloat(h.sisa) > 0 ? "#dc2626" : "#059669" }}>
                        {formatRupiah(h.sisa)}
                      </span>
                    </td>
                    <td style={{ padding: "12px 14px" }}><StatusBadge status={h.status} /></td>
                    <td style={{ padding: "12px 14px" }}>
                      {h.status !== "lunas" ? (
                        <button className="btn btn-primary btn-sm"
                          onClick={() => { setShowBayar(h); setBayarForm({ ...bayarForm, jumlah_bayar: h.sisa }); }}>
                          💳 Bayar
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

      {/* Modal: Catat Hutang */}
      <Modal show={showCreate} onClose={() => setShowCreate(false)} title="Catat Hutang Baru" subtitle="Tambah catatan hutang ke supplier">
        <form onSubmit={handleCreate}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <FormRow label="Supplier *">
              <select className="inp" value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value })} required>
                <option value="">Pilih supplier...</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.nama}</option>)}
              </select>
            </FormRow>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <FormRow label="Tanggal Hutang *">
                <input className="inp" type="date" value={form.tanggal} onChange={e => setForm({ ...form, tanggal: e.target.value })} required />
              </FormRow>
              <FormRow label="Jatuh Tempo">
                <input className="inp" type="date" value={form.jatuh_tempo} onChange={e => setForm({ ...form, jatuh_tempo: e.target.value })} />
              </FormRow>
            </div>
            <FormRow label="Jumlah Hutang (Rp) *">
              <input className="inp" type="number" value={form.jumlah} onChange={e => setForm({ ...form, jumlah: e.target.value })} required min={0} placeholder="0" />
            </FormRow>
            <FormRow label="Deskripsi">
              <input className="inp" value={form.deskripsi} onChange={e => setForm({ ...form, deskripsi: e.target.value })} placeholder="Pembelian bahan baku periode..." />
            </FormRow>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-ghost" onClick={() => setShowCreate(false)}>Batal</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Menyimpan..." : "Simpan Hutang"}</button>
          </div>
        </form>
      </Modal>

      {/* Modal: Bayar Hutang */}
      <Modal
        show={!!showBayar} onClose={() => setShowBayar(null)}
        title="Catat Pembayaran Hutang"
        subtitle={showBayar ? `${showBayar.supplier?.nama} • Sisa: ${formatRupiah(showBayar.sisa)}` : ""}
      >
        <form onSubmit={handleBayar}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Progress bar */}
            {showBayar && (
              <div style={{ background: "#f8fafc", borderRadius: 10, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                  <span style={{ color: "var(--color-muted)" }}>Terbayar</span>
                  <span style={{ fontWeight: 700 }}>
                    {showBayar.jumlah > 0 ? Math.round((showBayar.jumlah_terbayar / showBayar.jumlah) * 100) : 0}%
                  </span>
                </div>
                <div style={{ height: 8, background: "#e2e8f0", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    width: `${showBayar.jumlah > 0 ? Math.round((showBayar.jumlah_terbayar / showBayar.jumlah) * 100) : 0}%`,
                    background: "linear-gradient(90deg, #10b981, #059669)", borderRadius: 99,
                  }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--color-muted)", marginTop: 4 }}>
                  <span>{formatRupiah(showBayar.jumlah_terbayar)} dibayar</span>
                  <span>{formatRupiah(showBayar.sisa)} sisa</span>
                </div>
              </div>
            )}
            <FormRow label="Tanggal Bayar *">
              <input className="inp" type="date" value={bayarForm.tanggal_bayar} onChange={e => setBayarForm({ ...bayarForm, tanggal_bayar: e.target.value })} required />
            </FormRow>
            <FormRow label="Jumlah Bayar (Rp) *">
              <input className="inp" type="number" value={bayarForm.jumlah_bayar}
                onChange={e => setBayarForm({ ...bayarForm, jumlah_bayar: e.target.value })}
                max={showBayar ? parseFloat(showBayar.sisa) : undefined} required min={0} placeholder="0" />
            </FormRow>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <FormRow label="Metode">
                <select className="inp" value={bayarForm.metode} onChange={e => setBayarForm({ ...bayarForm, metode: e.target.value })}>
                  <option value="transfer">Transfer Bank</option>
                  <option value="tunai">Tunai</option>
                  <option value="cek">Cek / Giro</option>
                </select>
              </FormRow>
              <FormRow label="No. Referensi">
                <input className="inp" value={bayarForm.referensi} onChange={e => setBayarForm({ ...bayarForm, referensi: e.target.value })} placeholder="No. transfer..." />
              </FormRow>
            </div>
            <FormRow label="Catatan">
              <input className="inp" value={bayarForm.catatan} onChange={e => setBayarForm({ ...bayarForm, catatan: e.target.value })} placeholder="Opsional..." />
            </FormRow>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-ghost" onClick={() => setShowBayar(null)}>Batal</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Menyimpan..." : "Catat Pembayaran"}</button>
          </div>
        </form>
      </Modal>
    </Layout>
  );
}
