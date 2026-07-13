import { useState, useEffect, useCallback, useRef } from "react";
import { hargaApi, poApi, dapurApi, jadwalPMApi, trenHargaApi } from "@/lib/api";
import { formatRupiah } from "@/components/Layout";
import { useRouter } from "next/router";
import Link from "next/link";

const KATEGORI_TAB = [
  { value: "", label: "Semua" },
  { value: "perishable", label: "🥦 Perishable" },
  { value: "groceries", label: "🛒 Groceries" },
];

const TREND_CONFIG = {
  naik: { color: "#dc2626", bg: "rgba(239,68,68,0.09)", arah: "↑", label: "Naik" },
  turun: { color: "#059669", bg: "rgba(16,185,129,0.09)", arah: "↓", label: "Turun" },
  stabil: { color: "#6366f1", bg: "rgba(99,102,241,0.09)", arah: "→", label: "Stabil" },
};

const HET_STATUS_CONFIG = {
  aman: { color: "#059669", label: "Aman" },
  mendekati: { color: "#b45309", label: "⚠️ Mendekati HET" },
  melebihi: { color: "#dc2626", label: "🚫 Melebihi HET" },
  tidak_ada_het: { color: "#6b7280", label: "HET N/A" },
};

function TrendBadge({ tren, pct, size = "sm" }) {
  if (!tren) return null;
  const cfg = TREND_CONFIG[tren] || TREND_CONFIG.stabil;
  const fs = size === "sm" ? 10 : 12;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 2,
      padding: size === "sm" ? "2px 7px" : "3px 10px",
      borderRadius: 99, fontSize: fs, fontWeight: 700,
      background: cfg.bg, color: cfg.color,
    }}>
      {cfg.arah} {cfg.label}{pct ? ` ${Math.abs(pct)}%` : ""}
    </span>
  );
}

function Sparkline({ data = [], color = "#6366f1" }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const W = 54, H = 20;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((v - min) / range) * (H - 2) - 1;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={W} height={H} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

// ── Panel Detail Tren (slide-in dari kanan) ───────────────────────────────────
function TrenPanel({ nama, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!nama) return;
    setLoading(true);
    trenHargaApi.detail(nama)
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [nama]);

  const fr = (v) => v != null ? `Rp ${parseFloat(v).toLocaleString("id-ID")}` : "—";

  return (
    <div style={{
      position: "fixed", top: 0, right: 0, bottom: 0, width: 380,
      background: "white", boxShadow: "-4px 0 24px rgba(0,0,0,0.14)",
      zIndex: 900, display: "flex", flexDirection: "column",
      animation: "slideRight 0.22s ease",
    }}>
      <style>{`@keyframes slideRight { from { transform:translateX(100%) } to { transform:none } }`}</style>
      <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--color-border)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, textTransform: "capitalize" }}>{nama}</div>
          <div style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 2 }}>Analisis Tren Harga Pembelian</div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--color-muted)" }}>✕</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "var(--color-muted)" }}>
            <div className="spinner" style={{ width: 24, height: 24, margin: "0 auto 10px" }} />
            <div>Menganalisis data harga...</div>
          </div>
        ) : !data || data.status === "tidak_ada_data" ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--color-muted)" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
            <div style={{ fontWeight: 600 }}>Belum ada data histori</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Item ini belum ada di database tren harga</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* KPI Row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                { label: "Harga Terakhir", value: fr(data.harga_terakhir), color: "var(--color-primary)" },
                { label: "Rata-rata", value: fr(data.statistik?.mean), color: "#374151" },
                { label: "Forecast Minggu Ini", value: fr(data.forecast?.minggu_depan), color: "#059669" },
                { label: "Forecast Bulan Depan", value: fr(data.forecast?.bulan_depan), color: "#b45309" },
              ].map(k => (
                <div key={k.label} style={{ background: "#f8fafc", borderRadius: 10, padding: "10px 12px", border: "1px solid var(--color-border)" }}>
                  <div style={{ fontSize: 10, color: "var(--color-muted)", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>{k.label}</div>
                  <div style={{ fontWeight: 800, color: k.color, fontSize: 14 }}>{k.value}</div>
                </div>
              ))}
            </div>

            {/* Trend & Skor */}
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <TrendBadge tren={data.trend?.status} pct={data.trend?.pct_change} size="md" />
              <span style={{
                padding: "3px 12px", borderRadius: 99, fontSize: 12, fontWeight: 800,
                background: data.skor >= 70 ? "rgba(16,185,129,0.1)" : data.skor >= 50 ? "rgba(245,158,11,0.1)" : "rgba(239,68,68,0.1)",
                color: data.skor >= 70 ? "#059669" : data.skor >= 50 ? "#b45309" : "#dc2626",
              }}>
                Skor: {data.skor}/100
              </span>
            </div>

            {/* Sparkline Chart */}
            {data.harga_list?.length >= 3 && (
              <div style={{ background: "#f8fafc", borderRadius: 12, padding: "14px 16px", border: "1px solid var(--color-border)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase", marginBottom: 8 }}>
                  Histori Harga Beli ({data.n_data} transaksi)
                </div>
                <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 60 }}>
                  {(() => {
                    const prices = data.harga_list;
                    const min = Math.min(...prices), max = Math.max(...prices);
                    const range = max - min || 1;
                    return prices.slice(-20).map((p, i) => {
                      const h = Math.max(3, ((p - min) / range) * 50);
                      const isCur = i === Math.min(19, prices.slice(-20).length - 1);
                      return (
                        <div key={i} title={`Rp ${p.toLocaleString("id-ID")}`} style={{
                          flex: 1, height: h, background: isCur ? "#6366f1" : "rgba(99,102,241,0.3)",
                          borderRadius: "2px 2px 0 0", alignSelf: "flex-end",
                          cursor: "default", transition: "background 0.15s",
                        }} />
                      );
                    });
                  })()}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--color-muted)", marginTop: 4 }}>
                  <span>Min: {fr(data.statistik?.min)}</span>
                  <span>Max: {fr(data.statistik?.max)}</span>
                </div>
              </div>
            )}

            {/* HET */}
            {data.het_info && (
              <div style={{ background: data.harga_result?.status_het === "aman" ? "rgba(16,185,129,0.06)" : "rgba(245,158,11,0.06)", borderRadius: 10, padding: 14, border: "1px solid var(--color-border)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase", marginBottom: 8 }}>HET Kepokmas Kab. Cirebon</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 13 }}>{data.het_info.nama_kepokmas || "Tidak ditemukan"}</span>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{fr(data.het_info.het)}</span>
                </div>
                {data.het_info.match_score && (
                  <div style={{ fontSize: 11, color: "var(--color-muted)" }}>Akurasi match: {data.het_info.match_score}%</div>
                )}
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 11, color: "var(--color-muted)", marginBottom: 4 }}>Rekomendasi Harga Jual</div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontWeight: 800, fontSize: 16, color: HET_STATUS_CONFIG[data.harga_result?.status_het]?.color || "#374151" }}>
                      {fr(data.harga_result?.harga_jual)}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--color-muted)" }}>
                      Margin: {data.harga_result?.margin_aktual}%
                    </span>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: HET_STATUS_CONFIG[data.harga_result?.status_het]?.color, marginTop: 3 }}>
                    {HET_STATUS_CONFIG[data.harga_result?.status_het]?.label}
                  </div>
                </div>
              </div>
            )}

            {/* Statistik */}
            <div style={{ background: "#f8fafc", borderRadius: 10, padding: "12px 14px", border: "1px solid var(--color-border)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase", marginBottom: 10 }}>Statistik Harga</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", fontSize: 12 }}>
                {[
                  ["Rata-rata", fr(data.statistik?.mean)],
                  ["Median", fr(data.statistik?.median)],
                  ["Min", fr(data.statistik?.min)],
                  ["Max", fr(data.statistik?.max)],
                  ["Std Deviasi", fr(data.statistik?.std)],
                  ["Volatilitas (CV)", `${data.statistik?.cv}%`],
                ].map(([l, v]) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: 4 }}>
                    <span style={{ color: "var(--color-muted)" }}>{l}</span>
                    <span style={{ fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Forecast detail */}
            {data.forecast?.metode && (
              <div style={{ fontSize: 11, color: "var(--color-muted)", textAlign: "center", padding: "8px 0" }}>
                Forecast menggunakan metode: <strong>{data.forecast.metode.replace(/_/g, " ")}</strong>
                {data.forecast.ci_lower && ` (CI: ${fr(data.forecast.ci_lower)} – ${fr(data.forecast.ci_upper)})`}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Pagu Widget ───────────────────────────────────────────────────────────────
function PaguWidget({ pagu }) {
  if (!pagu) return null;
  const {
    jadwal_ada, pagu_harian, terpakai_harian, sisa_pagu_harian, over_harian,
    limit_mingguan, terpakai_mingguan, sisa_limit_mingguan, over_mingguan,
    minggu_dari, minggu_sampai, jumlah_pm_kecil, jumlah_pm_besar, pagu_kecil, pagu_besar,
    jumlah_pm, jenis_porsi
  } = pagu;

  if (!jadwal_ada) {
    return (
      <div className="alert alert-error" style={{ marginBottom: 16 }}>
        ⚠️ Jadwal PM belum diisi untuk tanggal ini. Hubungi admin untuk mengisi jumlah penerima manfaat.
      </div>
    );
  }

  const pctH = Math.min((Number(terpakai_harian) / Number(pagu_harian)) * 100, 100);
  const pctW = limit_mingguan > 0 ? Math.min((Number(terpakai_mingguan) / Number(limit_mingguan)) * 100, 100) : 0;
  const colorH = over_harian ? "#ef4444" : pctH >= 80 ? "#f59e0b" : "#22c55e";
  const colorW = over_mingguan ? "#ef4444" : pctW >= 80 ? "#f59e0b" : "#22c55e";

  return (
    <div className="card" style={{ marginBottom: 20, borderLeft: `4px solid ${over_mingguan ? "#ef4444" : over_harian ? "#f59e0b" : "var(--color-primary)"}` }}>
      <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Pagu Harian {jumlah_pm_kecil + jumlah_pm_besar > 0 ? (
              <span>({jumlah_pm_kecil} Kecil, {jumlah_pm_besar} Besar)</span>
            ) : (
              <span>{jumlah_pm} PM ({jenis_porsi})</span>
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontWeight: 700, fontSize: 16, color: over_harian ? "#ef4444" : "inherit" }}>
              Sisa: {formatRupiah(sisa_pagu_harian)}
            </span>
            <span style={{ fontSize: 12, color: "var(--color-muted)" }}>dari {formatRupiah(pagu_harian)}</span>
          </div>
          <div style={{ background: "#e2e8f0", borderRadius: 4, height: 8 }}>
            <div style={{ width: `${pctH}%`, height: "100%", background: colorH, borderRadius: 4, transition: "width 0.3s" }} />
          </div>
          {over_harian && <div style={{ fontSize: 11, color: "#ef4444", marginTop: 2 }}>⚠️ Pagu harian terlampaui (soft limit)</div>}
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Limit Minggu ({minggu_dari && new Date(minggu_dari + "T00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short" })} – {minggu_sampai && new Date(minggu_sampai + "T00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short" })})
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontWeight: 700, fontSize: 16, color: over_mingguan ? "#ef4444" : "inherit" }}>
              Sisa: {formatRupiah(sisa_limit_mingguan)}
            </span>
            <span style={{ fontSize: 12, color: "var(--color-muted)" }}>dari {formatRupiah(limit_mingguan)}</span>
          </div>
          <div style={{ background: "#e2e8f0", borderRadius: 4, height: 8 }}>
            <div style={{ width: `${pctW}%`, height: "100%", background: colorW, borderRadius: 4, transition: "width 0.3s" }} />
          </div>
          {over_mingguan && <div style={{ fontSize: 11, color: "#ef4444", marginTop: 2 }}>⚠️ Limit mingguan terlampaui (Soft Warning).</div>}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CreatePO() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [dapurList, setDapurList] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [search, setSearch] = useState("");
  const [kategoriFilter, setKategoriFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [paguInfo, setPaguInfo] = useState(null);
  const [loadingPagu, setLoadingPagu] = useState(false);

  // Manual item state
  const [manualItem, setManualItem] = useState({
    nama_item: "",
    satuan: "pcs",
    qty: "",
    harga_satuan: ""
  });

  // Tren harga state
  const [trenData, setTrenData] = useState({});   // { nama_item: mini_result }
  const [loadingTren, setLoadingTren] = useState(false);
  const [selectedTren, setSelectedTren] = useState(null);  // nama item yang dipilih untuk panel detail
  const trenFetchedRef = useRef(false);

  const [form, setForm] = useState({
    nomor_po: "",
    dapur_id: "",
    tanggal_po: new Date().toISOString().slice(0, 10),
    tanggal_kirim: "",
    catatan: "",
  });

  const [cart, setCart] = useState({});

  // Load user & catalog
  useEffect(() => {
    const init = async () => {
      try {
        let u = null;
        try { u = JSON.parse(localStorage.getItem("user")); setUser(u); } catch { }
        if (!u || !["operator", "akuntan"].includes(u.role)) {
          const dRes = await dapurApi.list({ is_active: true });
          setDapurList(dRes.data);
        } else if (u?.dapur_id) {
          setForm(prev => ({ ...prev, dapur_id: u.dapur_id.toString() }));
        }
        const pRes = await hargaApi.current();
        setCatalog(pRes.data);
      } catch { setError("Gagal memuat data awal"); }
      finally { setLoading(false); }
    };
    init();
  }, []);

  // Load tren batch setelah katalog dimuat
  useEffect(() => {
    if (catalog.length === 0 || trenFetchedRef.current) return;
    trenFetchedRef.current = true;

    const names = catalog.map(h => h.item.nama_item.toLowerCase());
    setLoadingTren(true);
    trenHargaApi.batch(names)
      .then(r => setTrenData(r.data.results || {}))
      .catch(() => { })
      .finally(() => setLoadingTren(false));
  }, [catalog]);

  const fetchPagu = useCallback(async (dapur_id, tanggal) => {
    if (!dapur_id || !tanggal) { setPaguInfo(null); return; }
    setLoadingPagu(true);
    try {
      const res = await jadwalPMApi.paguCheck(dapur_id, tanggal);
      setPaguInfo(res.data);
    } catch { setPaguInfo(null); }
    finally { setLoadingPagu(false); }
  }, []);

  useEffect(() => {
    fetchPagu(form.dapur_id, form.tanggal_po);
  }, [form.dapur_id, form.tanggal_po, fetchPagu]);

  const handleQtyChange = (hargaItem, qtyStr) => {
    const qty = parseFloat(qtyStr);
    const id = hargaItem.item.id;
    if (isNaN(qty) || qty <= 0) {
      const nc = { ...cart }; delete nc[id]; setCart(nc); return;
    }
    setCart({
      ...cart,
      [id]: {
        item_id: id, nama_item: hargaItem.item.nama_item,
        satuan: hargaItem.item.satuan, harga_satuan: hargaItem.harga_jual, qty,
        kategori: hargaItem.item.kategori,
      },
    });
  };

  const handleAddManualItem = () => {
    if (!manualItem.nama_item || !manualItem.qty || !manualItem.harga_satuan) {
      alert("Lengkapi nama item, qty, dan harga satuan");
      return;
    }
    const id = `manual-${Date.now()}`;
    setCart({
      ...cart,
      [id]: {
        item_id: null,
        nama_item: manualItem.nama_item,
        satuan: manualItem.satuan,
        qty: parseFloat(manualItem.qty),
        harga_satuan: parseFloat(manualItem.harga_satuan),
        kategori: "lainnya"
      }
    });
    setManualItem({ nama_item: "", satuan: "pcs", qty: "", harga_satuan: "" });
  };

  const removeFromCart = (key) => {
    const nc = { ...cart };
    delete nc[key];
    setCart(nc);
  };

  const updateCartQty = (key, newQty) => {
    if (newQty <= 0) {
      removeFromCart(key);
      return;
    }
    setCart({
      ...cart,
      [key]: { ...cart[key], qty: newQty }
    });
  };

  const handleSave = async () => {
    if (!form.dapur_id) { setError("Pilih dapur terlebih dahulu"); return; }
    if (!form.tanggal_po) { setError("Tanggal PO wajib diisi"); return; }
    const cartItems = Object.values(cart);
    if (cartItems.length === 0) { setError("Keranjang belanja kosong!"); return; }

    setSaving(true); setError("");
    try {
      // Cek apakah sudah ada PO draft untuk dapur + tanggal yang sama
      const existingDraft = await poApi.findDraft(parseInt(form.dapur_id), form.tanggal_po);
      if (existingDraft) {
        // Sudah ada PO draft — tambahkan item-item ke PO yang ada
        for (const item of cartItems) {
          await poApi.addDetail(existingDraft.id, {
            item_id: item.item_id,
            qty: item.qty,
            harga_satuan: item.harga_satuan,
            satuan: item.satuan,
            nama_item_raw: item.nama_item,
          });
        }
        router.push(`/po/${existingDraft.id}`);
        return;
      }

      const verifyRes = await poApi.verifyJadwal(form.dapur_id, form.tanggal_po);
      if (!verifyRes.data.exists) {
        const availDates = verifyRes.data.available_dates || "Tidak ada jadwal tersedia";
        setError(
          `Jadwal PM belum diisi untuk tanggal ${form.tanggal_po}. ` +
          `Jadwal tersedia: ${availDates}. ` +
          `Hubungi admin untuk mengisi jumlah penerima manfaat.`
        );
        setSaving(false);
        return;
      }

      const poPayload = {
        nomor_po: form.nomor_po.trim() || `PO-${Date.now()}`,
        dapur_id: parseInt(form.dapur_id),
        tanggal_po: form.tanggal_po,
        tanggal_kirim: form.tanggal_kirim || null,
        catatan: form.catatan,
        details: cartItems.map(item => ({
          item_id: item.item_id,
          qty: item.qty,
          harga_satuan: item.harga_satuan,
          satuan: item.satuan,
          nama_item_raw: item.nama_item,
        })),
      };
      const poRes = await poApi.create(poPayload);
      router.push(`/po/${poRes.data.id}`);
    } catch (err) {
      setError(err.response?.data?.detail || "Gagal menyimpan PO");
      setSaving(false);
    }
  };


  const cartTotal = Object.values(cart).reduce((s, i) => s + i.qty * i.harga_satuan, 0);

  const filteredCatalog = catalog.filter(h => {
    const matchSearch = h.item.nama_item.toLowerCase().includes(search.toLowerCase());
    const matchKat = !kategoriFilter || h.item.kategori === kategoriFilter;
    return matchSearch && matchKat;
  });

  const sisaMingguan = paguInfo ? Number(paguInfo.sisa_limit_mingguan) : Infinity;
  const budgetExceeded = paguInfo?.limit_mingguan > 0 && cartTotal > sisaMingguan;

  // Cek item di cart yang tren naik tajam
  const cartWarnings = Object.values(cart).filter(item => {
    const t = trenData[item.nama_item.toLowerCase()];
    return t && t.trend === "naik" && Math.abs(t.trend_pct) >= 8;
  });

  return (
    <div>
      <style>{`
        @keyframes slideRight { from { transform: translateX(60px); opacity:0; } to { transform:none; opacity:1; } }
        .tren-btn { background: none; border: none; cursor: pointer; padding: 2px 5px; border-radius: 4px; font-size: 13; }
        .tren-btn:hover { background: #f1f5f9; }
        .catalog-row:hover { background: rgba(99,102,241,0.03); }
      `}</style>

      <div className="page-header">
        <div>
          <h1 className="page-title">Buat PO Manual</h1>
          <p className="page-subtitle">Pesanan harian berdasarkan katalog & pagu yang tersedia</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/harga-analitik" className="btn btn-ghost" style={{ fontSize: 13 }}>
            📊 Tren Harga
          </Link>
          <Link href="/po" className="btn btn-ghost">← Kembali</Link>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Warning item naik tajam */}
      {cartWarnings.length > 0 && (
        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "#92400e" }}>
          ⚠️ <strong>Perhatian Tren Harga:</strong>{" "}
          {cartWarnings.map(w => {
            const t = trenData[w.nama_item.toLowerCase()];
            return `${w.nama_item} (↑${Math.abs(t?.trend_pct || 0)}%)`;
          }).join(", ")} mengalami kenaikan harga signifikan.
        </div>
      )}

      {/* Form PO Header */}
      <div className="form-grid" style={{ marginBottom: 16 }}>
        {(!user || !["operator", "akuntan"].includes(user.role)) && (
          <div className="form-group">
            <label className="form-label">Dapur *</label>
            <select className="form-control" value={form.dapur_id}
              onChange={e => setForm({ ...form, dapur_id: e.target.value })}>
              <option value="">-- Pilih Dapur --</option>
              {dapurList.map(d => <option key={d.id} value={d.id}>{d.nama}</option>)}
            </select>
          </div>
        )}
        <div className="form-group">
          <label className="form-label">Nomor PO (Opsional)</label>
          <input className="form-control" placeholder="Kosongkan untuk otomatis"
            value={form.nomor_po} onChange={e => setForm({ ...form, nomor_po: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">Tanggal PO *</label>
          <input type="date" className="form-control" value={form.tanggal_po}
            onChange={e => setForm({ ...form, tanggal_po: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">Tanggal Kirim</label>
          <input type="date" className="form-control" value={form.tanggal_kirim}
            onChange={e => setForm({ ...form, tanggal_kirim: e.target.value })} />
        </div>
      </div>

      {/* Pagu Widget */}
      {loadingPagu ? (
        <div style={{ marginBottom: 16, color: "var(--color-muted)", fontSize: 13 }}>⏳ Memuat info pagu...</div>
      ) : (
        <PaguWidget pagu={paguInfo} />
      )}

      <div style={{ display: "flex", gap: 24 }}>
        {/* Catalog */}
        <div className="card" style={{ flex: 2 }}>
          <div className="card-header">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div className="card-title">Katalog Harga Aktif</div>
              {loadingTren && (
                <span style={{ fontSize: 11, color: "var(--color-muted)", background: "#f1f5f9", padding: "2px 8px", borderRadius: 99 }}>
                  📊 Memuat tren...
                </span>
              )}
            </div>
            <input className="form-control" placeholder="Cari item..." style={{ width: 200 }}
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          {/* Category Tabs */}
          <div style={{ display: "flex", gap: 0, marginBottom: 12, borderBottom: "1px solid var(--color-border)" }}>
            {KATEGORI_TAB.map(t => (
              <button key={t.value}
                onClick={() => setKategoriFilter(t.value)}
                style={{
                  padding: "8px 16px", border: "none", background: "none", cursor: "pointer",
                  fontWeight: kategoriFilter === t.value ? 700 : 400,
                  color: kategoriFilter === t.value ? "var(--color-primary)" : "var(--color-muted)",
                  borderBottom: kategoriFilter === t.value ? "2px solid var(--color-primary)" : "2px solid transparent",
                  fontSize: 13,
                }}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="table-wrapper" style={{ maxHeight: 520, overflowY: "auto" }}>
            {loading ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--color-muted)" }}>Memuat katalog...</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Satuan</th>
                    <th style={{ textAlign: "right" }}>Harga</th>
                    <th>📈 Tren</th>
                    <th style={{ width: 120 }}>Pesan (Qty)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCatalog.map(h => {
                    const id = h.item.id;
                    const val = cart[id]?.qty || "";
                    const isPerishable = h.item.kategori === "perishable";
                    const namaKey = h.item.nama_item.toLowerCase();
                    const tren = trenData[namaKey];
                    return (
                      <tr key={h.id} className="catalog-row" style={{ background: cart[id] ? "rgba(99,102,241,0.04)" : "" }}>
                        <td style={{ fontWeight: 600 }}>{h.item.nama_item}</td>
                        <td>{h.item.satuan}</td>
                        <td style={{ textAlign: "right" }} className="rupiah">{formatRupiah(h.harga_jual)}</td>
                        <td>
                          {tren && tren.trend ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <TrendBadge tren={tren.trend} pct={tren.trend_pct} />
                              <button
                                className="tren-btn"
                                title="Lihat detail tren harga"
                                onClick={() => setSelectedTren(h.item.nama_item)}
                              >
                                <Sparkline data={tren.sparkline}
                                  color={TREND_CONFIG[tren.trend]?.color || "#6366f1"} />
                              </button>
                            </div>
                          ) : (
                            <span style={{ fontSize: 11, color: "var(--color-muted)" }}>
                              {loadingTren ? "..." : "—"}
                            </span>
                          )}
                        </td>
                        <td>
                          <input type="number" min="0" step="0.01" className="form-control"
                            placeholder="0" value={val}
                            onChange={e => handleQtyChange(h, e.target.value)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Cart Summary */}
        <div style={{ flex: 1 }}>

          {/* Manual Item Form */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-title" style={{ marginBottom: 12 }}>Tambah Item Manual</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input className="form-control" placeholder="Nama Item Baru"
                value={manualItem.nama_item} onChange={e => setManualItem({ ...manualItem, nama_item: e.target.value })} />
              <div style={{ display: "flex", gap: 10 }}>
                <input type="number" min="0" step="0.01" className="form-control" placeholder="Qty" style={{ flex: 1 }}
                  value={manualItem.qty} onChange={e => setManualItem({ ...manualItem, qty: e.target.value })} />
                <input className="form-control" placeholder="Satuan (pcs, kg, dll)" style={{ flex: 1 }}
                  value={manualItem.satuan} onChange={e => setManualItem({ ...manualItem, satuan: e.target.value })} />
              </div>
              <input type="number" min="0" step="1" className="form-control" placeholder="Harga Satuan"
                value={manualItem.harga_satuan} onChange={e => setManualItem({ ...manualItem, harga_satuan: e.target.value })} />
              <button className="btn btn-primary" onClick={handleAddManualItem}>+ Tambah ke PO</button>
            </div>
            <div style={{ fontSize: 11, color: "var(--color-muted)", marginTop: 8 }}>
              *Item manual akan otomatis tersimpan ke Master Item.
            </div>
          </div>

          <div className="card" style={{ position: "sticky", top: 20 }}>
            <div className="card-title" style={{ marginBottom: 16 }}>Ringkasan PO</div>

            {Object.values(cart).length === 0 ? (
              <div style={{ color: "var(--color-muted)", fontSize: 13 }}>Belum ada item dipilih.</div>
            ) : (
              <div style={{ maxHeight: 300, overflowY: "auto", marginBottom: 8 }}>
                {Object.entries(cart).map(([k, item]) => {
                  const tren = trenData[item.nama_item.toLowerCase()];
                  return (
                    <div key={k} style={{
                      display: "flex", justifyContent: "space-between",
                      borderBottom: "1px solid var(--color-border)", padding: "8px 0", fontSize: 12,
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600 }}>{item.nama_item}</div>
                        <div style={{ color: "var(--color-muted)", display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                          <button onClick={() => updateCartQty(k, item.qty - 1)} style={{ padding: "0 6px", cursor: "pointer", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 4 }}>-</button>
                          <span style={{ fontWeight: 600 }}>{item.qty}</span>
                          <button onClick={() => updateCartQty(k, item.qty + 1)} style={{ padding: "0 6px", cursor: "pointer", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 4 }}>+</button>
                          <span>{item.satuan} × {formatRupiah(item.harga_satuan)}</span>
                        </div>
                        {tren && tren.trend && (
                          <div style={{ marginTop: 4 }}>
                            <TrendBadge tren={tren.trend} pct={tren.trend_pct} />
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "space-between" }}>
                        <div style={{ fontWeight: 700 }}>{formatRupiah(item.qty * item.harga_satuan)}</div>
                        <button onClick={() => removeFromCart(k)} style={{ color: "#dc2626", background: "none", border: "none", cursor: "pointer", fontSize: 11, padding: 0, marginTop: 4 }}>Hapus</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ padding: "12px 0", borderTop: "2px solid var(--color-border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontWeight: 700 }}>Total PO</span>
                <span className="rupiah" style={{
                  fontSize: 18, fontWeight: 800,
                  color: budgetExceeded ? "#ef4444" : "var(--color-primary)"
                }}>
                  {formatRupiah(cartTotal)}
                </span>
              </div>
              {paguInfo?.jadwal_ada && (
                <div style={{ fontSize: 12, color: "var(--color-muted)" }}>
                  Sisa limit minggu ini:{" "}
                  <strong style={{ color: budgetExceeded ? "#ef4444" : "inherit" }}>
                    {formatRupiah(sisaMingguan === Infinity ? 0 : sisaMingguan)}
                  </strong>
                </div>
              )}
            </div>

            {budgetExceeded && (
              <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#dc2626", marginBottom: 12 }}>
                ⚠️ Total melebihi sisa limit mingguan. PO tetap bisa disimpan, tapi perhatikan budget.
              </div>
            )}

            <div className="form-group" style={{ marginTop: 8 }}>
              <label className="form-label">Catatan</label>
              <input className="form-control" placeholder="Opsional"
                value={form.catatan} onChange={e => setForm({ ...form, catatan: e.target.value })} />
            </div>

            <button className="btn btn-primary" style={{ width: "100%", marginTop: 12 }}
              disabled={saving || Object.values(cart).length === 0}
              onClick={handleSave}>
              {saving ? "Menyimpan..." : "✔ Simpan PO"}
            </button>
          </div>
        </div>
      </div>

      {/* Panel Detail Tren (slide-in) */}
      {selectedTren && (
        <>
          <div onClick={() => setSelectedTren(null)} style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", zIndex: 899,
          }} />
          <TrenPanel nama={selectedTren} onClose={() => setSelectedTren(null)} />
        </>
      )}
    </div>
  );
}

CreatePO.title = "Buat PO Manual";
CreatePO.subtitle = "Pesanan harian dari katalog dengan kontrol pagu";
