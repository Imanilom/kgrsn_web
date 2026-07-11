import { useEffect, useState, useRef } from "react";
import Layout from "@/components/Layout";
import { supplierApi } from "@/lib/api";
import Link from "next/link";

const formatDate = (d) => d ? new Date(d).toLocaleDateString("id-ID") : "-";

export default function SupplierPage() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({
    kode: "", nama: "", alamat: "", kontak: "", email: "",
    kategori: "", terms_pembayaran: 0, rekening: "", nama_bank: "",
  });
  const [saving, setSaving] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const fileInputRef = useRef();

  const load = async () => {
    setLoading(true);
    try {
      const res = await supplierApi.list();
      setSuppliers(res.data);
    } catch { setError("Gagal memuat data supplier"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = suppliers.filter(s =>
    s.nama?.toLowerCase().includes(search.toLowerCase()) ||
    s.kode?.toLowerCase().includes(search.toLowerCase()) ||
    s.kategori?.toLowerCase().includes(search.toLowerCase())
  );

  const resetForm = () => {
    setForm({ kode: "", nama: "", alamat: "", kontak: "", email: "", kategori: "", terms_pembayaran: 0, rekening: "", nama_bank: "" });
    setEditId(null);
    setShowForm(false);
    setError("");
  };

  const handleEdit = (s) => {
    setForm({
      kode: s.kode, nama: s.nama, alamat: s.alamat || "", kontak: s.kontak || "",
      email: s.email || "", kategori: s.kategori || "",
      terms_pembayaran: s.terms_pembayaran || 0, rekening: s.rekening || "", nama_bank: s.nama_bank || "",
    });
    setEditId(s.id);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (editId) {
        await supplierApi.update(editId, form);
        setSuccess("Supplier berhasil diperbarui");
      } else {
        await supplierApi.create(form);
        setSuccess("Supplier berhasil ditambahkan");
      }
      resetForm();
      load();
    } catch (err) {
      setError(err.response?.data?.detail || "Gagal menyimpan supplier");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, nama) => {
    if (!confirm(`Nonaktifkan supplier "${nama}"?`)) return;
    try {
      await supplierApi.delete(id);
      setSuccess("Supplier dinonaktifkan");
      load();
    } catch (err) {
      setError(err.response?.data?.detail || "Gagal menghapus");
    }
  };

  const handleImport = async () => {
    if (!importFile) { alert("Pilih file Excel terlebih dahulu"); return; }
    setImporting(true);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append("file", importFile);
      const res = await supplierApi.importExcel(fd);
      setImportResult(res.data);
      if (res.data.ditambahkan > 0) {
        setSuccess(`Import berhasil: ${res.data.ditambahkan} supplier ditambahkan, ${res.data.dilewati} dilewati`);
        load();
      }
    } catch (err) {
      setError(err.response?.data?.detail || "Gagal import Excel");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Layout title="Manajemen Supplier">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>🏭 Manajemen Supplier</h1>
          <p style={{ color: "var(--text-secondary)", margin: "4px 0 0" }}>
            Kelola data vendor &amp; supplier bahan baku
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => { setShowImport(true); setImportResult(null); setImportFile(null); }}>
            📂 Import Excel
          </button>
          <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>
            ➕ Tambah Supplier
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error} <button onClick={() => setError("")}>✕</button></div>}
      {success && <div className="alert alert-success">{success} <button onClick={() => setSuccess("")}>✕</button></div>}

      {/* Modal Import Excel */}
      {showImport && (
        <div onClick={() => setShowImport(false)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div onClick={e => e.stopPropagation()} className="card" style={{ width: 500, padding: 28 }}>
            <h2 style={{ margin: "0 0 6px", fontSize: 18 }}>📂 Import Supplier dari Excel</h2>
            <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--text-secondary)" }}>
              Upload file .xlsx/.xls berisi data supplier. Kolom yang dikenali: Nama, Kode, Alamat, Kontak, Email, Kategori, Terms, Rekening, Bank.
            </p>

            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: "2px dashed var(--color-border)", borderRadius: 12, padding: 32,
                textAlign: "center", cursor: "pointer", marginBottom: 20,
                background: importFile ? "#f0fdf4" : "#f8fafc",
                transition: "all 0.15s",
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 8 }}>📊</div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                {importFile ? importFile.name : "Klik untuk pilih file Excel"}
              </div>
              <div style={{ fontSize: 12, color: "var(--color-muted)" }}>
                {importFile ? `${(importFile.size / 1024).toFixed(1)} KB` : "Format: .xlsx / .xls"}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                style={{ display: "none" }}
                onChange={e => setImportFile(e.target.files[0])}
              />
            </div>

            {importResult && (
              <div style={{
                padding: 16, borderRadius: 10, marginBottom: 20,
                background: importResult.ditambahkan > 0 ? "#f0fdf4" : "#fff7ed",
                border: `1px solid ${importResult.ditambahkan > 0 ? "#86efac" : "#fed7aa"}`,
              }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Hasil Import:</div>
                <div style={{ fontSize: 13, display: "flex", gap: 20 }}>
                  <span>✅ Ditambahkan: <strong>{importResult.ditambahkan}</strong></span>
                  <span>⏭️ Dilewati: <strong>{importResult.dilewati}</strong></span>
                </div>
                {importResult.errors?.length > 0 && (
                  <div style={{ marginTop: 8, fontSize: 12, color: "#dc2626" }}>
                    Error: {importResult.errors.join(", ")}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button className="btn btn-secondary" onClick={() => setShowImport(false)}>Tutup</button>
              <button className="btn btn-primary" onClick={handleImport} disabled={importing || !importFile}>
                {importing ? "⏳ Mengimport..." : "📥 Import"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Form */}
      {showForm && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center"
        }}>
          <div className="card" style={{ width: 600, maxHeight: "90vh", overflowY: "auto", padding: 28 }}>
            <h2 style={{ margin: "0 0 20px" }}>{editId ? "Edit Supplier" : "Tambah Supplier Baru"}</h2>
            <form onSubmit={handleSubmit}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Kode Supplier *</label>
                  <input className="form-input" value={form.kode} onChange={e => setForm({...form, kode: e.target.value})}
                    required placeholder="SUP001" disabled={!!editId} />
                </div>
                <div className="form-group">
                  <label className="form-label">Nama Supplier *</label>
                  <input className="form-input" value={form.nama} onChange={e => setForm({...form, nama: e.target.value})}
                    required placeholder="CV. Berkah Jaya" />
                </div>
                <div className="form-group">
                  <label className="form-label">Kategori</label>
                  <input className="form-input" value={form.kategori} onChange={e => setForm({...form, kategori: e.target.value})}
                    placeholder="Bahan pokok, Sembako, dll" />
                </div>
                <div className="form-group">
                  <label className="form-label">Terms Pembayaran (hari)</label>
                  <input className="form-input" type="number" value={form.terms_pembayaran}
                    onChange={e => setForm({...form, terms_pembayaran: parseInt(e.target.value) || 0})}
                    placeholder="30" min={0} />
                </div>
                <div className="form-group" style={{ gridColumn: "span 2" }}>
                  <label className="form-label">Alamat</label>
                  <textarea className="form-input" value={form.alamat} onChange={e => setForm({...form, alamat: e.target.value})}
                    rows={2} placeholder="Jl. Raya No. 1..." />
                </div>
                <div className="form-group">
                  <label className="form-label">Kontak / Telepon</label>
                  <input className="form-input" value={form.kontak} onChange={e => setForm({...form, kontak: e.target.value})}
                    placeholder="08xxx" />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-input" type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})}
                    placeholder="supplier@email.com" />
                </div>
                <div className="form-group">
                  <label className="form-label">No. Rekening</label>
                  <input className="form-input" value={form.rekening} onChange={e => setForm({...form, rekening: e.target.value})}
                    placeholder="1234567890" />
                </div>
                <div className="form-group">
                  <label className="form-label">Nama Bank</label>
                  <input className="form-input" value={form.nama_bank} onChange={e => setForm({...form, nama_bank: e.target.value})}
                    placeholder="BCA, BRI, Mandiri, dll" />
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 20, justifyContent: "flex-end" }}>
                <button type="button" className="btn btn-secondary" onClick={resetForm}>Batal</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Menyimpan..." : editId ? "Update" : "Simpan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <input className="form-input" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Cari supplier (nama, kode, kategori)..." style={{ maxWidth: 400 }} />
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text-secondary)" }}>⏳ Memuat...</div>
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Kode</th>
                <th>Nama Supplier</th>
                <th>Kategori</th>
                <th>Kontak</th>
                <th>Rekening</th>
                <th>Terms</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: "center", padding: 32, color: "var(--text-secondary)" }}>
                  {search ? "Tidak ada supplier yang cocok" : "Belum ada data supplier"}
                </td></tr>
              ) : filtered.map(s => (
                <tr key={s.id}>
                  <td><span style={{ fontFamily: "monospace", fontWeight: 600, color: "var(--primary)" }}>{s.kode}</span></td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{s.nama}</div>
                    {s.email && <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{s.email}</div>}
                  </td>
                  <td>{s.kategori || <span style={{ color: "var(--text-secondary)" }}>-</span>}</td>
                  <td>{s.kontak || "-"}</td>
                  <td>
                    {s.rekening ? (
                      <div>
                        <div style={{ fontSize: 12 }}>{s.nama_bank}</div>
                        <div style={{ fontFamily: "monospace" }}>{s.rekening}</div>
                      </div>
                    ) : "-"}
                  </td>
                  <td>{s.terms_pembayaran > 0 ? `${s.terms_pembayaran} hari` : "COD"}</td>
                  <td>
                    <span style={{
                      padding: "2px 10px", borderRadius: 99, fontSize: 12,
                      background: s.is_active ? "#dcfce7" : "#fee2e2",
                      color: s.is_active ? "#166534" : "#991b1b",
                    }}>
                      {s.is_active ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 12 }}
                        onClick={() => handleEdit(s)}>✏️ Edit</button>
                      {s.is_active && (
                        <button className="btn" style={{ padding: "4px 10px", fontSize: 12, background: "#fef2f2", color: "#dc2626" }}
                          onClick={() => handleDelete(s.id, s.nama)}>🗑️</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)", color: "var(--text-secondary)", fontSize: 13 }}>
            Total: {filtered.length} supplier
          </div>
        </div>
      )}
    </Layout>
  );
}
