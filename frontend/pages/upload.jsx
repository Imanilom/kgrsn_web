import { useState, useRef } from "react";
import { poApi, dapurApi } from "@/lib/api";
import { useEffect } from "react";
import { formatRupiah } from "@/components/Layout";

export default function UploadPage() {
  const [step, setStep] = useState(1); // 1: upload, 2: review, 3: confirm
  const [dapur, setDapur] = useState([]);
  const [selectedDapur, setSelectedDapur] = useState("");
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [nomorPO, setNomorPO] = useState("");
  const [tanggalPO, setTanggalPO] = useState(new Date().toISOString().slice(0, 10));
  const [user, setUser] = useState(null);
  const inputRef = useRef();

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem("user"));
      setUser(u);
      if (u?.role === 'operator' && u.dapur_id) {
        setSelectedDapur(u.dapur_id);
      }
    } catch {}
    dapurApi.list({ is_active: true }).then(res => setDapur(res.data)).catch(console.error);
  }, []);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped?.type === "application/pdf") setFile(dropped);
  };

  const handleUpload = async () => {
    if (!file || !selectedDapur) {
      setError("Pilih dapur dan file PDF terlebih dahulu");
      return;
    }
    setError("");
    setLoading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("dapur_id", selectedDapur);
    try {
      const res = await poApi.upload(fd);
      setResult(res.data);
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.detail || "Upload gagal");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    setLoading(true);
    setError("");
    try {
      const fd = new FormData();
      if (nomorPO) fd.append("nomor_po", nomorPO);
      if (tanggalPO) fd.append("tanggal_po", tanggalPO);
      await poApi.confirmUpload(result.log_id, fd);
      setSuccess("✅ PO berhasil dibuat dari hasil ekstraksi PDF!");
      setStep(3);
    } catch (err) {
      setError(err.response?.data?.detail || "Gagal membuat PO");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setStep(1); setFile(null); setResult(null);
    setSelectedDapur(""); setError(""); setSuccess("");
    setNomorPO(""); setTanggalPO(new Date().toISOString().slice(0, 10));
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Upload PO</h1>
          <p className="page-subtitle">Upload file PDF dan ekstrak data item secara otomatis</p>
        </div>
      </div>

      {/* Progress Steps */}
      <div style={{ display: "flex", gap: 0, marginBottom: 28 }}>
        {[
          { n: 1, label: "Upload PDF" },
          { n: 2, label: "Review Ekstraksi" },
          { n: 3, label: "Selesai" },
        ].map(({ n, label }, i, arr) => (
          <div key={n} style={{ display: "flex", alignItems: "center", flex: 1 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              opacity: step < n ? 0.4 : 1,
            }}>
              <div style={{
                width: 28, height: 28,
                borderRadius: "50%",
                background: step >= n ? "var(--color-primary)" : "var(--color-border)",
                color: step >= n ? "white" : "var(--color-muted)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 700, fontSize: 13,
                flexShrink: 0,
              }}>{step > n ? "✓" : n}</div>
              <span style={{ fontSize: 13, fontWeight: 600, color: step >= n ? "var(--color-text)" : "var(--color-muted)" }}>
                {label}
              </span>
            </div>
            {i < arr.length - 1 && (
              <div style={{ flex: 1, height: 2, background: step > n ? "var(--color-primary)" : "var(--color-border)", margin: "0 12px" }} />
            )}
          </div>
        ))}
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* Step 1: Upload */}
      {step === 1 && (
        <div className="card">
          {(!user || user.role !== 'operator') && (
            <div className="form-grid" style={{ marginBottom: 24 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Pilih Dapur *</label>
                <select
                  className="form-control"
                  value={selectedDapur}
                  onChange={e => setSelectedDapur(e.target.value)}
                >
                  <option value="">-- Pilih Dapur --</option>
                  {dapur.map(d => (
                    <option key={d.id} value={d.id}>{d.nama} ({d.kode})</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div
            className={`upload-zone ${dragging ? "dragging" : ""}`}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf"
              style={{ display: "none" }}
              onChange={e => setFile(e.target.files[0])}
            />
            <div className="upload-zone-icon">{file ? "📄" : "📤"}</div>
            <div className="upload-zone-text">
              {file ? file.name : "Drag & drop file PDF di sini"}
            </div>
            <div className="upload-zone-sub">
              {file
                ? `Ukuran: ${(file.size / 1024).toFixed(1)} KB · Klik untuk ganti`
                : "atau klik untuk pilih file · Format: PDF"}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
            <button
              className="btn btn-primary btn-lg"
              onClick={handleUpload}
              disabled={loading || !file || !selectedDapur}
            >
              {loading ? <><span className="spinner"></span> Mengekstrak...</> : "🔍 Ekstrak & Lanjut"}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Review */}
      {step === 2 && result && (
        <div>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <div>
                <div className="card-title">📋 Hasil Ekstraksi PDF</div>
                <p style={{ color: "var(--color-muted)", fontSize: 12, marginTop: 4 }}>
                  {result.extracted_items.length} item ditemukan · Metode: {result.status} · File: {result.filename}
                </p>
              </div>
              <span className={`badge badge-${result.status === "success" ? "approved" : "warning"}`}>
                {result.status}
              </span>
            </div>

            <div className="form-grid" style={{ marginBottom: 20 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Nomor PO (kosongkan untuk auto-generate)</label>
                <input
                  className="form-control"
                  placeholder="Contoh: PO/2026/04/0001"
                  value={nomorPO}
                  onChange={e => setNomorPO(e.target.value)}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Tanggal PO *</label>
                <input
                  className="form-control"
                  type="date"
                  value={tanggalPO}
                  onChange={e => setTanggalPO(e.target.value)}
                />
              </div>
            </div>

            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>No</th>
                    <th>Nama Item (dari PDF)</th>
                    <th>Item Match</th>
                    <th style={{ textAlign: "right" }}>Qty</th>
                    <th>Satuan</th>
                    <th style={{ textAlign: "right" }}>Harga Satuan</th>
                    <th style={{ textAlign: "right" }}>Subtotal</th>
                    <th>Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {result.extracted_items.map((item, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td><strong>{item.nama_item_raw}</strong></td>
                      <td>
                        {item.matched_item_id ? (
                          <span className="badge badge-approved">✓ Matched</span>
                        ) : (
                          <span className="badge badge-warning">Belum dimap</span>
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>{item.qty}</td>
                      <td>{item.satuan}</td>
                      <td style={{ textAlign: "right" }} className="rupiah">{formatRupiah(item.harga_satuan)}</td>
                      <td style={{ textAlign: "right" }} className="rupiah">{formatRupiah(item.subtotal)}</td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{
                            flex: 1, height: 6, background: "#e2e8f0", borderRadius: 3, minWidth: 40,
                          }}>
                            <div style={{
                              width: `${(item.confidence * 100).toFixed(0)}%`,
                              height: "100%",
                              background: item.confidence > 0.8 ? "var(--color-success)" : item.confidence > 0.5 ? "var(--color-warning)" : "var(--color-danger)",
                              borderRadius: 3,
                            }} />
                          </div>
                          <span style={{ fontSize: 11, color: "var(--color-muted)" }}>
                            {(item.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={6} style={{ textAlign: "right", fontWeight: 700, paddingTop: 12 }}>
                      TOTAL
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 700 }} className="rupiah">
                      {formatRupiah(result.extracted_items.reduce((s, i) => s + i.subtotal, 0))}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
            <button className="btn btn-ghost" onClick={reset}>← Ulangi Upload</button>
            <button
              className="btn btn-primary"
              onClick={handleConfirm}
              disabled={loading || result.extracted_items.length === 0}
            >
              {loading ? <><span className="spinner"></span> Menyimpan...</> : "✅ Konfirmasi & Buat PO"}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Success */}
      {step === 3 && (
        <div className="card" style={{ textAlign: "center", padding: "60px 32px" }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
          <h2 style={{ fontWeight: 800, fontSize: 22, marginBottom: 8 }}>PO Berhasil Dibuat!</h2>
          <p style={{ color: "var(--color-muted)", marginBottom: 28 }}>
            Data dari PDF sudah tersimpan ke database. Anda bisa approve PO dan generate invoice.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button className="btn btn-outline" onClick={reset}>Upload PO Lagi</button>
            <a href="/po" className="btn btn-primary">📋 Lihat Daftar PO</a>
          </div>
        </div>
      )}
    </div>
  );
}

UploadPage.title = "Upload PO";
UploadPage.subtitle = "Upload dan ekstrak data dari PDF PO";
