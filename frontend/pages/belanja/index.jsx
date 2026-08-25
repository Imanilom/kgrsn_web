import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { belanjaApi, supplierApi, belanjaHarianApi } from "@/lib/api";
import { formatRupiah } from "@/components/Layout";

const STATUS_COLOR = {
  draft: { bg: "#f1f5f9", text: "#475569", label: "📝 Draft" },
  lunas: { bg: "rgba(16,185,129,0.1)", text: "#059669", label: "✅ Lunas" },
  sebagian: { bg: "rgba(245,158,11,0.1)", text: "#b45309", label: "⏳ Sebagian" },
};

function formatDate(d) {
  if (!d) return "—";
  return new Date(d + "T00:00").toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

export default function BelanjaIndex() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [supplierList, setSupplierList] = useState([]);
  const [filter, setFilter] = useState({ supplier_id: "", status: "", tanggal_mulai: "", tanggal_selesai: "" });
  const [selected, setSelected] = useState([]); // for konsolidasi
  const [showKonsolidasi, setShowKonsolidasi] = useState(false);
  const defaultJatuhTempoStr = (() => { const d = new Date(); d.setDate(d.getDate() + 3); return d.toISOString().slice(0, 10); })();
  const [konsolidasiForm, setKonsolidasiForm] = useState({ jatuh_tempo: defaultJatuhTempoStr, catatan: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [expanded, setExpanded] = useState({});
  const [summaryHarian, setSummaryHarian] = useState([]);
  const [loadingSummary, setLoadingSummary] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = {};
    if (filter.supplier_id) params.supplier_id = filter.supplier_id;
    if (filter.status) params.status = filter.status;
    if (filter.tanggal_mulai) params.tanggal_mulai = filter.tanggal_mulai;
    if (filter.tanggal_selesai) params.tanggal_selesai = filter.tanggal_selesai;
    
    // Load belanja list
    belanjaApi.list(params)
      .then(r => setList(r.data))
      .catch(() => setError("Gagal memuat data"))
      .finally(() => setLoading(false));

    // Load summary harian
    setLoadingSummary(true);
    belanjaHarianApi.summary({ dari: filter.tanggal_mulai, sampai: filter.tanggal_selesai })
      .then(r => setSummaryHarian(r.data))
      .catch(() => {})
      .finally(() => setLoadingSummary(false));
  }, [filter]);

  useEffect(() => { load(); supplierApi.list().then(r => setSupplierList(r.data)).catch(() => {}); }, [load]);

  const handleDelete = async (id, nomor) => {
    if (!confirm(`Hapus transaksi ${nomor}?`)) return;
    try {
      await belanjaApi.delete(id);
      setSuccess("Transaksi dihapus");
      load();
    } catch (e) {
      setError(e.response?.data?.detail || "Gagal menghapus");
    }
  };

  const handleBayar = async (id) => {
    if (!confirm("Tandai transaksi ini sebagai lunas?")) return;
    try {
      await belanjaApi.bayar(id);
      setSuccess("Transaksi ditandai lunas");
      load();
    } catch (e) {
      setError(e.response?.data?.detail || "Gagal");
    }
  };

  const handleKonsolidasi = async () => {
    if (!selected.length) { setError("Pilih minimal 1 transaksi"); return; }
    const supplierId = list.find(t => selected.includes(t.id))?.supplier_id;
    if (!supplierId) { setError("Transaksi yang dipilih tidak memiliki supplier"); return; }
    const allSameSup = selected.every(id => list.find(t => t.id === id)?.supplier_id === supplierId);
    if (!allSameSup) { setError("Semua transaksi yang dikonsolidasi harus ke supplier yang sama"); return; }
    setSaving(true);
    try {
      const r = await belanjaApi.konsolidasiHutang({
        supplier_id: supplierId,
        transaksi_ids: selected,
        jatuh_tempo: konsolidasiForm.jatuh_tempo || null,
      });
      setSuccess(`${r.data.message} — Nomor Hutang: ${r.data.nomor_hutang}`);
      setSelected([]);
      setShowKonsolidasi(false);
      load();
    } catch (e) {
      setError(e.response?.data?.detail || "Gagal konsolidasi");
    } finally {
      setSaving(false);
    }
  };

  const toggleExpand = (id) => setExpanded(p => ({ ...p, [id]: !p[id] }));
  const toggleSelect = (id) => setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const totalSelected = selected.reduce((s, id) => s + (list.find(t => t.id === id)?.total || 0), 0);

  return (
    <div>
      <style>{`
        .belanja-row { border: 1px solid var(--color-border); border-radius: 12px; overflow: hidden; margin-bottom: 10px; background: white; }
        .belanja-header { padding: 14px 18px; display: flex; align-items: center; gap: 12px; cursor: pointer; }
        .belanja-detail { background: #f8fafc; border-top: 1px solid var(--color-border); padding: 14px 18px; }
        .alokasi-badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; background: rgba(99,102,241,0.1); color: #4f46e5; }
        .check-box { width: 18px; height: 18px; border-radius: 4px; border: 2px solid var(--color-border); cursor: pointer; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
        .check-box.checked { background: var(--color-primary); border-color: var(--color-primary); color: white; }
      `}</style>

      <div className="page-header">
        <div>
          <h1 className="page-title">🛒 Transaksi Belanja</h1>
          <p className="page-subtitle">Catat pembelian aktual dan alokasi ke PO</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {selected.length > 0 && (
            <button className="btn btn-warning" onClick={() => setShowKonsolidasi(true)}>
              🔗 Konsolidasi {selected.length} Transaksi ({formatRupiah(totalSelected)})
            </button>
          )}
          <Link href="/belanja/create" className="btn btn-primary">+ Catat Belanja</Link>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 12 }} onClick={() => setError("")}>{error} ✕</div>}
      {success && <div className="alert alert-success" style={{ marginBottom: 12 }} onClick={() => setSuccess("")}>✓ {success} ✕</div>}

      {/* Summary Harian SPPG */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: "var(--color-text)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            🚛 Total Belanja Harian (Kirim ke SPPG)
          </div>
          <span style={{ fontSize: 11, color: "var(--color-muted)" }}>*Meskipun belum dibayar, belanja tetap tercatat dikirim</span>
        </div>
        {loadingSummary ? (
          <div style={{ color: "var(--color-muted)", fontSize: 13 }}>Loading summary harian...</div>
        ) : summaryHarian.length === 0 ? (
          <div style={{ background: "white", padding: 16, borderRadius: 10, border: "1px solid var(--color-border)", color: "var(--color-muted)", fontSize: 13 }}>
            Belum ada transaksi belanja dalam periode ini.
          </div>
        ) : (
          <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
            {summaryHarian.slice(0, 7).map(item => (
              <div key={item.tanggal} style={{
                background: "white", minWidth: 200, padding: "12px 16px", borderRadius: 10,
                border: "1px solid var(--color-border)", borderTop: "3px solid var(--color-primary)", flexShrink: 0
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted)" }}>{formatDate(item.tanggal)}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "var(--color-primary)", margin: "4px 0" }}>{formatRupiah(item.total)}</div>
                <div style={{ fontSize: 11, color: "var(--color-muted)" }}>
                  {item.jumlah_transaksi} trans · {item.supplier_list.slice(0, 2).join(", ")}{item.supplier_list.length > 2 ? "..." : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Filter */}
      <div className="card" style={{ marginBottom: 16, padding: "14px 16px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 10, alignItems: "end" }}>
          <div>
            <label className="form-label">Supplier</label>
            <select className="form-control" value={filter.supplier_id} onChange={e => setFilter(p => ({ ...p, supplier_id: e.target.value }))}>
              <option value="">Semua Supplier</option>
              {supplierList.map(s => <option key={s.id} value={s.id}>{s.nama}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Status</label>
            <select className="form-control" value={filter.status} onChange={e => setFilter(p => ({ ...p, status: e.target.value }))}>
              <option value="">Semua</option>
              <option value="draft">Draft</option>
              <option value="lunas">Lunas</option>
              <option value="sebagian">Sebagian</option>
            </select>
          </div>
          <div>
            <label className="form-label">Dari Tanggal</label>
            <input type="date" className="form-control" value={filter.tanggal_mulai} onChange={e => setFilter(p => ({ ...p, tanggal_mulai: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">Sampai Tanggal</label>
            <input type="date" className="form-control" value={filter.tanggal_selesai} onChange={e => setFilter(p => ({ ...p, tanggal_selesai: e.target.value }))} />
          </div>
          <button className="btn btn-ghost" onClick={() => setFilter({ supplier_id: "", status: "", tanggal_mulai: "", tanggal_selesai: "" })}>Reset</button>
        </div>
      </div>

      {/* Summary */}
      {list.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
          {[
            { label: "Total Transaksi", value: list.length, color: "var(--color-primary)", icon: "🛒" },
            { label: "Total Nilai", value: formatRupiah(list.reduce((s, t) => s + t.total, 0)), color: "#374151", icon: "💰" },
            { label: "Draft / Belum Lunas", value: list.filter(t => t.status === "draft").length, color: "#f59e0b", icon: "📝" },
          ].map(c => (
            <div key={c.label} className="card" style={{ padding: "12px 16px" }}>
              <div style={{ fontSize: 11, color: "var(--color-muted)", fontWeight: 600 }}>{c.icon} {c.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: c.color, marginTop: 4 }}>{c.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="card" style={{ textAlign: "center", padding: 40 }}><div className="spinner" style={{ width: 32, height: 32, margin: "auto" }} /></div>
      ) : list.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 40, color: "var(--color-muted)" }}>
          Belum ada transaksi belanja.<br />
          <Link href="/belanja/create" className="btn btn-primary" style={{ marginTop: 16 }}>+ Catat Pertama</Link>
        </div>
      ) : (
        list.map(t => {
          const sc = STATUS_COLOR[t.status] || STATUS_COLOR.draft;
          const isExpanded = expanded[t.id];
          const isSelected = selected.includes(t.id);
          return (
            <div key={t.id} className="belanja-row" style={{ borderLeft: `4px solid ${t.status === "lunas" ? "#10b981" : t.status === "sebagian" ? "#f59e0b" : "#e2e8f0"}` }}>
              <div className="belanja-header">
                {t.status === "draft" && (
                  <div
                    className={`check-box ${isSelected ? "checked" : ""}`}
                    onClick={() => toggleSelect(t.id)}
                  >
                    {isSelected && "✓"}
                  </div>
                )}
                <div style={{ flex: 1 }} onClick={() => toggleExpand(t.id)}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 800, color: "var(--color-primary)", fontSize: 14 }}>{t.nomor_transaksi}</span>
                    <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: sc.bg, color: sc.text }}>{sc.label}</span>
                    {t.hutang_id && <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 11, background: "rgba(99,102,241,0.1)", color: "#4f46e5" }}>🔗 Hutang</span>}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 3 }}>
                    📅 {formatDate(t.tanggal_belanja)} &nbsp;•&nbsp; 🏭 {t.supplier_nama || "—"} &nbsp;•&nbsp; {t.details?.length || 0} item
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontWeight: 900, fontSize: 18, color: "var(--color-primary)" }}>{formatRupiah(t.total)}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 6, justifyContent: "flex-end" }}>
                    <Link href={`/belanja/${t.id}`} className="btn btn-ghost btn-sm">Detail</Link>
                    {t.status === "draft" && (
                      <button className="btn btn-success btn-sm" onClick={() => handleBayar(t.id)}>✓ Lunas</button>
                    )}
                    <button className="btn btn-sm" style={{ background: "rgba(239,68,68,0.08)", color: "#dc2626" }} onClick={() => handleDelete(t.id, t.nomor_transaksi)}>🗑️</button>
                  </div>
                </div>
              </div>

              {isExpanded && (
                <div className="belanja-detail">
                  <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#f1f5f9" }}>
                        <th style={{ padding: "6px 8px", textAlign: "left" }}>Item</th>
                        <th style={{ padding: "6px 8px", textAlign: "right" }}>Qty Beli</th>
                        <th style={{ padding: "6px 8px", textAlign: "right" }}>Harga</th>
                        <th style={{ padding: "6px 8px", textAlign: "right" }}>Subtotal</th>
                        <th style={{ padding: "6px 8px" }}>Alokasi PO</th>
                      </tr>
                    </thead>
                    <tbody>
                      {t.details?.map(d => (
                        <tr key={d.id} style={{ borderTop: "1px solid #e2e8f0" }}>
                          <td style={{ padding: "6px 8px", fontWeight: 600 }}>{d.nama_item}</td>
                          <td style={{ padding: "6px 8px", textAlign: "right" }}>{d.qty_beli} {d.satuan}</td>
                          <td style={{ padding: "6px 8px", textAlign: "right" }} className="rupiah">{formatRupiah(d.harga_satuan)}</td>
                          <td style={{ padding: "6px 8px", textAlign: "right" }} className="rupiah">{formatRupiah(d.subtotal)}</td>
                          <td style={{ padding: "6px 8px" }}>
                            {d.alokasi?.map(a => (
                              <span key={a.id} className="alokasi-badge" style={{ marginRight: 4, marginBottom: 2, display: "inline-flex" }}>
                                {a.nomor_po}: {a.qty_alokasi} {d.satuan}
                              </span>
                            ))}
                            {!d.alokasi?.length && <span style={{ color: "#94a3b8", fontSize: 11 }}>—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })
      )}

      {/* Modal Konsolidasi */}
      {showKonsolidasi && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "white", borderRadius: 16, padding: 28, width: 440, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>🔗 Konsolidasi Hutang Supplier</div>
            <div style={{ fontSize: 13, color: "var(--color-muted)", marginBottom: 16 }}>
              {selected.length} transaksi akan digabung menjadi 1 hutang supplier senilai <strong>{formatRupiah(totalSelected)}</strong>
            </div>
            <div className="form-group">
              <label className="form-label">Jatuh Tempo (opsional)</label>
              <input type="date" className="form-control" value={konsolidasiForm.jatuh_tempo} onChange={e => setKonsolidasiForm(p => ({ ...p, jatuh_tempo: e.target.value }))} />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowKonsolidasi(false)}>Batal</button>
              <button className="btn btn-primary" style={{ flex: 1 }} disabled={saving} onClick={handleKonsolidasi}>
                {saving ? "Memproses..." : "🔗 Konsolidasi"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

BelanjaIndex.title = "Transaksi Belanja";
