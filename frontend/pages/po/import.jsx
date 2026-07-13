import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { poApi, dapurApi, hargaApi, jadwalPMApi } from "@/lib/api";
import { formatRupiah } from "@/components/Layout";
import Link from "next/link";

// ── Parser untuk bulan bahasa Indonesia ──────────────────────────────────────
const BULAN_ID = {
  januari: "01", februari: "02", maret: "03", april: "04",
  mei: "05", juni: "06", juli: "07", agustus: "08",
  september: "09", oktober: "10", november: "11", desember: "12",
};

function parseIndonesianDate(str) {
  if (!str) return null;
  const clean = str.trim().toLowerCase().replace(/\./g, "");
  // Format: "12 juli 2026"
  const m = clean.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/);
  if (!m) return null;
  const [, day, bulan, year] = m;
  const mon = BULAN_ID[bulan];
  if (!mon) return null;
  return `${year}-${mon}-${day.padStart(2, "0")}`;
}

function parseQty(str) {
  if (!str) return 0;
  // Handle comma as decimal separator: "0,5" → 0.5
  return parseFloat(str.trim().replace(",", ".")) || 0;
}

// ── Parse markdown table text ────────────────────────────────────────────────
function parseTableText(text) {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const items = [];

  for (const line of lines) {
    if (!line.startsWith("|")) continue;
    // Skip separator lines like | --- | --- |
    if (/^\|[\s\-|:]+\|$/.test(line)) continue;

    const cols = line.split("|").map(c => c.trim()).filter(Boolean);
    if (cols.length < 4) continue;

    // Check first col is a date-like string
    const tanggal = parseIndonesianDate(cols[0]);
    if (!tanggal) continue;

    const nama_item = cols[1] || "";
    const qty = parseQty(cols[2]);
    const satuan = cols[3] || "pcs";

    if (!nama_item || qty <= 0) continue;

    items.push({ tanggal, nama_item, qty, satuan });
  }

  return items;
}

// Group items by date
function groupByDate(items) {
  const groups = {};
  for (const item of items) {
    if (!groups[item.tanggal]) groups[item.tanggal] = [];
    groups[item.tanggal].push(item);
  }
  return groups;
}

// Match item name to catalog (fuzzy: lowercase includes)
function matchCatalog(nama, catalog) {
  const lower = nama.toLowerCase();
  // Exact match first
  let found = catalog.find(h => h.item.nama_item.toLowerCase() === lower);
  if (found) return found;
  // Partial match
  found = catalog.find(h => h.item.nama_item.toLowerCase().includes(lower) || lower.includes(h.item.nama_item.toLowerCase()));
  return found || null;
}

// Format date Indonesian for display
function displayDate(dateStr) {
  if (!dateStr) return "";
  const BULAN = ["", "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const [y, m, d] = dateStr.split("-");
  return `${parseInt(d)} ${BULAN[parseInt(m)]} ${y}`;
}

export default function POImport() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [dapurList, setDapurList] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [dapurId, setDapurId] = useState("");
  const [rawText, setRawText] = useState("");
  const [parsed, setParsed] = useState(null); // { date: [items] }
  const [step, setStep] = useState(1); // 1=input, 2=preview, 3=processing, 4=done
  const [results, setResults] = useState([]); // [{date, po_id, nomor_po, status, error}]
  const [progress, setProgress] = useState({ done: 0, total: 0, current: "" });
  const [error, setError] = useState("");
  const [paguMap, setPaguMap] = useState({}); // date -> paguInfo

  useEffect(() => {
    let u = null;
    try { u = JSON.parse(localStorage.getItem("user")); setUser(u); } catch {}
    Promise.all([
      hargaApi.current(),
      (u && ["operator", "akuntan"].includes(u.role)) ? Promise.resolve({ data: [] }) : dapurApi.list({ is_active: true }),
    ]).then(([hRes, dRes]) => {
      setCatalog(hRes.data);
      if (dRes.data.length > 0) setDapurList(dRes.data);
      if (u?.dapur_id) setDapurId(String(u.dapur_id));
    }).catch(() => setError("Gagal memuat data awal"));
  }, []);

  const handleParse = () => {
    setError("");
    if (!dapurId) { setError("Pilih dapur terlebih dahulu"); return; }
    if (!rawText.trim()) { setError("Paste teks tabel terlebih dahulu"); return; }

    const items = parseTableText(rawText);
    if (items.length === 0) {
      setError("Tidak ada item yang berhasil diparsing. Pastikan format tabel benar.");
      return;
    }

    const groups = groupByDate(items);
    // Enrich with catalog match
    const enriched = {};
    for (const [date, its] of Object.entries(groups)) {
      enriched[date] = its.map(item => {
        const matched = matchCatalog(item.nama_item, catalog);
        return {
          ...item,
          matched_item: matched ? matched.item.nama_item : null,
          harga_satuan: matched ? matched.harga_jual : 0,
          item_id: matched ? matched.item.id : null,
          is_manual: !matched,
        };
      });
    }
    setParsed(enriched);
    setStep(2);

    // Fetch pagu for each date
    const fetchPagu = async () => {
      const map = {};
      for (const date of Object.keys(enriched)) {
        try {
          const r = await jadwalPMApi.paguCheck(dapurId, date);
          map[date] = r.data;
        } catch { map[date] = null; }
      }
      setPaguMap(map);
    };
    fetchPagu();
  };

  const handleCreateAll = async () => {
    if (!parsed) return;
    setStep(3);
    const dates = Object.keys(parsed).sort();
    setProgress({ done: 0, total: dates.length, current: "" });
    const resultList = [];

    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      const items = parsed[date];
      setProgress({ done: i, total: dates.length, current: displayDate(date) });

      try {
        // Check for existing draft PO
        const existing = await poApi.findDraft(parseInt(dapurId), date);

        if (existing) {
          // Add items to existing PO
          for (const item of items) {
            try {
              await poApi.addDetail(existing.id, {
                item_id: item.item_id,
                qty: item.qty,
                harga_satuan: item.harga_satuan || 0,
                satuan: item.satuan,
                nama_item_raw: item.nama_item,
              });
            } catch (e) {
              // Continue even if one item fails
            }
          }
          resultList.push({ date, po_id: existing.id, nomor_po: existing.nomor_po, status: "updated", error: null });
        } else {
          // Check jadwal first
          const verifyRes = await poApi.verifyJadwal(dapurId, date);
          if (!verifyRes.data.exists) {
            resultList.push({ date, po_id: null, nomor_po: null, status: "skip", error: `Jadwal PM belum diisi untuk ${displayDate(date)}` });
            continue;
          }

          const payload = {
            nomor_po: `PO-IMPORT-${date.replace(/-/g, "")}-${Date.now()}`,
            dapur_id: parseInt(dapurId),
            tanggal_po: date,
            catatan: "Import otomatis dari tabel",
            details: items.map(item => ({
              item_id: item.item_id,
              qty: item.qty,
              harga_satuan: item.harga_satuan || 0,
              satuan: item.satuan,
              nama_item_raw: item.nama_item,
            })),
          };
          const r = await poApi.create(payload);
          resultList.push({ date, po_id: r.data.id, nomor_po: r.data.nomor_po, status: "created", error: null });
        }
      } catch (e) {
        const msg = e.response?.data?.detail || e.message || "Gagal membuat PO";
        resultList.push({ date, po_id: null, nomor_po: null, status: "error", error: msg });
      }
    }

    setResults(resultList);
    setProgress({ done: dates.length, total: dates.length, current: "Selesai" });
    setStep(4);
  };

  const totalItems = parsed ? Object.values(parsed).flat().length : 0;
  const totalDates = parsed ? Object.keys(parsed).length : 0;
  const manualItems = parsed ? Object.values(parsed).flat().filter(i => i.is_manual).length : 0;
  const matchedItems = totalItems - manualItems;

  const statusColor = { created: "#22c55e", updated: "#6366f1", skip: "#f59e0b", error: "#ef4444" };
  const statusLabel = { created: "✓ PO Dibuat", updated: "↑ Ditambahkan ke PO Ada", skip: "⏭ Dilewati (Tidak ada jadwal)", error: "✕ Gagal" };

  return (
    <div>
      <style>{`
        .import-step { display: flex; align-items: center; gap: 8px; margin-bottom: 24px; }
        .step-dot { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; flex-shrink: 0; }
        .step-dot.active { background: var(--color-primary); color: white; }
        .step-dot.done { background: #22c55e; color: white; }
        .step-dot.idle { background: #e5e7eb; color: #6b7280; }
        .step-line { height: 2px; flex: 1; background: #e5e7eb; }
        .step-line.done { background: #22c55e; }
        .preview-table th { background: #f8fafc; font-size: 12px; }
        .preview-table td { font-size: 12px; padding: 6px 10px; }
        .item-manual { background: rgba(245,158,11,0.06); }
        .item-matched { background: rgba(34,197,94,0.04); }
        .progress-bar-outer { height: 8px; background: #e5e7eb; border-radius: 99px; overflow: hidden; }
        .progress-bar-inner { height: 100%; background: var(--color-primary); border-radius: 99px; transition: width 0.3s; }
      `}</style>

      <div className="page-header">
        <div>
          <h1 className="page-title">📥 Import PO dari Tabel</h1>
          <p className="page-subtitle">Paste tabel barang, sistem akan otomatis membuat PO per tanggal</p>
        </div>
        <Link href="/po" className="btn btn-ghost">← Daftar PO</Link>
      </div>

      {/* Step Indicator */}
      <div className="import-step">
        {[
          { n: 1, label: "Input" },
          { n: 2, label: "Preview" },
          { n: 3, label: "Proses" },
          { n: 4, label: "Selesai" },
        ].map((s, idx, arr) => (
          <>
            <div key={s.n} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div className={`step-dot ${step > s.n ? "done" : step === s.n ? "active" : "idle"}`}>
                {step > s.n ? "✓" : s.n}
              </div>
              <span style={{ fontSize: 11, color: step === s.n ? "var(--color-primary)" : "var(--color-muted)", fontWeight: step === s.n ? 700 : 400 }}>{s.label}</span>
            </div>
            {idx < arr.length - 1 && <div className={`step-line ${step > s.n ? "done" : ""}`} />}
          </>
        ))}
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      {/* ── STEP 1: INPUT ── */}
      {step === 1 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div className="card">
            <div className="card-title" style={{ marginBottom: 16 }}>📋 Konfigurasi</div>

            {/* Dapur selector */}
            {dapurList.length > 0 ? (
              <div className="form-group">
                <label className="form-label">Pilih Dapur *</label>
                <select className="form-control" value={dapurId} onChange={e => setDapurId(e.target.value)}>
                  <option value="">-- Pilih Dapur --</option>
                  {dapurList.map(d => (
                    <option key={d.id} value={d.id}>{d.nama} ({d.kode})</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="alert alert-info" style={{ marginBottom: 12 }}>
                Dapur terpilih otomatis sesuai akun Anda.
              </div>
            )}

            <div className="form-group" style={{ marginTop: 16 }}>
              <label className="form-label">Paste Tabel di sini *</label>
              <textarea
                className="form-control"
                rows={20}
                placeholder={`Contoh format:\n| Tanggal      | Nama Barang  | Qty | Satuan |\n| ------------ | ------------ | --- | ------ |\n| 12 Juli 2026 | Beras        | 100 | Kg     |`}
                value={rawText}
                onChange={e => setRawText(e.target.value)}
                style={{ fontFamily: "monospace", fontSize: 12 }}
              />
            </div>

            <button className="btn btn-primary" style={{ width: "100%", marginTop: 8 }} onClick={handleParse}>
              🔍 Parse & Preview
            </button>
          </div>

          <div className="card">
            <div className="card-title" style={{ marginBottom: 16 }}>📖 Panduan Format</div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--color-muted)" }}>
              <p><strong style={{ color: "var(--color-text)" }}>Format tabel yang didukung:</strong></p>
              <ul style={{ paddingLeft: 16, marginBottom: 12 }}>
                <li>Kolom 1: <strong>Tanggal</strong> (e.g. "12 Juli 2026")</li>
                <li>Kolom 2: <strong>Nama Barang</strong></li>
                <li>Kolom 3: <strong>Qty</strong> (gunakan koma untuk desimal: "0,5")</li>
                <li>Kolom 4: <strong>Satuan</strong></li>
              </ul>

              <p><strong style={{ color: "var(--color-text)" }}>Cara kerja sistem:</strong></p>
              <ul style={{ paddingLeft: 16, marginBottom: 12 }}>
                <li>Items dikelompokkan per tanggal → satu PO per tanggal</li>
                <li>Jika sudah ada PO draft di tanggal yang sama, items akan <strong>ditambahkan</strong> ke PO tersebut</li>
                <li>Items yang ada di katalog → harga otomatis diisi</li>
                <li>Items baru → otomatis masuk Master Item (harga Rp 0, perlu diisi manual)</li>
                <li>Tanggal tanpa jadwal PM → PO dilewati</li>
              </ul>

              <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 8, padding: "10px 12px" }}>
                <strong>⚠️ Perhatian:</strong> Items tanpa harga di katalog akan masuk dengan harga <strong>Rp 0</strong>. Setelah import, buka detail PO untuk mengedit harga item tersebut.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 2: PREVIEW ── */}
      {step === 2 && parsed && (
        <div>
          {/* Summary Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
            {[
              { label: "Total Tanggal / PO", value: totalDates, color: "var(--color-primary)", icon: "📅" },
              { label: "Total Item", value: totalItems, color: "#374151", icon: "📦" },
              { label: "✓ Sesuai Katalog", value: matchedItems, color: "#22c55e", icon: "✓" },
              { label: "⚠️ Item Manual (Harga 0)", value: manualItems, color: "#f59e0b", icon: "✏️" },
            ].map(c => (
              <div key={c.label} className="card" style={{ padding: "14px 16px" }}>
                <div style={{ fontSize: 11, color: "var(--color-muted)", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>{c.icon} {c.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: c.color }}>{c.value}</div>
              </div>
            ))}
          </div>

          {/* Per-date preview */}
          {Object.entries(parsed).sort().map(([date, items]) => {
            const pagu = paguMap[date];
            const totalNilai = items.reduce((s, i) => s + i.qty * (i.harga_satuan || 0), 0);
            return (
              <div key={date} className="card" style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>📅 {displayDate(date)}</div>
                    <div style={{ fontSize: 12, color: "var(--color-muted)" }}>{items.length} item · Total: {formatRupiah(totalNilai)}</div>
                  </div>
                  {pagu && (
                    <div style={{ fontSize: 12, textAlign: "right" }}>
                      {pagu.jadwal_ada ? (
                        <>
                          <div style={{ color: "var(--color-muted)" }}>Pagu harian: {formatRupiah(pagu.pagu_harian)}</div>
                          <div style={{ color: pagu.over_mingguan ? "#ef4444" : "var(--color-muted)" }}>
                            Sisa minggu: {formatRupiah(pagu.sisa_limit_mingguan)}
                            {pagu.over_mingguan && " 🚫"}
                          </div>
                        </>
                      ) : (
                        <span style={{ color: "#ef4444", fontWeight: 600 }}>⚠️ Tidak ada jadwal PM</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="table-wrapper">
                  <table className="preview-table">
                    <thead>
                      <tr>
                        <th>No</th>
                        <th>Nama Item</th>
                        <th>Katalog Match</th>
                        <th style={{ textAlign: "right" }}>Qty</th>
                        <th>Satuan</th>
                        <th style={{ textAlign: "right" }}>Harga Satuan</th>
                        <th style={{ textAlign: "right" }}>Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, i) => (
                        <tr key={i} className={item.is_manual ? "item-manual" : "item-matched"}>
                          <td>{i + 1}</td>
                          <td><strong>{item.nama_item}</strong></td>
                          <td>
                            {item.is_manual ? (
                              <span style={{ color: "#f59e0b", fontSize: 11, fontWeight: 600 }}>⚠️ Item Baru (Manual)</span>
                            ) : (
                              <span style={{ color: "#22c55e", fontSize: 11 }}>✓ {item.matched_item}</span>
                            )}
                          </td>
                          <td style={{ textAlign: "right" }}>{item.qty}</td>
                          <td>{item.satuan}</td>
                          <td style={{ textAlign: "right" }} className="rupiah">
                            {item.is_manual ? (
                              <span style={{ color: "#f59e0b" }}>Rp 0 (isi manual)</span>
                            ) : formatRupiah(item.harga_satuan)}
                          </td>
                          <td style={{ textAlign: "right" }} className="rupiah">
                            {formatRupiah(item.qty * (item.harga_satuan || 0))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
            <button className="btn btn-ghost" onClick={() => { setStep(1); setParsed(null); setPaguMap({}); }}>
              ← Kembali Edit
            </button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleCreateAll}>
              🚀 Buat {totalDates} PO Sekarang
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: PROCESSING ── */}
      {step === 3 && (
        <div className="card" style={{ textAlign: "center", padding: 48 }}>
          <div className="spinner" style={{ width: 48, height: 48, margin: "0 auto 20px" }} />
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Sedang Membuat PO...</div>
          <div style={{ color: "var(--color-muted)", marginBottom: 20 }}>
            {progress.current && `Memproses: ${progress.current}`}
          </div>
          <div className="progress-bar-outer" style={{ maxWidth: 400, margin: "0 auto" }}>
            <div className="progress-bar-inner" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
          </div>
          <div style={{ marginTop: 8, fontSize: 13, color: "var(--color-muted)" }}>
            {progress.done} / {progress.total} PO
          </div>
        </div>
      )}

      {/* ── STEP 4: DONE ── */}
      {step === 4 && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div className="card-title">✅ Hasil Import</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-ghost" onClick={() => { setStep(1); setParsed(null); setResults([]); setPaguMap({}); setRawText(""); }}>
                  + Import Baru
                </button>
                <Link href="/po" className="btn btn-primary">Lihat Daftar PO</Link>
              </div>
            </div>

            {/* Summary */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
              {[
                { label: "PO Dibuat", value: results.filter(r => r.status === "created").length, color: "#22c55e" },
                { label: "Ditambahkan ke PO Ada", value: results.filter(r => r.status === "updated").length, color: "#6366f1" },
                { label: "Dilewati (Tidak ada Jadwal)", value: results.filter(r => r.status === "skip").length, color: "#f59e0b" },
                { label: "Gagal", value: results.filter(r => r.status === "error").length, color: "#ef4444" },
              ].map(c => (
                <div key={c.label} style={{ padding: "12px 16px", background: "#f8fafc", borderRadius: 10, borderLeft: `4px solid ${c.color}` }}>
                  <div style={{ fontSize: 11, color: "var(--color-muted)", fontWeight: 600, marginBottom: 4 }}>{c.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: c.color }}>{c.value}</div>
                </div>
              ))}
            </div>

            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Tanggal</th>
                    <th>Status</th>
                    <th>Nomor PO</th>
                    <th>Keterangan</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={i}>
                      <td><strong>{displayDate(r.date)}</strong></td>
                      <td>
                        <span style={{ color: statusColor[r.status], fontWeight: 700, fontSize: 12 }}>
                          {statusLabel[r.status]}
                        </span>
                      </td>
                      <td>{r.nomor_po || "-"}</td>
                      <td style={{ color: "#ef4444", fontSize: 12 }}>{r.error || ""}</td>
                      <td>
                        {r.po_id && (
                          <Link href={`/po/${r.po_id}`} className="btn btn-ghost btn-sm" style={{ fontSize: 12 }}>
                            Lihat PO →
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

POImport.title = "Import PO dari Tabel";
