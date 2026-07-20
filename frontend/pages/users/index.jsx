import { useEffect, useState } from "react";
import { authApi, dapurApi } from "@/lib/api";
import { formatDate } from "@/components/Layout";

const ROLE_OPTIONS = [
  { value: "akuntan", label: "Akuntan", desc: "Buat PO & Realisasi, terima invoice" },
  { value: "operator", label: "Operator (Legacy)", desc: "Sama dengan akuntan (role lama)" },
  { value: "finance", label: "Finance", desc: "Kelola invoice, RAB, approve realisasi" },
  { value: "admin", label: "Admin", desc: "Akses penuh kecuali super admin" },
  { value: "super_admin", label: "Super Admin", desc: "Akses penuh sistem" },
];

const ROLE_COLOR = {
  akuntan: "#6366f1",
  operator: "#64748b",
  finance: "#0ea5e9",
  admin: "#f59e0b",
  super_admin: "#ef4444",
};

const EMPTY_FORM = {
  username: "", email: "", full_name: "", password: "",
  role: "akuntan", dapur_id: "", is_active: true,
  rekening: "", nama_bank: "", nama_rekening: "",
};

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [dapur, setDapur] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editData, setEditData] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [currentUser, setCurrentUser] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const uRes = await authApi.getUsers();
      setUsers(uRes.data);
    } catch (err) {
      console.error("Gagal load users:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadDapur = async () => {
    try {
      const dRes = await dapurApi.list({ is_active: true });
      setDapur(dRes.data);
    } catch (err) {
      console.error("Gagal load dapur:", err);
    }
  };

  useEffect(() => {
    try { setCurrentUser(JSON.parse(localStorage.getItem("user"))); } catch {}
    load();
    loadDapur();
  }, []);

  const openCreate = () => {
    setEditData(null);
    setForm(EMPTY_FORM);
    setError("");
    setShowModal(true);
  };

  const openEdit = (u) => {
    setEditData(u);
    setForm({
      username: u.username,
      email: u.email || "",
      full_name: u.full_name || "",
      password: "",
      role: u.role,
      dapur_id: u.dapur_id || "",
      is_active: u.is_active,
      rekening: u.rekening || "",
      nama_bank: u.nama_bank || "",
      nama_rekening: u.nama_rekening || "",
    });
    setError("");
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!editData && (!form.username || !form.password)) {
      setError("Username dan password wajib diisi"); return;
    }
    setSaving(true); setError("");
    try {
      if (editData) {
        const payload = {
          email: form.email || null,
          full_name: form.full_name || null,
          role: form.role,
          dapur_id: form.dapur_id ? parseInt(form.dapur_id) : null,
          is_active: form.is_active,
          rekening: form.rekening || null,
          nama_bank: form.nama_bank || null,
          nama_rekening: form.nama_rekening || null,
        };
        if (form.password) payload.password = form.password;
        await authApi.updateUser(editData.id, payload);
      } else {
        await authApi.createUser({
          username: form.username,
          email: form.email || null,
          full_name: form.full_name || null,
          password: form.password,
          role: form.role,
          dapur_id: form.dapur_id ? parseInt(form.dapur_id) : null,
          rekening: form.rekening || null,
          nama_bank: form.nama_bank || null,
          nama_rekening: form.nama_rekening || null,
        });
      }
      setShowModal(false);
      setSuccess(editData ? "✅ User berhasil diupdate!" : "✅ User berhasil dibuat!");
      load();
    } catch (err) {
      setError(err.response?.data?.detail || "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (u) => {
    if (!confirm(`${u.is_active ? "Nonaktifkan" : "Aktifkan"} user "${u.username}"?`)) return;
    try {
      await authApi.updateUser(u.id, { is_active: !u.is_active });
      load();
    } catch (err) {
      alert(err.response?.data?.detail || "Gagal");
    }
  };

  const filtered = search
    ? users.filter(u =>
        u.username.toLowerCase().includes(search.toLowerCase()) ||
        u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
        u.role.toLowerCase().includes(search.toLowerCase())
      )
    : users;

  const getDapurName = (id) => dapur.find(d => d.id === id)?.nama || "-";

  const selectedRole = ROLE_OPTIONS.find(r => r.value === form.role);
  const needsDapur = ["akuntan", "operator"].includes(form.role);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Manajemen User</h1>
          <p className="page-subtitle">{users.length} user terdaftar · Kelola akun & role</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ Tambah User</button>
      </div>

      {success && (
        <div className="alert alert-success" style={{ marginBottom: 16 }} onClick={() => setSuccess("")}>
          {success}
        </div>
      )}

      {/* Role Legend */}
      <div className="card" style={{ marginBottom: 20, padding: 16 }}>
        <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 10, fontWeight: 600, textTransform: "uppercase" }}>
          Panduan Role
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {ROLE_OPTIONS.map(r => (
            <div key={r.value} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "6px 12px", borderRadius: 20,
              background: ROLE_COLOR[r.value] + "15",
              border: `1px solid ${ROLE_COLOR[r.value]}30`,
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: "50%",
                background: ROLE_COLOR[r.value], flexShrink: 0,
              }} />
              <span style={{ fontWeight: 700, fontSize: 12, color: ROLE_COLOR[r.value] }}>{r.label}</span>
              <span style={{ fontSize: 11, color: "var(--color-muted)" }}>— {r.desc}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="filter-bar">
          <div className="search-box">
            <span className="search-box-icon">🔍</span>
            <input
              placeholder="Cari username, nama, atau role..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="loading-overlay">
            <div className="spinner" style={{ width: 32, height: 32 }}></div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">👥</div>
            <div className="empty-state-title">Tidak ada user ditemukan</div>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={openCreate}>
              + Tambah User Pertama
            </button>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Dapur</th>
                  <th>Status</th>
                  <th>Dibuat</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => (
                  <tr key={u.id} style={{ opacity: u.is_active ? 1 : 0.6 }}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: "50%",
                          background: ROLE_COLOR[u.role] + "20",
                          border: `2px solid ${ROLE_COLOR[u.role]}40`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontWeight: 800, fontSize: 14, color: ROLE_COLOR[u.role],
                          flexShrink: 0,
                        }}>
                          {(u.full_name || u.username).slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{u.full_name || u.username}</div>
                          {u.email && <div style={{ fontSize: 11, color: "var(--color-muted)" }}>{u.email}</div>}
                        </div>
                      </div>
                    </td>
                    <td>
                      <code style={{
                        background: "var(--color-bg)", border: "1px solid var(--color-border)",
                        padding: "2px 8px", borderRadius: 6, fontSize: 12,
                      }}>
                        {u.username}
                      </code>
                    </td>
                    <td>
                      <span style={{
                        background: ROLE_COLOR[u.role] + "15",
                        color: ROLE_COLOR[u.role],
                        border: `1px solid ${ROLE_COLOR[u.role]}30`,
                        borderRadius: 20, padding: "3px 10px",
                        fontWeight: 700, fontSize: 12,
                      }}>
                        {ROLE_OPTIONS.find(r => r.value === u.role)?.label || u.role}
                      </span>
                    </td>
                    <td>
                      {u.dapur_id ? (
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{getDapurName(u.dapur_id)}</span>
                      ) : (
                        <span style={{ color: "var(--color-muted)", fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge badge-${u.is_active ? "approved" : "cancelled"}`}>
                        {u.is_active ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: "var(--color-muted)" }}>
                      {formatDate(u.created_at)}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(u)}
                          disabled={u.id === currentUser?.id && u.role === "super_admin" && users.filter(x => x.role === "super_admin").length <= 1}>
                          ✏️ Edit
                        </button>
                        {u.id !== currentUser?.id && (
                          <button
                            className={`btn btn-sm ${u.is_active ? "btn-ghost" : "btn-success"}`}
                            style={{ color: u.is_active ? "var(--color-danger)" : undefined }}
                            onClick={() => handleDeactivate(u)}
                          >
                            {u.is_active ? "🔒 Nonaktif" : "✅ Aktifkan"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Create/Edit */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <div className="modal-title">
                {editData ? `✏️ Edit User: ${editData.username}` : "➕ Tambah User Baru"}
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-error">{error}</div>}

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Username *</label>
                  <input className="form-control" placeholder="contoh: akuntan_dapur1"
                    value={form.username}
                    onChange={e => setForm({ ...form, username: e.target.value })}
                    disabled={!!editData}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Nama Lengkap</label>
                  <input className="form-control" placeholder="Nama lengkap user"
                    value={form.full_name}
                    onChange={e => setForm({ ...form, full_name: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Email</label>
                <input className="form-control" type="email" placeholder="email@example.com"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  Password {editData ? "(kosongkan jika tidak diubah)" : "*"}
                </label>
                <input className="form-control" type="password"
                  placeholder={editData ? "Kosongkan untuk tidak mengubah password" : "Minimal 6 karakter"}
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Role *</label>
                <select className="form-control" value={form.role}
                  onChange={e => setForm({ ...form, role: e.target.value, dapur_id: "" })}>
                  {ROLE_OPTIONS.map(r => (
                    <option key={r.value} value={r.value}>
                      {r.label} — {r.desc}
                    </option>
                  ))}
                </select>
                {selectedRole && (
                  <div style={{
                    marginTop: 6, padding: "8px 12px", borderRadius: 8, fontSize: 12,
                    background: ROLE_COLOR[form.role] + "10",
                    border: `1px solid ${ROLE_COLOR[form.role]}30`,
                    color: ROLE_COLOR[form.role],
                  }}>
                    💡 {selectedRole.desc}
                    {needsDapur && " · Wajib pilih dapur"}
                  </div>
                )}
              </div>

              {/* Dapur selector untuk akuntan/operator */}
              <div className="form-group">
                <label className="form-label">
                  Dapur {needsDapur ? "*" : "(Opsional)"}
                </label>
                <select className="form-control" value={form.dapur_id}
                  onChange={e => setForm({ ...form, dapur_id: e.target.value })}>
                  <option value="">— Tidak terikat dapur —</option>
                  {dapur.map(d => (
                    <option key={d.id} value={d.id}>{d.nama} ({d.kode})</option>
                  ))}
                </select>
                {needsDapur && !form.dapur_id && (
                  <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 4 }}>
                    ⚠️ Akuntan tanpa dapur tidak bisa membuat PO
                  </div>
                )}
              </div>

              {/* Rekening Relawan Form */}
              <div style={{ background: "#f8fafc", borderRadius: 8, padding: 12, border: "1px solid var(--color-border)", marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-muted)", textTransform: "uppercase", marginBottom: 8 }}>
                  💳 Informasi Rekening Transfer Relawan
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Nama Bank</label>
                    <input className="form-control" placeholder="mis: BCA, Mandiri..."
                      value={form.nama_bank || ""}
                      onChange={e => setForm({ ...form, nama_bank: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">No. Rekening</label>
                    <input className="form-control" placeholder="No. rekening..."
                      value={form.rekening || ""}
                      onChange={e => setForm({ ...form, rekening: e.target.value })}
                    />
                  </div>
                  <div className="form-group" style={{ gridColumn: "span 2" }}>
                    <label className="form-label">Nama Pemilik Rekening</label>
                    <input className="form-control" placeholder="Nama pemilik rekening..."
                      value={form.nama_rekening || ""}
                      onChange={e => setForm({ ...form, nama_rekening: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {editData && (
                <div className="form-group">
                  <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                    <input type="checkbox" checked={form.is_active}
                      onChange={e => setForm({ ...form, is_active: e.target.checked })} />
                    <span className="form-label" style={{ marginBottom: 0 }}>Akun Aktif</span>
                  </label>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Batal</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? <span className="spinner"></span> : "💾 Simpan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

UsersPage.title = "Manajemen User";
UsersPage.subtitle = "Kelola akun akuntan, admin, dan finance";
