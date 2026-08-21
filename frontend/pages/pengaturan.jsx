import { useState, useEffect, useRef } from "react";
import { configApi, databaseApi } from "@/lib/api";
import { formatRupiah } from "@/components/Layout";

export default function Pengaturan() {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState({}); // { kunci: inputVal }
  const [saving, setSaving] = useState({});
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  
  // Database backup states
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef(null);

  const handleExport = async () => {
    try {
      setIsExporting(true);
      setError("");
      const res = await databaseApi.export();
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "kgrsn_db_backup.json");
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      
      setSuccess("Database berhasil diekspor.");
    } catch (e) {
      setError("Gagal mengekspor database.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window.confirm("PERINGATAN BAHAYA!\n\nProses ini akan MENGHAPUS SEMUA DATA yang ada saat ini dan menggantinya dengan data dari file backup.\n\nApakah Anda YAKIN ingin melanjutkan?")) {
      e.target.value = null;
      return;
    }

    try {
      setIsImporting(true);
      setError("");
      setSuccess("");
      
      const formData = new FormData();
      formData.append("file", file);
      
      await databaseApi.import(formData);
      setSuccess("Database berhasil dipulihkan dari backup.");
      
      // Reload configs after import
      load();
    } catch (err) {
      setError(err.response?.data?.detail || "Gagal memulihkan database.");
    } finally {
      setIsImporting(false);
      e.target.value = null;
    }
  };

  const load = () => {
    setLoading(true);
    configApi.list()
      .then(r => setConfigs(r.data))
      .catch(() => setError("Gagal memuat konfigurasi"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const startEdit = (kunci, nilai) => {
    setEditing(prev => ({ ...prev, [kunci]: nilai }));
  };

  const handleSave = async (kunci) => {
    const nilai = editing[kunci];
    if (!nilai && nilai !== 0) return;
    setSaving(prev => ({ ...prev, [kunci]: true }));
    setError(""); setSuccess("");
    try {
      await configApi.update(kunci, String(nilai));
      setSuccess(`Konfigurasi "${kunci}" berhasil disimpan`);
      setEditing(prev => { const n = { ...prev }; delete n[kunci]; return n; });
      load();
    } catch (e) {
      setError(e.response?.data?.detail || "Gagal menyimpan");
    } finally {
      setSaving(prev => ({ ...prev, [kunci]: false }));
    }
  };

  const ICONS = {
    margin_persen: "📈",
    tarif_porsi_kecil: "🥗",
    tarif_porsi_besar: "🍱",
  };

  // Preview kalkulasi harga jual
  const marginVal = configs.find(c => c.kunci === "margin_persen");
  const margin = marginVal ? parseFloat(marginVal.nilai) : 15;
  const contohHargaBeli = [10000, 50000, 100000, 500000];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">⚙️ Pengaturan Sistem</h1>
          <p className="page-subtitle">Konfigurasi parameter bisnis seperti margin keuntungan dan tarif</p>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
      {success && <div className="alert alert-success" style={{ marginBottom: 16 }}>✓ {success}</div>}

      {loading ? (
        <div className="loading-overlay"><div className="spinner" style={{ width: 32, height: 32 }} /></div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {/* Konfigurasi Cards */}
          <div>
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-title" style={{ marginBottom: 16 }}>🔧 Parameter Bisnis</div>
              <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 16 }}>
                Perubahan akan langsung berlaku untuk semua perhitungan harga jual baru.
                Harga yang sudah tersimpan di Master Harga tidak akan berubah otomatis.
              </div>

              {configs.map(cfg => {
                const isEditing = kunci => kunci in editing;
                const kunci = cfg.kunci;
                const satuan = kunci === "margin_persen" ? "%" : "Rp";
                const isEditingThis = kunci in editing;

                return (
                  <div key={kunci} style={{
                    padding: "14px 0",
                    borderBottom: "1px solid var(--color-border)",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}>
                    <div style={{ fontSize: 20 }}>{ICONS[kunci] || "⚙️"}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{cfg.deskripsi}</div>
                      <div style={{ fontSize: 11, color: "var(--color-muted)", marginTop: 2, fontFamily: "monospace" }}>{kunci}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {isEditingThis ? (
                        <>
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            {satuan === "Rp" && <span style={{ fontSize: 13, color: "var(--color-muted)" }}>Rp</span>}
                            <input
                              type="number"
                              min="0"
                              step={satuan === "%" ? "0.5" : "1000"}
                              style={{
                                width: 90, padding: "5px 8px",
                                border: "1.5px solid var(--color-primary)",
                                borderRadius: 6, fontSize: 14, fontWeight: 700,
                                textAlign: "right",
                              }}
                              value={editing[kunci]}
                              onChange={e => setEditing(prev => ({ ...prev, [kunci]: e.target.value }))}
                              onKeyDown={e => e.key === "Enter" && handleSave(kunci)}
                              autoFocus
                            />
                            {satuan === "%" && <span style={{ fontSize: 13, color: "var(--color-muted)" }}>%</span>}
                          </div>
                          <button
                            className="btn btn-success btn-sm"
                            disabled={saving[kunci]}
                            onClick={() => handleSave(kunci)}
                          >
                            {saving[kunci] ? <span className="spinner" /> : "✓"}
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => setEditing(prev => { const n = { ...prev }; delete n[kunci]; return n; })}
                          >
                            ✕
                          </button>
                        </>
                      ) : (
                        <>
                          <span style={{ fontWeight: 800, fontSize: 16, color: "var(--color-primary)" }}>
                            {satuan === "Rp" ? formatRupiah(parseFloat(cfg.nilai)) : `${cfg.nilai}%`}
                          </span>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => startEdit(kunci, cfg.nilai)}
                          >
                            ✏️ Edit
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="card" style={{ background: "rgba(245,158,11,0.04)", borderLeft: "4px solid #f59e0b" }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>⚠️ Penting</div>
              <ul style={{ fontSize: 13, color: "var(--color-muted)", paddingLeft: 16, lineHeight: 1.8, margin: 0 }}>
                <li>Margin baru hanya berlaku untuk harga yang <strong>baru dibuat</strong> setelah perubahan ini</li>
                <li>Harga yang sudah tersimpan di Master Harga <strong>tidak berubah otomatis</strong></li>
                <li>Untuk update harga lama, buka Master Harga dan edit manual</li>
                <li>Perubahan ini langsung aktif tanpa perlu restart server</li>
              </ul>
            </div>
          </div>

          {/* Database Backup Card */}
          <div className="card" style={{ marginTop: 20 }}>
            <div className="card-title" style={{ marginBottom: 16 }}>💾 Database & Backup</div>
            <div style={{ fontSize: 13, color: "var(--color-muted)", marginBottom: 16 }}>
              Ekspor seluruh data sistem ke dalam file JSON atau pulihkan data dari file backup.
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ padding: "16px", background: "rgba(16, 185, 129, 0.05)", border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: 8 }}>
                <div style={{ fontWeight: 600, color: "var(--color-success)", marginBottom: 8 }}>Ekspor Database</div>
                <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 12 }}>
                  Unduh seluruh data (Master Item, PO, Invoice, dll) sebagai file backup (.json).
                </div>
                <button 
                  className="btn btn-success" 
                  onClick={handleExport}
                  disabled={isExporting}
                >
                  {isExporting ? <span className="spinner"></span> : "⬇️ Export Database"}
                </button>
              </div>

              <div style={{ padding: "16px", background: "rgba(239, 68, 68, 0.05)", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: 8 }}>
                <div style={{ fontWeight: 600, color: "var(--color-danger)", marginBottom: 8 }}>Impor Database (Restore)</div>
                <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 12 }}>
                  <strong style={{ color: "var(--color-danger)" }}>PERHATIAN:</strong> Mengimpor file backup akan <strong>MENGHAPUS</strong> seluruh data saat ini secara permanen dan menggantinya dengan data dari file backup.
                </div>
                <input 
                  type="file" 
                  accept=".json" 
                  ref={fileInputRef} 
                  style={{ display: 'none' }} 
                  onChange={handleImport} 
                />
                <button 
                  className="btn btn-danger" 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isImporting}
                >
                  {isImporting ? <span className="spinner"></span> : "⬆️ Import Database"}
                </button>
              </div>
            </div>
          </div>

          {/* Preview Kalkulasi */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 16 }}>📊 Preview Kalkulasi Harga Jual</div>
            <div style={{ fontSize: 13, color: "var(--color-muted)", marginBottom: 16 }}>
              Simulasi harga jual dengan margin saat ini: <strong style={{ color: "var(--color-primary)" }}>{margin}%</strong>
            </div>

            <div style={{ background: "#f8fafc", borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase", marginBottom: 8 }}>
                Rumus: Harga Jual = Harga Beli × (1 + {margin}/100)
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "var(--color-primary)", fontFamily: "monospace" }}>
                × {(1 + margin / 100).toFixed(4)}
              </div>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th style={{ padding: "8px 10px", textAlign: "left", fontWeight: 700 }}>Harga Beli</th>
                  <th style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700 }}>Harga Jual</th>
                  <th style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700 }}>Keuntungan</th>
                </tr>
              </thead>
              <tbody>
                {contohHargaBeli.map(hb => {
                  const hj = Math.round(hb * (1 + margin / 100));
                  const keuntungan = hj - hb;
                  return (
                    <tr key={hb} style={{ borderTop: "1px solid var(--color-border)" }}>
                      <td style={{ padding: "8px 10px" }} className="rupiah">{formatRupiah(hb)}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, color: "var(--color-success)" }} className="rupiah">
                        {formatRupiah(hj)}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: "var(--color-primary)" }} className="rupiah">
                        +{formatRupiah(keuntungan)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Custom simulator */}
            <div style={{ marginTop: 16, padding: "12px 14px", background: "rgba(99,102,241,0.06)", borderRadius: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-muted)", marginBottom: 8 }}>🧮 Kalkulator Cepat</div>
              <SimulatorInput margin={margin} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SimulatorInput({ margin }) {
  const [hargaBeli, setHargaBeli] = useState("");
  const hj = hargaBeli ? Math.round(parseFloat(hargaBeli.replace(/\./g, "")) * (1 + margin / 100)) : 0;
  const keuntungan = hj - (parseFloat(hargaBeli.replace(/\./g, "")) || 0);
  return (
    <div>
      <input
        type="number"
        className="form-control"
        placeholder="Masukkan harga beli..."
        value={hargaBeli}
        onChange={e => setHargaBeli(e.target.value)}
        style={{ marginBottom: 8 }}
      />
      {hargaBeli && (
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
          <span style={{ color: "var(--color-muted)" }}>Harga Jual:</span>
          <strong style={{ color: "var(--color-success)", fontSize: 15 }}>
            {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(hj)}
          </strong>
        </div>
      )}
      {hargaBeli && (
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 4 }}>
          <span style={{ color: "var(--color-muted)" }}>Keuntungan:</span>
          <span style={{ color: "var(--color-primary)", fontWeight: 600 }}>
            +{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(keuntungan)}
          </span>
        </div>
      )}
    </div>
  );
}

Pengaturan.title = "Pengaturan Sistem";
