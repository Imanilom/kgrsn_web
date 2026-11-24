import { useCallback, useEffect, useMemo, useState } from "react";
import { rekonsiliasiKasApi } from "@/lib/api";
import { formatRupiah } from "@/components/Layout";
import WeekRangePicker from "@/components/WeekRangePicker";
import { getLocalDateString, getSundaySaturdayRange } from "@/lib/weekRange";

function formatDate(value) {
  if (!value) return "—";
  return new Date(`${value}T00:00`).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatSelisihTransfer(jumlahTransfer, totalTransaksi) {
  const difference = Math.round((Number(jumlahTransfer) - Number(totalTransaksi)) * 100) / 100;
  if (!difference) return "Nominal pas";
  return `${difference > 0 ? "Kelebihan transfer" : "Kekurangan transfer"} ${formatRupiah(Math.abs(difference))}`;
}

export default function RekonsiliasiKasPage() {
  const [mutasis, setMutasis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState({ status: "" });
  const [weekDate, setWeekDate] = useState("");
  const [selected, setSelected] = useState({});
  const [candidateSearch, setCandidateSearch] = useState({});
  const [searchedCandidates, setSearchedCandidates] = useState({});
  const period = useMemo(() => getSundaySaturdayRange(weekDate), [weekDate]);
  const handleWeekChange = (value) => {
    setLoading(true);
    setWeekDate(value);
  };

  const load = useCallback(async () => {
    if (!period) return;
    setLoading(true);
    try {
      const params = {};
      if (filter.status) params.status = filter.status;
      params.tanggal_mulai = period.start;
      params.tanggal_selesai = period.end;
      const response = await rekonsiliasiKasApi.list(params);
      setMutasis(response.data);
      setSelected(Object.fromEntries(
        response.data
          .filter(item => !item.transaksi_belanja && item.kandidat?.length)
          .map(item => [item.id, []])
      ));
    } catch (e) {
      setError(e.response?.data?.detail || "Gagal memuat mutasi kas.");
    } finally {
      setLoading(false);
    }
  }, [filter, period]);

  useEffect(() => {
    Promise.resolve().then(() => setWeekDate(getLocalDateString()));
  }, []);

  useEffect(() => {
    if (!period) return undefined;
    let active = true;
    const params = {};
    if (filter.status) params.status = filter.status;
    params.tanggal_mulai = period.start;
    params.tanggal_selesai = period.end;

    rekonsiliasiKasApi.list(params)
      .then(response => {
        if (!active) return;
        setMutasis(response.data);
        setSelected(Object.fromEntries(
          response.data
            .filter(item => !item.transaksi_belanja && item.kandidat?.length)
            .map(item => [item.id, []])
        ));
      })
      .catch(e => {
        if (active) setError(e.response?.data?.detail || "Gagal memuat mutasi kas.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [filter, period]);

  useEffect(() => {
    let active = true;
    const timers = [];
    Object.entries(candidateSearch).forEach(([mutasiId, value]) => {
      const query = value.trim();
      if (!query) return;
      timers.push(setTimeout(() => {
        rekonsiliasiKasApi.candidates(mutasiId, query)
          .then(response => {
            if (active) {
              setSearchedCandidates(previous => ({
                ...previous,
                [mutasiId]: {
                  query,
                  items: response.data,
                  allItems: [...new Map([
                    ...(previous[mutasiId]?.allItems || []),
                    ...response.data,
                  ].map(item => [item.id, item])).values()],
                },
              }));
            }
          })
          .catch(e => {
            if (active) setError(e.response?.data?.detail || "Gagal mencari transaksi belanja.");
          });
      }, 250));
    });
    return () => {
      active = false;
      timers.forEach(clearTimeout);
    };
  }, [candidateSearch]);

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
      setMessage(
        `${response.data.diimpor} mutasi diimpor; ${response.data.duplikat} duplikat dilewati; `
        + `${response.data.cocok_otomatis} transaksi dicocokkan otomatis.`
      );
      await load();
    } catch (e) {
      setError(e.response?.data?.detail || "Gagal mengimpor file mutasi.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const handleAutoMatch = async () => {
    setError("");
    setMessage("");
    try {
      const response = await rekonsiliasiKasApi.autoMatch();
      setMessage(`${response.data.cocok_otomatis} transaksi berhasil dicocokkan otomatis.`);
      await load();
    } catch (e) {
      setError(e.response?.data?.detail || "Gagal mencocokkan transaksi otomatis.");
    }
  };

  const handleMatch = async (mutasiId) => {
    const transaksiIds = selected[mutasiId] || [];
    if (!transaksiIds.length) {
      setError("Pilih setidaknya satu transaksi belanja.");
      return;
    }
    setError("");
    setMessage("");
    try {
      await rekonsiliasiKasApi.match(mutasiId, transaksiIds.map(Number));
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
          <p className="page-subtitle">Cocokkan debit dengan satu atau beberapa transaksi supplier yang sama; nominal tidak harus sama.</p>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 12 }} onClick={() => setError("")}>{error} ✕</div>}
      {message && <div className="alert alert-success" style={{ marginBottom: 12 }} onClick={() => setMessage("")}>✓ {message} ✕</div>}

      <div className="card" style={{ marginBottom: 16, padding: 18 }}>
        <label className="form-label" htmlFor="mutasi-file">Impor rekening koran (.xlsx atau .pdf)</label>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <input id="mutasi-file" type="file" accept=".xlsx,.pdf,application/pdf" onChange={handleImport} disabled={uploading} />
          <button className="btn btn-ghost" onClick={handleAutoMatch} disabled={uploading}>Cocokkan otomatis</button>
          {uploading && <span style={{ fontSize: 13, color: "var(--color-muted)" }}>Mengimpor dan membaca seluruh sheet...</span>}
        </div>
        <div style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 8 }}>
          Debit dan kredit dibaca dari semua sheet Excel atau halaman PDF berbasis teks. Pencocokan otomatis tetap memakai nominal yang sama; pencocokan manual dapat menggabungkan beberapa transaksi supplier untuk satu transfer atau menghubungkan satu transaksi ke beberapa transfer. PDF hasil scan belum didukung.
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, alignItems: "end" }}>
          <div>
            <label className="form-label">Status pencocokan</label>
            <select className="form-control" value={filter.status} onChange={e => setFilter(p => ({ ...p, status: e.target.value }))}>
              <option value="">Semua mutasi</option>
              <option value="arus_masuk">Arus kas masuk</option>
              <option value="belum_cocok">Belum dicocokkan (ada kandidat)</option>
              <option value="tidak_cocok">Tidak ada kandidat relevan</option>
              <option value="cocok">Sudah dicocokkan</option>
            </select>
          </div>
          <WeekRangePicker value={weekDate} onChange={handleWeekChange} />
          <button className="btn btn-ghost" onClick={() => setFilter({ status: "" })}>Reset status</button>
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <div className="spinner" style={{ width: 32, height: 32, margin: "auto" }} />
        </div>
      ) : mutasis.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 40, color: "var(--color-muted)" }}>
          Belum ada mutasi pada filter ini. Unggah rekening koran XLSX atau PDF untuk mulai mencocokkan transaksi.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {mutasis.map(mutasi => {
            const matchedTransactions = mutasi.transaksi_belanja_list || (mutasi.transaksi_belanja ? [mutasi.transaksi_belanja] : []);
            const matched = matchedTransactions.length > 0;
            const isCredit = mutasi.jenis === "kredit";
            const hasCandidates = (mutasi.kandidat || []).length > 0;
            const selectedIds = selected[mutasi.id] || [];
            const search = (candidateSearch[mutasi.id] || "").trim();
            const searchResult = searchedCandidates[mutasi.id];
            const visibleCandidates = search && searchResult?.query === search
              ? searchResult.items
              : (mutasi.kandidat || []).filter(item =>
                !search || `${item.nomor_transaksi} ${item.supplier_nama || ""}`.toLocaleLowerCase("id").includes(search.toLocaleLowerCase("id"))
              );
            const candidatePool = [
              ...(mutasi.kandidat || []),
              ...(searchResult?.allItems || []),
            ];
            const selectedCandidates = [...new Map(candidatePool.map(item => [item.id, item])).values()]
              .filter(item => selectedIds.includes(String(item.id)));
            const selectedCandidate = selectedCandidates[0];
            const selectedTotal = selectedCandidates.reduce((total, item) => total + Number(item.total || 0), 0);
            const statusColor = matched || isCredit ? "#047857" : hasCandidates ? "#b45309" : "#b91c1c";
            return (
              <div key={mutasi.id} className="card" style={{ padding: 16, borderLeft: `4px solid ${matched || isCredit ? "#10b981" : hasCandidates ? "#f59e0b" : "#ef4444"}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 360px", minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
                      <strong>{formatDate(mutasi.tanggal)}{mutasi.waktu ? ` • ${mutasi.waktu.slice(11, 19)}` : ""}</strong>
                      <span style={{
                        borderRadius: 99, padding: "2px 9px", fontSize: 11, fontWeight: 700,
                        color: statusColor,
                        background: matched || isCredit ? "rgba(16,185,129,0.1)" : hasCandidates ? "rgba(245,158,11,0.12)" : "rgba(239,68,68,0.1)",
                      }}>
                        {matched ? "Cocok" : isCredit ? "Arus kas masuk" : hasCandidates ? "Belum dicocokkan" : "Tidak ada kandidat cocok"}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, whiteSpace: "pre-line", color: "var(--color-text)" }}>{mutasi.deskripsi || "—"}</div>
                    <div style={{ fontSize: 11, color: "var(--color-muted)", marginTop: 5 }}>
                      {mutasi.sumber_sheet || "Rekening koran"}{mutasi.saldo != null ? ` • Saldo ${formatRupiah(mutasi.saldo)}` : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontWeight: 900, fontSize: 18, color: isCredit ? "#047857" : "#dc2626" }}>
                      {isCredit ? "+" : "−"}{formatRupiah(mutasi.jumlah)}
                    </div>
                  </div>
                </div>

                {matched ? (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--color-border)" }}>
                    <div style={{ fontSize: 13 }}>
                      {matchedTransactions.map((transaction, index) => (
                        <div key={transaction.id}>
                          <strong>{transaction.nomor_transaksi}</strong> • {formatDate(transaction.tanggal_belanja)} • {transaction.supplier_nama || "Tanpa supplier"} • {formatRupiah(transaction.total)}
                          {index === matchedTransactions.length - 1 && <div style={{ marginTop: 5, color: "var(--color-muted)" }}>Total transaksi {formatRupiah(matchedTransactions.reduce((total, item) => total + Number(item.total || 0), 0))} • {formatSelisihTransfer(mutasi.jumlah, matchedTransactions.reduce((total, item) => total + Number(item.total || 0), 0))}</div>}
                        </div>
                      ))}
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => handleUnmatch(mutasi.id)}>Batalkan pencocokan</button>
                  </div>
                ) : isCredit ? null : (
                  <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap", marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--color-border)" }}>
                    <div style={{ flex: "1 1 320px" }}>
                      <label className="form-label">Cari dan pilih transaksi belanja (bisa lebih dari satu)</label>
                      <input
                        className="form-control"
                        type="search"
                        placeholder="Cari nomor transaksi atau supplier..."
                        value={candidateSearch[mutasi.id] || ""}
                        onChange={e => setCandidateSearch(p => ({ ...p, [mutasi.id]: e.target.value }))}
                        style={{ marginBottom: 8 }}
                      />
                      <div style={{ maxHeight: 230, overflowY: "auto", border: "1px solid var(--color-border)", borderRadius: 8, padding: "4px 10px" }}>
                        {visibleCandidates.map(kandidat => (
                          <label key={kandidat.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 0", borderBottom: "1px solid var(--color-border)", cursor: "pointer", fontSize: 12 }}>
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(String(kandidat.id))}
                              onChange={e => setSelected(p => ({
                                ...p,
                                [mutasi.id]: e.target.checked
                                  ? [...(p[mutasi.id] || []), String(kandidat.id)]
                                  : (p[mutasi.id] || []).filter(id => id !== String(kandidat.id)),
                              }))}
                            />
                            <span>
                              <strong>{kandidat.nomor_transaksi}</strong> • {formatDate(kandidat.tanggal_belanja)} • {kandidat.supplier_nama || "Tanpa supplier"} • {formatRupiah(kandidat.total)}
                              {" "}({formatSelisihTransfer(mutasi.jumlah, kandidat.total)})
                            </span>
                          </label>
                        ))}
                        {!visibleCandidates.length && <div style={{ padding: 10, fontSize: 12, color: "var(--color-muted)" }}>Tidak ada transaksi yang cocok dengan pencarian.</div>}
                      </div>
                      {selectedCandidates.length > 0 && (
                        <div style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 6 }}>
                          {selectedCandidates.length} transaksi dipilih • Total {formatRupiah(selectedTotal)} • {formatSelisihTransfer(mutasi.jumlah, selectedTotal)}.
                        </div>
                      )}
                      {selectedCandidate && (
                        <div style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 5 }}>
                          Nilai transaksi {formatRupiah(selectedCandidate.total)}; kemiripan item {selectedCandidate.kemiripan_item}% dan lokasi PO {selectedCandidate.kemiripan_lokasi_po}%; kemiripan nama supplier {selectedCandidate.kemiripan_nama}%; nomor transaksi {selectedCandidate.nomor_referensi_cocok ? "ditemukan" : "tidak ditemukan"} dan nomor PO {selectedCandidate.nomor_po_cocok ? "ditemukan" : "tidak ditemukan"} di deskripsi mutasi.
                          {selectedCandidate.item_terkait?.length > 0 && (
                            <> Item/PO terkait: {selectedCandidate.item_terkait.slice(0, 3).map(item => `${item.nama_item}${item.nomor_po ? ` (${item.nomor_po})` : ""}${item.dapur ? ` - ${item.dapur}` : ""}`).join("; ")}.</>
                          )}
                              {selectedCandidate.item_detail?.length > 0 && (
                                <div style={{ marginTop: 6 }}>
                                  Rincian item:
                                  {selectedCandidate.item_detail.map((item, index) => (
                                    <div key={index}>
                                      • {item.nama_item}: {item.qty} {item.satuan || ""} × {formatRupiah(item.harga_satuan)} = {formatRupiah(item.subtotal)}
                                      {item.alokasi?.length > 0
                                        ? ` (PO: ${item.alokasi.map(a => `${a.nomor_po || "-"} ${a.tanggal_po ? `- ${formatDate(a.tanggal_po)}` : ""}`).join("; ")})`
                                        : ""}
                                    </div>
                                  ))}
                                </div>
                              )}
                              {selectedCandidate.nominal_per_po?.length > 0 && (
                                <div style={{ marginTop: 6 }}>
                                  Nominal per PO: {selectedCandidate.nominal_per_po.map(po => `${po.nomor_po || "-"} (${po.tanggal_po ? formatDate(po.tanggal_po) : "-"}): ${formatRupiah(po.subtotal)}`).join("; ")}.
                                </div>
                              )}
                          {" "}Pastikan item dan nominal sesuai sebelum mencocokkan.
                        </div>
                      )}
                      {!hasCandidates && !search && (
                        <div style={{ fontSize: 12, color: "#b91c1c", marginTop: 5 }}>Belum ada kandidat otomatis. Cari transaksi berdasarkan supplier, nomor transaksi, atau nama item.</div>
                      )}
                    </div>
                    <button className="btn btn-primary" disabled={!selectedIds.length} onClick={() => handleMatch(mutasi.id)}>Cocokkan</button>
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
