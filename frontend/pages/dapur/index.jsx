import { useEffect, useState } from "react";
import { dapurApi } from "@/lib/api";

export default function DapurPage() {
  const [dapur, setDapur] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editData, setEditData] = useState(null);
  const [form, setForm] = useState({
    kode: "", nama: "", alamat: "", kontak: "", email: "",
    laporan_terpisah: false, overhead_persen: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    dapurApi.list().then(r => setDapur(r.data)).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditData(null);
    setForm({ kode: "", nama: "", alamat: "", kontak: "", email: "", laporan_terpisah: false, overhead_persen: "" });
    setError("");
    setShowModal(true);
  };

  const openEdit = (d) => {
    setEditData(d);
    setForm({
      kode: d.kode, nama: d.nama, alamat: d.alamat || "", kontak: d.kontak || "", email: d.email || "",
      laporan_terpisah: d.laporan_terpisah || false,
      overhead_persen: d.overhead_persen != null ? String(d.overhead_persen) : "",
    });
    setError("");
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.kode || !form.nama) { setError("Kode dan nama dapur wajib diisi"); return; }
    if (form.laporan_terpisah && (form.overhead_persen === "" || isNaN(parseFloat(form.overhead_persen)))) {
      setError("Isi persentase overhead (contoh: 4) jika laporan terpisah diaktifkan"); return;
    }
    setSaving(true); setError("");
    try {
      const payload = {
        nama: form.nama, alamat: form.alamat, kontak: form.kontak, email: form.email,
        laporan_terpisah: form.laporan_terpisah,
        overhead_persen: form.laporan_terpisah && form.overhead_persen !== "" ? parseFloat(form.overhead_persen) : null,
      };
      if (editData) {
        await dapurApi.update(editData.id, payload);
      } else {
        await dapurApi.create({ kode: form.kode, ...payload });
      }
      setShowModal(false);
      load();
    } catch (err) {
      setError(err.response?.data?.detail || "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dapur</h1>
          <p className="page-subtitle">Kelola registrasi dapur dan pengaturan laporan laba rugi</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ Tambah Dapur</button>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading-overlay"><div className="spinner" style={{ width: 32, height: 32 }}></div></div>
        ) : dapur.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🍳</div>
            <div className="empty-state-title">Belum ada dapur terdaftar</div>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={openCreate}>+ Tambah Dapur</button>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
            {dapur.map(d => (
              <div key={d.id} style={{
                padding: 20,
                border: `1.5px solid ${d.laporan_terpisah ? "rgba(99,102,241,0.4)" : "var(--color-border)"}`,
                borderRadius: 12,
                background: d.is_active ? (d.laporan_terpisah ? "rgba(99,102,241,0.03)" : "white") : "#fafafa",
                cursor: "pointer",
                position: "relative",
              }} onClick={() => openEdit(d)}>
                {/* Badge laporan terpisah */}
                {d.laporan_terpisah && (
                  <div style={{
                    position: "absolute", top: 12, right: 12,
                    padding: "2px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700,
                    background: "rgba(99,102,241,0.12)", color: "#6366f1",
                    border: "1px solid rgba(99,102,241,0.25)",
                  }}>
                    🔒 Mandiri
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, paddingRight: d.laporan_terpisah ? 72 : 0 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{d.nama}</div>
                    <div style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 2 }}>Kode: {d.kode}</div>
                  </div>
                  <span className={`badge badge-${d.is_active ? "approved" : "cancelled"}`} style={{ marginRight: d.laporan_terpisah ? 64 : 0 }}>
                    {d.is_active ? "Aktif" : "Nonaktif"}
                  </span>
                </div>
                {d.alamat && <div style={{ fontSize: 13, color: "var(--color-muted)", marginBottom: 6 }}>📍 {d.alamat}</div>}
                {d.kontak && <div style={{ fontSize: 13, color: "var(--color-muted)", marginBottom: 4 }}>📞 {d.kontak}</div>}
                {d.email && <div style={{ fontSize: 13, color: "var(--color-muted)", marginBottom: 6 }}>✉️ {d.email}</div>}
                {/* Info laporan */}
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--color-border)", fontSize: 12, color: "var(--color-muted)" }}>
                  {d.laporan_terpisah ? (
                    <span style={{ color: "#6366f1", fontWeight: 600 }}>
                      ⚙️ Overhead: {d.overhead_persen != null ? `${d.overhead_persen}% × Laba Kotor` : "0%"}
                    </span>
                  ) : (
                    <span>⚙️ Laporan: Gabungan (overhead aktual)</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">{editData ? "Edit Dapur" : "Tambah Dapur"}</div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-error">{error}</div>}
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Kode Dapur *</label>
                  <input className="form-control" placeholder="DPR-01" value={form.kode}
                    onChange={e => setForm({ ...form, kode: e.target.value })} disabled={!!editData} />
                </div>
                <div className="form-group">
                  <label className="form-label">Nama Dapur *</label>
                  <input className="form-control" placeholder="Nama lengkap dapur" value={form.nama}
                    onChange={e => setForm({ ...form, nama: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Alamat</label>
                <textarea className="form-control" rows={2} value={form.alamat}
                  onChange={e => setForm({ ...form, alamat: e.target.value })} />
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Kontak / Telepon</label>
                  <input className="form-control" value={form.kontak}
                    onChange={e => setForm({ ...form, kontak: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-control" type="email" value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })} />
                </div>
              </div>

              {/* ── Konfigurasi Laporan L/R ────────────────────────────────── */}
              <div style={{
                marginTop: 16, padding: "14px 16px", borderRadius: 10,
                border: `1.5px solid ${form.laporan_terpisah ? "rgba(99,102,241,0.4)" : "var(--color-border)"}`,
                background: form.laporan_terpisah ? "rgba(99,102,241,0.04)" : "#f8fafc",
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>
                  ⚙️ Konfigurasi Laporan Laba Rugi
                </div>

                {/* Toggle Laporan Terpisah */}
                <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 12 }}>
                  <div style={{
                    width: 40, height: 22, borderRadius: 11, position: "relative", cursor: "pointer",
                    background: form.laporan_terpisah ? "#6366f1" : "#d1d5db", transition: "background 0.2s",
                  }} onClick={() => setForm({ ...form, laporan_terpisah: !form.laporan_terpisah })}>
                    <div style={{
                      position: "absolute", top: 2, width: 18, height: 18, borderRadius: "50%", background: "white",
                      transition: "left 0.2s", left: form.laporan_terpisah ? 20 : 2,
                      boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
                    }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      {form.laporan_terpisah ? "🔒 Laporan Mandiri" : "📊 Gabung ke Laporan Bersama"}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--color-muted)" }}>
                      {form.laporan_terpisah
                        ? "Dapur ini punya panel laba rugi terpisah di dashboard"
                        : "Angka dapur ini masuk ke laporan gabungan"}
                    </div>
                  </div>
                </label>

                {/* Input % Overhead — hanya tampil jika laporan_terpisah */}
                {form.laporan_terpisah && (
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">
                      Overhead (% dari Laba Kotor)
                      <span style={{ marginLeft: 6, fontSize: 11, color: "var(--color-muted)", fontWeight: 400 }}>
                        — contoh: 4 artinya 4% × Laba Kotor
                      </span>
                    </label>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        className="form-control"
                        type="number"
                        min={0}
                        max={100}
                        step={0.01}
                        placeholder="4.00"
                        value={form.overhead_persen}
                        onChange={e => setForm({ ...form, overhead_persen: e.target.value })}
                        style={{ maxWidth: 160 }}
                      />
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#6366f1" }}>%</span>
                      {form.overhead_persen && (
                        <span style={{ fontSize: 12, color: "var(--color-muted)" }}>
                          Contoh: Laba Kotor Rp 10jt → Overhead Rp {(10_000_000 * parseFloat(form.overhead_persen || 0) / 100).toLocaleString("id-ID")}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Batal</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? <span className="spinner"></span> : "💾 Simpan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

DapurPage.title = "Dapur";
DapurPage.subtitle = "Registrasi dapur dan pengaturan laporan laba rugi";
