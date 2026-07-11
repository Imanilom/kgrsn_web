import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
});

// Attach token ke setiap request
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("access_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 - redirect ke login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("access_token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export default api;

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (username, password) => api.post("/auth/login", { username, password }),
  me: () => api.get("/auth/me"),
  getUsers: () => api.get("/auth/users"),
  createUser: (data) => api.post("/auth/users", data),
  updateUser: (id, data) => api.put(`/auth/users/${id}`, data),
  deleteUser: (id) => api.delete(`/auth/users/${id}`),
};

// ─── Dapur ────────────────────────────────────────────────────────────────────
export const dapurApi = {
  list: (params) => api.get("/dapur/", { params }),
  get: (id) => api.get(`/dapur/${id}`),
  create: (data) => api.post("/dapur/", data),
  update: (id, data) => api.put(`/dapur/${id}`, data),
  delete: (id) => api.delete(`/dapur/${id}`),
};

// ─── Master Item ──────────────────────────────────────────────────────────────
export const itemApi = {
  list: (params) => api.get("/master/items", { params }),
  get: (id) => api.get(`/master/items/${id}`),
  create: (data) => api.post("/master/items", data),
  update: (id, data) => api.put(`/master/items/${id}`, data),
};

// ─── Master Harga ─────────────────────────────────────────────────────────────
export const hargaApi = {
  list: (params) => api.get("/master/harga", { params }),
  current: () => api.get("/master/harga/current"),
  create: (data) => api.post("/master/harga", data),
};

// ─── PO ───────────────────────────────────────────────────────────────────────
export const poApi = {
  list: (params) => api.get("/po/", { params }),
  get: (id) => api.get(`/po/${id}`),
  create: (data) => api.post("/po/", data),
  update: (id, data) => api.put(`/po/${id}`, data),
  approve: (id) => api.post(`/po/${id}/approve`),
  delete: (id) => api.delete(`/po/${id}`),
  verifyJadwal: (dapurId, tanggalPo) => api.get(`/po/verify-jadwal/${dapurId}/${tanggalPo}`),
  addDetail: (poId, data) => api.post(`/po/${poId}/details`, data),
  updateDetail: (detailId, data) => api.put(`/po/details/${detailId}`, data),
  deleteDetail: (detailId) => api.delete(`/po/details/${detailId}`),
};

// ─── Invoice ──────────────────────────────────────────────────────────────────
export const invoiceApi = {
  list: (params) => api.get("/invoice/", { params }),
  get: (id) => api.get(`/invoice/${id}`),
  generate: (poId, data) => api.post(`/invoice/generate/${poId}`, data),
  update: (id, data) => api.put(`/invoice/${id}`, data),
  markPaid: (id) => api.put(`/invoice/${id}/paid`),
  download: (id) => api.get(`/invoice/${id}/download`, { responseType: "blob" }),
  downloadUrl: (id) => `${API_BASE}/invoice/${id}/download`,
  margin: (id) => api.get(`/invoice/${id}/margin`),
};

// ─── Surat Jalan ──────────────────────────────────────────────────────────────
export const sjApi = {
  list: (params) => api.get("/surat-jalan/", { params }),
  get: (id) => api.get(`/surat-jalan/${id}`),
  generate: (poId, data) => api.post(`/surat-jalan/generate/${poId}`, data),
  markReceived: (id) => api.put(`/surat-jalan/${id}/received`),
  download: (id) => api.get(`/surat-jalan/${id}/download`, { responseType: "blob" }),
  downloadUrl: (id) => `${API_BASE}/surat-jalan/${id}/download`,
};

// ─── RAB ──────────────────────────────────────────────────────────────────────
export const rabApi = {
  list: (params) => api.get("/rab/", { params }),
  get: (id) => api.get(`/rab/${id}`),
  create: (data) => api.post("/rab/", data),
};

// ─── Dashboard ────────────────────────────────────────────────────────────────
export const dashboardApi = {
  summary: () => api.get("/dashboard/summary"),
  poPerDapur: () => api.get("/dashboard/po-per-dapur"),
  monthlyTrend: (tahun) => api.get("/dashboard/monthly-trend", { params: { tahun } }),
};

// ─── Jadwal PM & Pagu ─────────────────────────────────────────────────────────
export const jadwalPMApi = {
  list: (params) => api.get("/jadwal-pm/", { params }),
  create: (data) => api.post("/jadwal-pm/", data),
  bulk: (data) => api.post("/jadwal-pm/bulk", data),
  update: (id, data) => api.put(`/jadwal-pm/${id}`, data),
  delete: (id) => api.delete(`/jadwal-pm/${id}`),
  paguCheck: (dapur_id, tanggal) =>
    api.get("/jadwal-pm/pagu-check", { params: { dapur_id, tanggal } }),
  weeklySummary: (tanggal, dapur_id) =>
    api.get("/jadwal-pm/weekly-summary", { params: { tanggal, dapur_id } }),
};

// ─── PO Realisasi ─────────────────────────────────────────────────────────────
export const realisasiApi = {
  list: (params) => api.get("/realisasi/", { params }),
  get: (id) => api.get(`/realisasi/${id}`),
  create: (data) => api.post("/realisasi/", data),
  update: (id, data) => api.put(`/realisasi/${id}`, data),
  updateDetail: (realisasiId, detailId, data) =>
    api.put(`/realisasi/${realisasiId}/detail/${detailId}`, data),
  submit: (id) => api.post(`/realisasi/${id}/submit`),
  approve: (id) => api.post(`/realisasi/${id}/approve`),
  reject: (id) => api.post(`/realisasi/${id}/reject`),
  generateInvoice: (id, data) => api.post(`/realisasi/${id}/generate-invoice`, data),
};

// ─── Rekap Mingguan ───────────────────────────────────────────────────────────
export const rekapApi = {
  list: () => api.get("/rekap/"),
  get: (id) => api.get(`/rekap/${id}`),
  preview: (tanggal) => api.get("/rekap/preview/minggu", { params: { tanggal } }),
  create: (data) => api.post("/rekap/", data),
  generateInvoice: (id, data) => api.post(`/rekap/${id}/generate-invoice`, data),
  downloadInvoiceUrl: (id) => `${API_BASE}/rekap/${id}/download-invoice`,
  delete: (id) => api.delete(`/rekap/${id}`),
};

// ─── Supplier ─────────────────────────────────────────────────────────────────
export const supplierApi = {
  list: (params) => api.get("/supplier/", { params }),
  get: (id) => api.get(`/supplier/${id}`),
  create: (data) => api.post("/supplier/", data),
  update: (id, data) => api.put(`/supplier/${id}`, data),
  delete: (id) => api.delete(`/supplier/${id}`),
  importExcel: (formData) => api.post("/supplier/import-excel", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  }),
};

// ─── Hutang Supplier ──────────────────────────────────────────────────────────
export const hutangApi = {
  list: (params) => api.get("/hutang/", { params }),
  get: (id) => api.get(`/hutang/${id}`),
  create: (data) => api.post("/hutang/", data),
  bayar: (id, data) => api.post(`/hutang/${id}/bayar`, data),
  summary: () => api.get("/hutang/summary"),
  delete: (id) => api.delete(`/hutang/${id}`),
};

// ─── Piutang Dapur ────────────────────────────────────────────────────────────
export const piutangApi = {
  list: (params) => api.get("/piutang/", { params }),
  create: (data) => api.post("/piutang/", data),
  bayar: (id, data) => api.post(`/piutang/${id}/bayar`, data),
  summary: () => api.get("/piutang/summary"),
};

// ─── Operasional Cost ─────────────────────────────────────────────────────────
export const operasionalApi = {
  list: (params) => api.get("/operasional/", { params }),
  create: (data) => api.post("/operasional/", data),
  update: (id, data) => api.put(`/operasional/${id}`, data),
  delete: (id) => api.delete(`/operasional/${id}`),
};

// ─── Rekap Pembelanjaan ───────────────────────────────────────────────────────
export const rekapPembeljanApi = {
  list: (params) => api.get("/rekap-pembelanjaan/", { params }),
  get: (id) => api.get(`/rekap-pembelanjaan/${id}`),
  createOtomatis: (data, params) => api.post("/rekap-pembelanjaan/otomatis", data, { params }),
  createManual: (data) => api.post("/rekap-pembelanjaan/manual", data),
  addDetail: (id, data) => api.post(`/rekap-pembelanjaan/${id}/details`, data),
  catatHutang: (id, params) => api.post(`/rekap-pembelanjaan/${id}/catat-hutang`, null, { params }),
  downloadUrl: (id) => `${API_BASE}/rekap-pembelanjaan/${id}/pdf`,
  delete: (id) => api.delete(`/rekap-pembelanjaan/${id}`),
};

// ─── Laporan Keuangan ─────────────────────────────────────────────────────────
export const laporanApi = {
  pembelanjaan: (bulan, tahun) =>
    api.get("/laporan/pembelanjaan", { params: { periode_bulan: bulan, periode_tahun: tahun } }),
  margin: (bulan, tahun) =>
    api.get("/laporan/margin", { params: { periode_bulan: bulan, periode_tahun: tahun } }),
  operasional: (bulan, tahun) =>
    api.get("/laporan/operasional", { params: { periode_bulan: bulan, periode_tahun: tahun } }),
  hutangPiutang: () => api.get("/laporan/hutang-piutang"),
  labaRugi: (bulan, tahun) =>
    api.get("/laporan/laba-rugi", { params: { periode_bulan: bulan, periode_tahun: tahun } }),
  ringkasan: (tahun) =>
    api.get("/laporan/ringkasan", { params: { tahun } }),
};

// ─── Tren Harga & Analitik ────────────────────────────────────────────────────
export const trenHargaApi = {
  mini:          (nama)   => api.get(`/tren-harga/item/${encodeURIComponent(nama)}/mini`),
  detail:        (nama)   => api.get(`/tren-harga/item/${encodeURIComponent(nama)}`),
  batch:         (names)  => api.post("/tren-harga/batch", { items: names }),
  dashboard:     ()       => api.get("/tren-harga/dashboard"),
  items:         ()       => api.get("/tren-harga/items"),
  het:           (nama)   => api.get(`/tren-harga/het/${encodeURIComponent(nama)}`),
  importExcel:   ()       => api.post("/tren-harga/import-excel"),
  importUpload:  (formData) => api.post("/tren-harga/import-excel-upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  }),
  forecast:      ()       => api.get("/tren-harga/forecast"),
};

