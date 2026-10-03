import { useCallback, useEffect, useState } from "react";
import { rekonsiliasiKasApi } from "@/lib/api";
import { formatRupiah } from "@/components/Layout";

function formatDate(value) {
  if (!value) return "—";
  return new Date(`${value}T00:00`).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function RekonsiliasiKasPage() {
  const [mutasis, setMutasis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState({ status: "belum_cocok", tanggal_mulai: "", tanggal_selesai: "" });
  const [selected, setSelected] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filter.status) params.status = filter.status;
      if (filter.tanggal_mulai) params.tanggal_mulai = filter.tanggal_mulai;
      if (filter.tanggal_selesai) params.tanggal_selesai = filter.tanggal_selesai;
      const response = await rekonsiliasiKasApi.list(params);
      setMutasis(response.data);
      setSelected(Object.fromEntries(
        response.data
          .filter(item => !item.transaksi_belanja && item.kandidat?.length)
          .map(item => [item.id, String(item.kandidat[0].id)])
      ));
    } catch (e) {
      setError(e.response?.data?.detail || "Gagal memuat mutasi kas.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    let active = true;
    const params = {};
    if (filter.status) params.status = filter.status;
    if (filter.tanggal_mulai) params.tanggal_mulai = filter.tanggal_mulai;
    if (filter.tanggal_selesai) params.tanggal_selesai = filter.tanggal_selesai;

    rekonsiliasiKasApi.list(params)
      .then(response => {
        if (!active) return;
        setMutasis(response.data);
        setSelected(Object.fromEntries(
          response.data
            .filter(item => !item.transaksi_belanja && item.kandidat?.length)
            .map(item => [item.id, String(item.kandidat[0].id)])
        ));
      })
      .catch(e => {
        if (active) setError(e.response?.data?.detail || "Gagal memuat mutasi kas.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [filter]);

  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await rekonsiliasiKasApi.import(formData);
      setMessage(`${response.data.diimpor} mutasi diimpor; ${response.data.duplikat} duplikat dilewati.`);
      await load();
    } catch (e) {
      setError(e.response?.data?.detail || "Gagal mengimpor file mutasi.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const handleMatch = async (mutasiId) => {
    const transaksiId = selected[mutasiId];
    if (!transaksiId) {
      setError("Pilih transaksi belanja terlebih dahulu.");
      return;
    }
    setError("");
    setMessage("");
    try {
      await rekonsiliasiKasApi.match(mutasiId, Number(transaksiId));
      setMessage("Mutasi kas berhasil dicocokkan dengan transaksi belanja.");
      await load();
    } catch (e) {
      setError(e.response?.data?.detail || "Gagal mencocokkan transaksi.");
    }
  };

  const handleUnmatch = async (mutasiId) => {
    setError("");
    setMessage("");
    try {
      await rekonsiliasiKasApi.unmatch(mutasiId);
      setMessage("Pencocokan transaksi dibatalkan.");
      await load();
    } catch (e) {
      setError(e.response?.data?.detail || "Gagal membatalkan pencocokan.");
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">🏦 Cocokkan Mutasi Kas</h1>
          <p className="page-subtitle">Impor rekening koran XLSX, lalu cocokkan debit dengan transaksi belanja.</p>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 12 }} onClick={() => setError("")}>{error} ✕</div>}
      {message && <div className="alert alert-success" style={{ marginBottom: 12 }} onClick={() => setMessage("")}>✓ {message} ✕</div>}

      <div className="card" style={{ marginBottom: 16, padding: 18 }}>
        <label className="form-label" htmlFor="mutasi-xlsx">Impor rekening koran (.xlsx)</label>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <input id="mutasi-xlsx" type="file" accept=".xlsx" onChange={handleImport} disabled={uploading} />
          {uploading && <span style={{ fontSize: 13, color: "var(--color-muted)" }}>Mengimpor dan membaca seluruh sheet...</span>}
        </div>
        <div style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 8 }}>
          Mutasi debit dibaca dari semua sheet. File yang sama dapat diimpor ulang tanpa membuat duplikat.
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, alignItems: "end" }}>
          <div>
            <label className="form-label">Status pencocokan</label>
            <select className="form-control" value={filter.status} onChange={e => setFilter(p => ({ ...p, status: e.target.value }))}>
              <option value="">Semua mutasi</option>
              <option value="belum_cocok">Belum dicocokkan</option>
              <option value="cocok">Sudah dicocokkan</option>
            </select>
          </div>
          <div>
            <label className="form-label">Dari tanggal mutasi</label>
            <input type="date" className="form-control" value={filter.tanggal_mulai} onChange={e => setFilter(p => ({ ...p, tanggal_mulai: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">Sampai tanggal mutasi</label>
            <input type="date" className="form-control" value={filter.tanggal_selesai} onChange={e => setFilter(p => ({ ...p, tanggal_selesai: e.target.value }))} />
          </div>
          <button className="btn btn-ghost" onClick={() => setFilter({ status: "belum_cocok", tanggal_mulai: "", tanggal_selesai: "" })}>Reset</button>
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <div className="spinner" style={{ width: 32, height: 32, margin: "auto" }} />
        </div>
      ) : mutasis.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 40, color: "var(--color-muted)" }}>
          Belum ada mutasi pada filter ini. Unggah rekening koran XLSX untuk mulai mencocokkan transaksi.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {mutasis.map(mutasi => {
            const matched = mutasi.transaksi_belanja;
            return (
              <div key={mutasi.id} className="card" style={{ padding: 16, borderLeft: `4px solid ${matched ? "#10b981" : "#f59e0b"}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 360px", minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
                      <strong>{formatDate(mutasi.tanggal)}{mutasi.waktu ? ` • ${mutasi.waktu.slice(11, 19)}` : ""}</strong>
                      <span style={{
                        borderRadius: 99, padding: "2px 9px", fontSize: 11, fontWeight: 700,
                        color: matched ? "#047857" : "#b45309",
                        background: matched ? "rgba(16,185,129,0.1)" : "rgba(245,158,11,0.12)",
                      }}>
                        {matched ? "Sudah cocok" : "Belum cocok"}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, whiteSpace: "pre-line", color: "var(--color-text)" }}>{mutasi.deskripsi || "—"}</div>
                    <div style={{ fontSize: 11, color: "var(--color-muted)", marginTop: 5 }}>
                      {mutasi.sumber_sheet || "Rekening koran"}{mutasi.saldo != null ? ` • Saldo ${formatRupiah(mutasi.saldo)}` : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontWeight: 900, fontSize: 18, color: "#dc2626" }}>{formatRupiah(mutasi.jumlah)}</div>
                  </div>
                </div>

                {matched ? (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--color-border)" }}>
                    <div style={{ fontSize: 13 }}>
                      <strong>{matched.nomor_transaksi}</strong> • {formatDate(matched.tanggal_belanja)} • {matched.supplier_nama || "Tanpa supplier"}
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => handleUnmatch(mutasi.id)}>Batalkan pencocokan</button>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap", marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--color-border)" }}>
                    <div style={{ flex: "1 1 320px" }}>
                      <label className="form-label">Kandidat transaksi dengan nominal sama</label>
                      <select
                        className="form-control"
                        value={selected[mutasi.id] || ""}
                        onChange={e => setSelected(p => ({ ...p, [mutasi.id]: e.target.value }))}
                      >
                        <option value="">Pilih transaksi belanja</option>
                        {mutasi.kandidat.map(kandidat => (
                          <option key={kandidat.id} value={kandidat.id}>
                            {kandidat.nomor_transaksi} • {formatDate(kandidat.tanggal_belanja)} • {kandidat.supplier_nama || "Tanpa supplier"} • {formatRupiah(kandidat.total)}
                          </option>
                        ))}
                      </select>
                      {!mutasi.kandidat.length && (
                        <div style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 5 }}>Tidak ada transaksi belanja dengan nominal yang sama.</div>
                      )}
                    </div>
                    <button className="btn btn-primary" disabled={!selected[mutasi.id]} onClick={() => handleMatch(mutasi.id)}>Cocokkan</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
