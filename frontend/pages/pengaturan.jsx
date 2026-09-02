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
    tarif_porsi_kecil: "🥗",
    tarif_porsi_besar: "🍱",
  };

  const businessConfigs = configs.filter(c => c.kunci !== "margin_persen");

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">⚙️ Pengaturan Sistem</h1>
          <p className="page-subtitle">Konfigurasi tarif penerima manfaat dan pencadangan database</p>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
      {success && <div className="alert alert-success" style={{ marginBottom: 16 }}>✓ {success}</div>}

      {loading ? (
        <div className="loading-overlay"><div className="spinner" style={{ width: 32, height: 32 }} /></div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
          {/* Konfigurasi Tarif Cards */}
          <div>
            <div className="card">
              <div className="card-title" style={{ marginBottom: 8 }}>🔧 Parameter Tarif PM</div>
              <div style={{ fontSize: 13, color: "var(--color-muted)", marginBottom: 16 }}>
                Pengaturan tarif per penerima manfaat untuk dasar perhitungan pagu harian dapur.
              </div>

              {businessConfigs.map(cfg => {
                const kunci = cfg.kunci;
                const isEditingThis = kunci in editing;

                return (
                  <div key={kunci} style={{
                    padding: "16px 0",
                    borderBottom: "1px solid var(--color-border)",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}>
                    <div style={{ fontSize: 24 }}>{ICONS[kunci] || "⚙️"}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{cfg.deskripsi}</div>
                      <div style={{ fontSize: 11, color: "var(--color-muted)", marginTop: 2, fontFamily: "monospace" }}>{kunci}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {isEditingThis ? (
                        <>
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{ fontSize: 13, color: "var(--color-muted)" }}>Rp</span>
                            <input
                              type="number"
                              min="0"
                              step="1000"
                              style={{
                                width: 110, padding: "5px 8px",
                                border: "1.5px solid var(--color-primary)",
                                borderRadius: 6, fontSize: 14, fontWeight: 700,
                                textAlign: "right",
                              }}
                              value={editing[kunci]}
                              onChange={e => setEditing(prev => ({ ...prev, [kunci]: e.target.value }))}
                              onKeyDown={e => e.key === "Enter" && handleSave(kunci)}
                              autoFocus
                            />
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
                            {formatRupiah(parseFloat(cfg.nilai))}
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
          </div>

          {/* Database Backup Card */}
          <div className="card">
            <div className="card-title" style={{ marginBottom: 8 }}>💾 Database & Backup</div>
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
        </div>
      )}
    </div>
  );
}

Pengaturan.title = "Pengaturan Sistem";
