import { useEffect, useState, useRef } from "react";
import Layout from "@/components/Layout";
import { supplierApi, hutangApi } from "@/lib/api";

const formatRupiah = (v) => `Rp ${parseFloat(v || 0).toLocaleString("id-ID")}`;
const formatDate = (d) => d ? new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "-";

const STATUS_HUTANG = {
  belum_lunas: { label: "Belum Lunas", color: "#ef4444", bg: "#fee2e2" },
  sebagian: { label: "Sebagian", color: "#f59e0b", bg: "#fef3c7" },
  lunas: { label: "Lunas", color: "#10b981", bg: "#d1fae5" },
};

export default function PembayaranSupplierPage() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [hutangDetail, setHutangDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [payForm, setPayForm] = useState({ tanggal_bayar: new Date().toISOString().split("T")[0], jumlah_bayar: "", metode: "transfer", referensi: "", catatan: "" });
  const [paying, setPaying] = useState(false);
  const [selectedHutangId, setSelectedHutangId] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadingPembayaranId, setUploadingPembayaranId] = useState(null);
  const fileRef = useRef();

  const load = async () => {
    setLoading(true);
    try {
      const res = await supplierApi.list({ is_active: true });
      setSuppliers(res.data);
    } catch { setError("Gagal memuat data supplier"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const loadDetail = async (supplierId) => {
    setLoadingDetail(true); setHutangDetail(null);
    try {
      const res = await supplierApi.hutangSummary(supplierId);
      setHutangDetail(res.data);
    } catch { setError("Gagal memuat detail hutang supplier"); }
    finally { setLoadingDetail(false); }
  };

  const handleSelectSupplier = (s) => {
    setSelected(s);
    loadDetail(s.id);
    setSelectedHutangId(null);
    setPayForm({ tanggal_bayar: new Date().toISOString().split("T")[0], jumlah_bayar: "", metode: "transfer", referensi: "", catatan: "" });
  };

  const handleBayar = async (hutangId) => {
    if (!payForm.jumlah_bayar) return;
    setPaying(true); setError("");
    try {
      await hutangApi.bayar(hutangId, { ...payForm, jumlah_bayar: parseFloat(payForm.jumlah_bayar) });
      setSuccess("Pembayaran berhasil dicatat");
      setSelectedHutangId(null);
      setPayForm({ tanggal_bayar: new Date().toISOString().split("T")[0], jumlah_bayar: "", metode: "transfer", referensi: "", catatan: "" });
      loadDetail(selected.id);
    } catch (err) { setError(err.response?.data?.detail || "Gagal mencatat pembayaran"); }
    finally { setPaying(false); }
  };

  const handleUploadBukti = async (pembayaranId) => {
    if (!uploadFile) return;
    setUploadingPembayaranId(pembayaranId);
    try {
      const fd = new FormData();
      fd.append("file", uploadFile);
      await hutangApi.uploadBukti(pembayaranId, fd);
      setSuccess("Bukti pembayaran berhasil diupload");
      setUploadFile(null);
      loadDetail(selected.id);
    } catch (err) { setError(err.response?.data?.detail || "Gagal upload bukti"); }
    finally { setUploadingPembayaranId(null); }
  };

  const filtered = suppliers.filter(s =>
    s.nama?.toLowerCase().includes(search.toLowerCase()) ||
    s.kode?.toLowerCase().includes(search.toLowerCase())
  );

  const inp = { width: "100%", padding: "8px 12px", border: "1.5px solid var(--color-border)", borderRadius: 8, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" };

  return (
    <Layout title="Status Pembayaran Supplier">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Status Pembayaran Supplier</h1>
        <p style={{ color: "var(--color-muted)", margin: "4px 0 0", fontSize: 13 }}>Cek status hutang per supplier, lihat riwayat pembayaran, dan upload bukti transfer</p>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}<button onClick={() => setError("")} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer" }}>x</button></div>}
      {success && <div className="alert alert-success" style={{ marginBottom: 16 }}>{success}<button onClick={() => setSuccess("")} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer" }}>x</button></div>}

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 20, alignItems: "start" }}>
        {/* Left panel: supplier list */}
        <div className="card" style={{ padding: 0, overflow: "hidden", position: "sticky", top: 20 }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--color-border)" }}>
            <input value={search} onChange={e => setSearch(e.target.value)} style={inp} placeholder="Cari supplier..." />
          </div>
          {loading ? (
            <div style={{ padding: 40, textAlign: "center" }}><div className="spinner" style={{ margin: "0 auto" }} /></div>
          ) : (
            <div style={{ maxHeight: "calc(100vh - 220px)", overflowY: "auto" }}>
              {filtered.map(s => (
                <div
                  key={s.id}
                  onClick={() => handleSelectSupplier(s)}
                  style={{
                    padding: "12px 16px", cursor: "pointer", borderBottom: "1px solid var(--color-border)",
                    background: selected?.id === s.id ? "#ede9fe" : "transparent",
                    transition: "background 0.15s",
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{s.nama}</div>
                  <div style={{ fontSize: 11, color: "var(--color-muted)" }}>{s.kode} · {s.kategori || "Umum"}</div>
                  {s.rekening && <div style={{ fontSize: 11, color: "#6366f1", marginTop: 2 }}>{s.nama_bank} - {s.rekening}</div>}
                </div>
              ))}
              {filtered.length === 0 && <div style={{ padding: "40px 16px", textAlign: "center", color: "var(--color-muted)" }}>Tidak ada supplier</div>}
            </div>
          )}
        </div>

        {/* Right panel: detail */}
        <div>
          {!selected ? (
            <div style={{ background: "white", borderRadius: 14, padding: "80px 20px", textAlign: "center", border: "1px dashed var(--color-border)" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>👈</div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Pilih supplier di kiri</div>
              <div style={{ fontSize: 13, color: "var(--color-muted)" }}>Klik salah satu supplier untuk melihat detail hutang dan riwayat pembayaran</div>
            </div>
          ) : loadingDetail ? (
            <div style={{ background: "white", borderRadius: 14, padding: 60, textAlign: "center", border: "1px solid var(--color-border)" }}>
              <div className="spinner" style={{ margin: "0 auto" }} />
            </div>
          ) : hutangDetail ? (
            <div>
              {/* Supplier info */}
              <div style={{ background: "white", borderRadius: 14, padding: "20px 24px", marginBottom: 16, border: "1px solid var(--color-border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>{hutangDetail.supplier.nama}</div>
                    <div style={{ fontSize: 13, color: "var(--color-muted)" }}>{hutangDetail.supplier.kode}</div>
                    {hutangDetail.supplier.rekening && (
                      <div style={{ marginTop: 6, padding: "6px 12px", background: "#ede9fe", borderRadius: 8, display: "inline-block" }}>
                        <span style={{ fontSize: 12, color: "#7c3aed", fontWeight: 700 }}>
                          {hutangDetail.supplier.nama_bank} · {hutangDetail.supplier.rekening}
                        </span>
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 11, color: "var(--color-muted)", textTransform: "uppercase", fontWeight: 700, marginBottom: 2 }}>Sisa Hutang</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: hutangDetail.total_sisa > 0 ? "#ef4444" : "#10b981" }}>
                      {formatRupiah(hutangDetail.total_sisa)}
                    </div>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--color-border)" }}>
                  <div><div style={{ fontSize: 11, color: "var(--color-muted)", fontWeight: 700, textTransform: "uppercase" }}>Total Hutang</div><div style={{ fontWeight: 700 }}>{formatRupiah(hutangDetail.total_hutang)}</div></div>
                  <div><div style={{ fontSize: 11, color: "var(--color-muted)", fontWeight: 700, textTransform: "uppercase" }}>Terbayar</div><div style={{ fontWeight: 700, color: "#10b981" }}>{formatRupiah(hutangDetail.total_terbayar)}</div></div>
                  <div><div style={{ fontSize: 11, color: "var(--color-muted)", fontWeight: 700, textTransform: "uppercase" }}>Sisa</div><div style={{ fontWeight: 700, color: "#ef4444" }}>{formatRupiah(hutangDetail.total_sisa)}</div></div>
                </div>
              </div>

              {/* Hutang list */}
              {hutangDetail.hutang_list.length === 0 ? (
                <div style={{ background: "white", borderRadius: 14, padding: "40px", textAlign: "center", border: "1px solid var(--color-border)", color: "var(--color-muted)" }}>
                  Tidak ada data hutang untuk supplier ini
                </div>
              ) : (
                hutangDetail.hutang_list.map(h => {
                  const sh = STATUS_HUTANG[h.status] || { label: h.status, color: "#64748b", bg: "#f1f5f9" };
                  return (
                    <div key={h.id} style={{ background: "white", borderRadius: 14, padding: "18px 24px", marginBottom: 12, border: "1px solid var(--color-border)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                        <div>
                          <div style={{ fontWeight: 700 }}>{h.nomor_hutang}</div>
                          <div style={{ fontSize: 12, color: "var(--color-muted)" }}>
                            Tgl: {formatDate(h.tanggal)} {h.jatuh_tempo ? `· JT: ${formatDate(h.jatuh_tempo)}` : ""}
                          </div>
                          {h.deskripsi && <div style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 2 }}>{h.deskripsi}</div>}
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: sh.bg, color: sh.color }}>{sh.label}</span>
                          <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4 }}>Sisa: {formatRupiah(h.sisa)}</div>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div style={{ background: "#f1f5f9", borderRadius: 99, height: 6, marginBottom: 12 }}>
                        <div style={{ background: "#10b981", borderRadius: 99, height: 6, width: `${h.jumlah > 0 ? Math.min(100, h.jumlah_terbayar / h.jumlah * 100) : 0}%`, transition: "width 0.4s" }} />
                      </div>

                      {/* Riwayat pembayaran */}
                      {h.pembayaran_list.length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase", marginBottom: 6 }}>Riwayat Pembayaran</div>
                          {h.pembayaran_list.map(p => (
                            <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#f8fafc", borderRadius: 8, marginBottom: 4 }}>
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 600 }}>{formatDate(p.tanggal_bayar)} · {p.metode || "transfer"}</div>
                                {p.referensi && <div style={{ fontSize: 11, color: "var(--color-muted)" }}>Ref: {p.referensi}</div>}
                              </div>
                              <div style={{ textAlign: "right" }}>
                                <div style={{ fontWeight: 700, color: "#10b981" }}>{formatRupiah(p.jumlah_bayar)}</div>
                                {!p.bukti_bayar_path ? (
                                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
                                    <input type="file" accept="image/*,.pdf" onChange={e => setUploadFile(e.target.files[0])} style={{ fontSize: 10, width: 120 }} />
                                    <button className="btn btn-sm" style={{ fontSize: 10, background: "#ede9fe", color: "#7c3aed", border: "none" }}
                                      disabled={uploadingPembayaranId === p.id || !uploadFile}
                                      onClick={() => handleUploadBukti(p.id)}>
                                      {uploadingPembayaranId === p.id ? "..." : "Upload Bukti"}
                                    </button>
                                  </div>
                                ) : (
                                  <div style={{ fontSize: 11, color: "#10b981", marginTop: 2 }}>Bukti ada</div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Form bayar */}
                      {h.status !== "lunas" && (
                        <>
                          <button className="btn btn-sm" style={{ fontSize: 12, marginBottom: 8 }} onClick={() => setSelectedHutangId(selectedHutangId === h.id ? null : h.id)}>
                            {selectedHutangId === h.id ? "Tutup Form" : "Catat Pembayaran"}
                          </button>
                          {selectedHutangId === h.id && (
                            <div style={{ background: "#f8fafc", borderRadius: 10, padding: "14px 16px" }}>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                                <div>
                                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Tanggal Bayar</div>
                                  <input type="date" value={payForm.tanggal_bayar} onChange={e => setPayForm({ ...payForm, tanggal_bayar: e.target.value })} style={inp} />
                                </div>
                                <div>
                                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Jumlah (maks {formatRupiah(h.sisa)})</div>
                                  <input type="number" value={payForm.jumlah_bayar} onChange={e => setPayForm({ ...payForm, jumlah_bayar: e.target.value })} style={inp} placeholder="0" max={h.sisa} />
                                </div>
                                <div>
                                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Metode</div>
                                  <select value={payForm.metode} onChange={e => setPayForm({ ...payForm, metode: e.target.value })} style={inp}>
                                    <option value="transfer">Transfer</option>
                                    <option value="tunai">Tunai</option>
                                    <option value="cek">Cek</option>
                                  </select>
                                </div>
                                <div>
                                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>No. Referensi</div>
                                  <input value={payForm.referensi} onChange={e => setPayForm({ ...payForm, referensi: e.target.value })} style={inp} placeholder="No. transfer..." />
                                </div>
                              </div>
                              <button className="btn btn-primary" disabled={!payForm.jumlah_bayar || paying} onClick={() => handleBayar(h.id)}>
                                {paying ? "Menyimpan..." : "Catat Pembayaran"}
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          ) : null}
        </div>
      </div>
    </Layout>
  );
}
