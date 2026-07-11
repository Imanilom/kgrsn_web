import { useState } from "react";
import { useRouter } from "next/router";
import { authApi } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await authApi.login(form.username, form.password);
      localStorage.setItem("access_token", res.data.access_token);
      localStorage.setItem("user", JSON.stringify(res.data.user));
      router.push("/");
    } catch (err) {
      setError(err.response?.data?.detail || "Login gagal. Periksa username dan password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
    }}>
      <div style={{ width: "100%", maxWidth: 420, padding: "0 16px" }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            width: 64, height: 64,
            background: "rgba(99,102,241,0.2)",
            borderRadius: 16,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 32, margin: "0 auto 12px",
            border: "1.5px solid rgba(99,102,241,0.4)",
          }}>🏭</div>
          <h1 style={{ color: "#f1f5f9", fontSize: 22, fontWeight: 800, marginBottom: 4 }}>
            KGRSN PO System
          </h1>
          <p style={{ color: "#64748b", fontSize: 13 }}>Sistem Manajemen Purchase Order Multi-Dapur</p>
        </div>

        {/* Card */}
        <div style={{
          background: "white",
          borderRadius: 16,
          padding: 32,
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        }}>
          <h2 style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>Masuk ke Akun</h2>
          <p style={{ color: "var(--color-muted)", fontSize: 13, marginBottom: 24 }}>
            Masukkan kredensial Anda untuk melanjutkan
          </p>

          {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>⚠️ {error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Username</label>
              <input
                className="form-control"
                type="text"
                placeholder="Masukkan username"
                value={form.username}
                onChange={e => setForm({ ...form, username: e.target.value })}
                required
                autoFocus
              />
            </div>
            <div className="form-group" style={{ marginBottom: 24 }}>
              <label className="form-label">Password</label>
              <input
                className="form-control"
                type="password"
                placeholder="Masukkan password"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                required
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary btn-lg"
              style={{ width: "100%", justifyContent: "center" }}
              disabled={loading}
            >
              {loading ? <><span className="spinner" style={{ width: 16, height: 16 }}></span> Memproses...</> : "🔐 Masuk"}
            </button>
          </form>
        </div>


      </div>
    </div>
  );
}

LoginPage.getLayout = (page) => page;
