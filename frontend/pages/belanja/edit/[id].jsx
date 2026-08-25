import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { belanjaApi, supplierApi, hargaApi, dapurApi } from "@/lib/api";
import { formatRupiah } from "@/components/Layout";

function formatDate(d) {
  if (!d) return "—";
  return new Date(d + "T00:00").toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

// Satu baris item belanja dengan auto-match PO
function ItemRow({ idx, item, onUpdate, onRemove, tanggal, dapurId }) {
  const [matchResult, setMatchResult] = useState(null); // array PO yang match
  const [searching, setSearching] = useState(false);
  const [searchText, setSearchText] = useState(item.nama_item || "");
  const [suggestions, setSuggestions] = useState([]);
  const [showSug, setShowSug] = useState(false);

  // Fetch matching POs when item_id is set
  useEffect(() => {
    if (!item.item_id) { setMatchResult(null); return; }
    setSearching(true);
    belanjaApi.matchPO(item.item_id, tanggal || undefined, dapurId || undefined)
      .then(r => {
        setMatchResult(r.data);
      })
      .catch(() => setMatchResult([]))
      .finally(() => setSearching(false));
  }, [item.item_id, tanggal, dapurId]);

  // Search item by name
  const handleSearchChange = useCallback(async (val) => {
    setSearchText(val);
    onUpdate(idx, { nama_item: val, item_id: null, alokasi: [] });
    if (val.length < 2) { setSuggestions([]); return; }
    try {
      const r = await belanjaApi.matchPOByName(val, tanggal || undefined, dapurId || undefined);
      // Unique by item_id
      const seen = new Set();
      const unique = r.data.filter(x => {
        if (!x.item_id || seen.has(x.item_id)) return false;
        seen.add(x.item_id); return true;
      });
      setSuggestions(unique);
      setShowSug(true);
    } catch { setSuggestions([]); }
  }, [idx, tanggal, dapurId]);

  const selectItem = (s) => {
    setSearchText(s.nama_item);
    onUpdate(idx, {
      item_id: s.item_id,
      nama_item: s.nama_item,
      satuan: s.satuan,
      harga_satuan: s.harga_satuan_po || 0,
    });
    setShowSug(false);
  };

  // Auto-distribute qty to POs FIFO
  const autoAlokasi = (pos, qtyBeli) => {
    if (!pos || !qtyBeli) return [];
    let remaining = qtyBeli;
    const result = [];
    for (const p of pos) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, p.qty_sisa);
      if (take > 0) {
        result.push({ po_detail_id: p.po_detail_id, po_id: p.po_id, qty_alokasi: take, nomor_po: p.nomor_po, dapur: p.dapur });
        remaining -= take;
      }
    }
    return result;
  };

  const handleQtyChange = (val) => {
    onUpdate(idx, { qty_beli: val });
  };

  const togglePOCheckbox = (poItem, checked) => {
    const currentAlokasi = item.alokasi || [];
    if (checked) {
      const allocatedTotal = currentAlokasi.reduce((s, a) => s + (parseFloat(a.qty_alokasi) || 0), 0);
      const qtyBeli = parseFloat(item.qty_beli) || 0;
      
      // Alokasikan semua sisa kebutuhan ke PO yang dipilih (jangan dibatasi oleh qty_sisa)
      // agar tidak terpecah ke beberapa PO jika user ingin alokasi ke 1 PO saja.
      const sisaKebutuhan = Math.max(qtyBeli - allocatedTotal, 0);
      const takeQty = sisaKebutuhan;

      const newEntry = {
        po_detail_id: poItem.po_detail_id,
        po_id: poItem.po_id,
        nomor_po: poItem.nomor_po,
        dapur: poItem.dapur,
        qty_alokasi: takeQty > 0 ? takeQty : 0,
      };
      onUpdate(idx, { alokasi: [...currentAlokasi, newEntry] });
    } else {
      const newAlokasi = currentAlokasi.filter(a => a.po_detail_id !== poItem.po_detail_id);
      onUpdate(idx, { alokasi: newAlokasi });
    }
  };

  const updateAlokasiQty = (poDetailId, val) => {
    const currentAlokasi = item.alokasi || [];
    const newAlokasi = currentAlokasi.map(a => {
      if (a.po_detail_id === poDetailId) {
        return { ...a, qty_alokasi: val };
      }
      return a;
    });
    onUpdate(idx, { alokasi: newAlokasi });
  };

  const handleAutoAlokasi = () => {
    if (!matchResult) return;
    const alokasi = autoAlokasi(matchResult, parseFloat(item.qty_beli) || 0);
    onUpdate(idx, { alokasi });
  };

  const updateAlokasi = (alokasiIdx, field, value) => {
    const newAlokasi = [...(item.alokasi || [])];
    newAlokasi[alokasiIdx] = { ...newAlokasi[alokasiIdx], [field]: value };
    onUpdate(idx, { alokasi: newAlokasi });
  };

  const removeAlokasi = (alokasiIdx) => {
    const newAlokasi = item.alokasi.filter((_, i) => i !== alokasiIdx);
    onUpdate(idx, { alokasi: newAlokasi });
  };

  const addAlokasi = () => {
    const newAlokasi = [...(item.alokasi || []), { po_detail_id: "", po_id: "", qty_alokasi: "", nomor_po: "Manual" }];
    onUpdate(idx, { alokasi: newAlokasi });
  };

  const subtotal = (parseFloat(item.qty_beli) || 0) * (parseFloat(item.harga_satuan) || 0);
  const totalAlokasi = (item.alokasi || []).reduce((s, a) => s + (parseFloat(a.qty_alokasi) || 0), 0);
  const sisaAlokasi = (parseFloat(item.qty_beli) || 0) - totalAlokasi;

  return (
    <div style={{
      border: "1px solid var(--color-border)", borderRadius: 12, padding: "14px 16px",
      background: "white", marginBottom: 12,
      borderLeft: `4px solid ${matchResult && matchResult.length > 0 ? "#22c55e" : matchResult ? "#f59e0b" : "#e2e8f0"}`
    }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 10 }}>
        <span style={{ fontWeight: 700, fontSize: 12, color: "var(--color-muted)", padding: "6px 0", minWidth: 20 }}>{idx + 1}</span>

        {/* Item name / search */}
        <div style={{ flex: 2, position: "relative" }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted)", display: "block", marginBottom: 3 }}>Nama Item</label>
          <input
            className="form-control"
            placeholder="Ketik nama item..."
            value={searchText}
            onChange={e => handleSearchChange(e.target.value)}
            onBlur={() => setTimeout(() => setShowSug(false), 200)}
            onFocus={() => suggestions.length > 0 && setShowSug(true)}
          />
          {showSug && suggestions.length > 0 && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0, background: "white",
              border: "1px solid var(--color-border)", borderRadius: 8, zIndex: 100,
              boxShadow: "0 8px 24px rgba(0,0,0,0.12)", maxHeight: 200, overflowY: "auto",
            }}>
              {suggestions.map((s, i) => (
                <div key={i} onClick={() => selectItem(s)} style={{
                  padding: "8px 12px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid #f1f5f9"
                }}
                  className="hover-bg">
                  <div style={{ fontWeight: 700 }}>{s.nama_item}</div>
                  <div style={{ fontSize: 11, color: "var(--color-muted)" }}>
                    PO: {s.nomor_po} | Sisa: {s.qty_sisa} {s.satuan} | Dapur: {s.dapur}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Qty */}
        <div style={{ width: 90 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted)", display: "block", marginBottom: 3 }}>Qty Beli</label>
          <input className="form-control" type="number" min="0" step="0.001"
            value={item.qty_beli} onChange={e => handleQtyChange(e.target.value)} />
        </div>

        {/* Satuan */}
        <div style={{ width: 80 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted)", display: "block", marginBottom: 3 }}>Satuan</label>
          <input className="form-control" value={item.satuan || ""} onChange={e => onUpdate(idx, { satuan: e.target.value })} />
        </div>

        {/* Harga */}
        <div style={{ width: 130 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted)", display: "block", marginBottom: 3 }}>Harga Beli/Satuan</label>
          <input className="form-control" type="number" min="0"
            value={item.harga_satuan} onChange={e => onUpdate(idx, { harga_satuan: e.target.value })} />
        </div>

        {/* Subtotal */}
        <div style={{ width: 120, textAlign: "right" }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted)", display: "block", marginBottom: 3 }}>Subtotal</label>
          <div style={{ fontWeight: 700, fontSize: 15, padding: "8px 0" }} className="rupiah">{formatRupiah(subtotal)}</div>
        </div>

        <button className="btn btn-ghost btn-sm" style={{ marginTop: 18, color: "#ef4444", flexShrink: 0 }} onClick={() => onRemove(idx)}>🗑️</button>
      </div>

      {/* PO Alokasi section */}
      <div style={{ marginLeft: 28, borderTop: "1px solid #f1f5f9", paddingTop: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted)" }}>
            📦 ALOKASI KE PO
            {searching && <span style={{ marginLeft: 8 }}>⏳ Mencari PO...</span>}
            {matchResult !== null && !searching && (
              <span style={{ marginLeft: 8, color: matchResult.length ? "#22c55e" : "#f59e0b" }}>
                {matchResult.length ? `✓ ${matchResult.length} PO ditemukan` : "⚠️ Tidak ada PO yang cocok"}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
            {sisaAlokasi !== 0 && parseFloat(item.qty_beli) > 0 && (
              <span style={{ color: sisaAlokasi > 0 ? "#f59e0b" : "#ef4444", fontWeight: 600 }}>
                {sisaAlokasi > 0 ? `⚠️ Sisa ${sisaAlokasi} belum dialokasi` : `❌ Kelebihan alokasi ${Math.abs(sisaAlokasi)}`}
              </span>
            )}
            <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={addAlokasi}>+ Tambah Manual</button>
          </div>
        </div>

        {(item.alokasi || []).length === 0 && (
          <div style={{ fontSize: 12, color: "#94a3b8", fontStyle: "italic", marginBottom: 6 }}>Belum ada alokasi PO (silakan centang PO di bawah atau buat alokasi manual)</div>
        )}

        {/* Available POs with Checkboxes */}
        {matchResult && matchResult.length > 0 && (
          <div style={{ marginTop: 6, background: "#f8fafc", borderRadius: 8, padding: 10, border: "1px solid var(--color-border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: "var(--color-muted)", fontWeight: 700 }}>
                📋 PILIH PO UNTUK ALOKASI ({matchResult.length} PO TERSEDIA):
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ fontSize: 11, padding: "2px 8px", color: "var(--color-primary)" }}
                onClick={handleAutoAlokasi}
              >
                ⚡ Auto Alokasi (Prioritas Tgl PO)
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {matchResult.map(p => {
                const isChecked = (item.alokasi || []).some(a => a.po_detail_id === p.po_detail_id);
                const currentAlok = (item.alokasi || []).find(a => a.po_detail_id === p.po_detail_id);

                return (
                  <div
                    key={p.po_detail_id}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "8px 10px", borderRadius: 6,
                      background: isChecked ? "rgba(99,102,241,0.06)" : "white",
                      border: `1px solid ${isChecked ? "#6366f1" : "#e2e8f0"}`,
                      fontSize: 12,
                    }}
                  >
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flex: 1, margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => togglePOCheckbox(p, e.target.checked)}
                        style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#6366f1" }}
                      />
                      <div>
                        <span style={{ fontWeight: 700 }}>{p.nomor_po}</span>
                        <span style={{ color: "var(--color-muted)", margin: "0 6px" }}>·</span>
                        <span style={{ fontWeight: 600 }}>{p.dapur}</span>
                        <span style={{ color: "var(--color-muted)", margin: "0 6px" }}>·</span>
                        <span style={{ color: "var(--color-muted)", fontSize: 11 }}>Tgl PO: {formatDate(p.tanggal_po)}</span>
                        {p.is_belum_terlewat ? (
                          <span style={{ marginLeft: 8, padding: "2px 8px", borderRadius: 99, background: "rgba(34,197,94,0.12)", color: "#166534", fontSize: 10, fontWeight: 700 }}>
                            🟢 Belum Terlewat
                          </span>
                        ) : (
                          <span style={{ marginLeft: 8, padding: "2px 8px", borderRadius: 99, background: "#f1f5f9", color: "#64748b", fontSize: 10 }}>
                            ⚪ Terlewat
                          </span>
                        )}
                      </div>
                    </label>

                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 11, color: "var(--color-muted)" }}>Sisa PO: <strong>{p.qty_sisa}</strong> {p.satuan}</span>
                      {isChecked && (
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: "#4f46e5" }}>Qty Alokasi:</span>
                          <input
                            type="number" min="0.001" max={p.qty_sisa} step="0.001"
                            style={{ width: 80, padding: "3px 6px", border: "1.5px solid #6366f1", borderRadius: 4, fontSize: 12, fontWeight: 700, textAlign: "right" }}
                            value={currentAlok?.qty_alokasi ?? ""}
                            onChange={(e) => updateAlokasiQty(p.po_detail_id, e.target.value)}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function BelanjaEdit() {
  const router = useRouter();
  const { id } = router.query;
  const [supplierList, setSupplierList] = useState([]);
  const [dapurList, setDapurList] = useState([]);
  const [form, setForm] = useState({
    tanggal_belanja: new Date().toISOString().slice(0, 10),
    supplier_id: "",
    supplier_nama: "",
    rekening_manual: "",
    nama_bank_manual: "",
    dapur_id_alokasi: "",
    is_lunas: true,
    catatan: "",
  });
  const [items, setItems] = useState([
    { nama_item: "", item_id: null, satuan: "", qty_beli: "", harga_satuan: "", alokasi: [] }
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    supplierApi.list().then(r => setSupplierList(r.data)).catch(() => {});
    dapurApi.list({ is_active: true }).then(r => setDapurList(r.data)).catch(() => {});
    
    if (id) {
      belanjaApi.get(id).then(r => {
        const d = r.data;
        setForm({
          tanggal_belanja: d.tanggal_belanja,
          supplier_id: d.supplier?.id || "",
          supplier_nama: d.supplier_nama || "",
          rekening_manual: "",
          nama_bank_manual: "",
          dapur_id_alokasi: "",
          is_lunas: d.status === "lunas",
          catatan: d.catatan || "",
        });
        
        const loadedItems = d.details.map(det => ({
          nama_item: det.nama_item,
          item_id: det.item_id,
          satuan: det.satuan,
          qty_beli: det.qty_beli,
          harga_satuan: det.harga_satuan,
          alokasi: det.alokasi.map(al => ({
            po_detail_id: al.po_detail_id,
            po_id: al.po_id,
            qty_alokasi: al.qty_alokasi,
            nomor_po: al.po ? al.po.nomor_po : "Manual",
            dapur: al.po && al.po.dapur ? al.po.dapur.nama : "-"
          }))
        }));
        setItems(loadedItems.length > 0 ? loadedItems : [{ nama_item: "", item_id: null, satuan: "", qty_beli: "", harga_satuan: "", alokasi: [] }]);
      }).catch(e => setError("Gagal memuat transaksi"));
    }
  }, [id]);

  const updateItem = (idx, patch) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  };
  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));
  const addItem = () => setItems(prev => [...prev, { nama_item: "", item_id: null, satuan: "", qty_beli: "", harga_satuan: "", alokasi: [] }]);

  const total = items.reduce((s, it) => s + (parseFloat(it.qty_beli) || 0) * (parseFloat(it.harga_satuan) || 0), 0);

  const handleSave = async () => {
    setError("");
    if (!form.tanggal_belanja) { setError("Tanggal belanja wajib diisi"); return; }
    const details = items.filter(it => it.nama_item && parseFloat(it.qty_beli) > 0);
    if (!details.length) { setError("Tambahkan minimal 1 item"); return; }

    setSaving(true);
    try {
      let finalCatatan = form.catatan;
      if (!form.supplier_id && form.rekening_manual) {
        finalCatatan = `${form.catatan || ""}\n[Rekening Supplier Manual: ${form.nama_bank_manual || "Bank"} - ${form.rekening_manual}]`.trim();
      }
      const payload = {
        tanggal_belanja: form.tanggal_belanja,
        supplier_id: form.supplier_id ? parseInt(form.supplier_id) : null,
        supplier_nama: !form.supplier_id ? form.supplier_nama : null,
        nama_bank_manual: !form.supplier_id ? form.nama_bank_manual : null,
        rekening_manual: !form.supplier_id ? form.rekening_manual : null,
        is_lunas: form.is_lunas,
        catatan: finalCatatan,
        details: details.map(it => ({
          item_id: it.item_id,
          nama_item: it.nama_item,
          satuan: it.satuan,
          qty_beli: parseFloat(it.qty_beli),
          harga_satuan: parseFloat(it.harga_satuan) || 0,
          alokasi: (it.alokasi || [])
            .filter(a => a.po_detail_id && parseFloat(a.qty_alokasi) > 0)
            .map(a => ({
              po_detail_id: a.po_detail_id,
              po_id: a.po_id,
              qty_alokasi: parseFloat(a.qty_alokasi),
            })),
        })),
      };
      const r = await belanjaApi.update(id, payload);
      router.push(`/belanja/${id}`);
    } catch (e) {
      setError(e.response?.data?.detail || "Gagal menyimpan transaksi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">✏️ Edit Transaksi Belanja</h1>
          <p className="page-subtitle">Ubah item yang dibeli, harga, atau qty</p>
        </div>
        <Link href="/belanja" className="btn btn-ghost">← Kembali</Link>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20, alignItems: "start" }}>
        <div>
          {/* Header Form */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-title" style={{ marginBottom: 16 }}>📋 Informasi Transaksi</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Tanggal Belanja *</label>
                <input type="date" className="form-control" value={form.tanggal_belanja}
                  onChange={e => setForm(p => ({ ...p, tanggal_belanja: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Supplier</label>
                <select className="form-control" value={form.supplier_id}
                  onChange={e => setForm(p => ({ ...p, supplier_id: e.target.value }))}>
                  <option value="">-- Pilih Supplier / Input Manual --</option>
                  {supplierList.map(s => <option key={s.id} value={s.id}>{s.nama}</option>)}
                </select>
                {form.supplier_id && (() => {
                  const sup = supplierList.find(s => s.id === parseInt(form.supplier_id));
                  if (sup && sup.rekening) {
                    return (
                      <div style={{ fontSize: 12, color: "#4f46e5", fontWeight: 700, marginTop: 4 }}>
                        💳 Norek: {sup.nama_bank} · {sup.rekening}
                      </div>
                    );
                  }
                  return (
                    <div style={{ fontSize: 11, color: "var(--color-muted)", marginTop: 4 }}>
                      ⚠️ Supplier belum memiliki no rekening di master
                    </div>
                  );
                })()}
              </div>
              <div className="form-group" style={{ gridColumn: "1 / -1", borderTop: "1px dashed #e2e8f0", paddingTop: 16 }}>
                <label className="form-label" style={{ color: "#4f46e5" }}>Filter Alokasi PO (Dapur)</label>
                <select className="form-control" value={form.dapur_id_alokasi}
                  onChange={e => setForm(p => ({ ...p, dapur_id_alokasi: e.target.value }))}>
                  <option value="">Semua Dapur (Default)</option>
                  {dapurList.map(d => <option key={d.id} value={d.id}>{d.nama} ({d.kode})</option>)}
                </select>
                <div style={{ fontSize: 11, color: "var(--color-muted)", marginTop: 4 }}>
                  Pilih dapur ini jika Anda hanya ingin melihat dan mengalokasikan PO dari dapur tertentu saja.
                </div>
              </div>
              <div className="form-group" style={{ display: "flex", alignItems: "center", marginTop: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
                  <input type="checkbox" checked={form.is_lunas} style={{ width: 18, height: 18 }}
                    onChange={e => setForm(p => ({ ...p, is_lunas: e.target.checked }))} />
                  <span>💵 Belanja Langsung Lunas (Cash/COD)</span>
                </label>
                {!form.is_lunas && (
                  <div style={{ fontSize: 11, color: "#f59e0b", marginLeft: 12, fontWeight: 600 }}>
                    ⚠️ Unchecked = Otomatis dicatat sebagai Hutang Supplier
                  </div>
                )}
              </div>
              {!form.supplier_id && (
                <>
                  <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                    <label className="form-label">Nama Supplier (jika tidak ada di master)</label>
                    <input className="form-control" placeholder="Nama supplier / toko..."
                      value={form.supplier_nama} onChange={e => setForm(p => ({ ...p, supplier_nama: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Nama Bank Supplier (Manual)</label>
                    <input className="form-control" placeholder="mis: BCA, Mandiri..."
                      value={form.nama_bank_manual} onChange={e => setForm(p => ({ ...p, nama_bank_manual: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Nomor Rekening Supplier (Manual)</label>
                    <input className="form-control" placeholder="No. rekening..."
                      value={form.rekening_manual} onChange={e => setForm(p => ({ ...p, rekening_manual: e.target.value }))} />
                  </div>
                </>
              )}
              <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                <label className="form-label">Catatan</label>
                <textarea className="form-control" rows={2} value={form.catatan}
                  onChange={e => setForm(p => ({ ...p, catatan: e.target.value }))} />
              </div>
            </div>
          </div>

          {/* Items */}
          <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>📦 Daftar Item ({items.length})</div>
            <div style={{ fontSize: 12, color: "var(--color-muted)" }}>
              🟢 Cocok dengan PO &nbsp; 🟡 Tidak ada PO &nbsp; ⬜ Belum dicari
            </div>
          </div>

          {items.map((item, idx) => (
            <ItemRow
              key={idx}
              idx={idx}
              item={item}
              onUpdate={updateItem}
              onRemove={removeItem}
              tanggal={form.tanggal_belanja}
              dapurId={form.dapur_id_alokasi}
            />
          ))}

          <button className="btn btn-ghost" style={{ width: "100%", marginTop: 4 }} onClick={addItem}>
            + Tambah Item
          </button>
        </div>

        {/* Sidebar summary */}
        <div style={{ position: "sticky", top: 20 }}>
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="card-title" style={{ marginBottom: 16 }}>💰 Ringkasan</div>
            <div style={{ marginBottom: 16 }}>
              {items.filter(it => it.nama_item).map((it, i) => {
                const sub = (parseFloat(it.qty_beli) || 0) * (parseFloat(it.harga_satuan) || 0);
                return (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6, padding: "4px 0", borderBottom: "1px solid #f1f5f9" }}>
                    <span style={{ color: "var(--color-muted)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {it.nama_item || "—"} ({it.qty_beli || 0} {it.satuan})
                    </span>
                    <span className="rupiah" style={{ fontWeight: 600 }}>{formatRupiah(sub)}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 18, borderTop: "2px solid var(--color-border)", paddingTop: 12 }}>
              <span>Total</span>
              <span className="rupiah" style={{ color: "var(--color-primary)" }}>{formatRupiah(total)}</span>
            </div>
          </div>

          <div className="card" style={{ background: "rgba(99,102,241,0.04)", marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: "var(--color-muted)", lineHeight: 1.7 }}>
              <div><strong>🔄 Cara kerja:</strong></div>
              <ul style={{ paddingLeft: 14, margin: "8px 0 0" }}>
                <li>Ketik nama item → sistem cari di PO approved</li>
                <li>Alokasi qty otomatis ke PO (FIFO berdasarkan tanggal PO)</li>
                <li>Jika item ada di 2 PO, qty dibagi otomatis</li>
                <li>Bisa edit alokasi manual jika perlu</li>
              </ul>
            </div>
          </div>

          <button className="btn btn-primary" style={{ width: "100%", fontSize: 15, padding: "12px" }}
            disabled={saving} onClick={handleSave}>
            {saving ? "⏳ Menyimpan..." : "✓ Simpan Perubahan"}
          </button>
        </div>
      </div>

      <style>{`
        .hover-bg:hover { background: #f8fafc; }
      `}</style>
    </div>
  );
}

BelanjaEdit.title = "Edit Belanja";
