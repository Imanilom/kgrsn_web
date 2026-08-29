import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";

const menuGroups = [
  {
    label: "Utama",
    items: [
      { href: "/", icon: "📊", label: "Dashboard" },
    ],
  },
  {
    label: "Purchase Order",
    items: [
      { href: "/jadwal-pm", icon: "📅", label: "Jadwal PM & Pagu" },
      { href: "/jadwal-pm/weekly", icon: "📊", label: "Rekap Pagu Mingguan" },
      { href: "/po", icon: "📋", label: "Daftar PO" },
      { href: "/po/create", icon: "➕", label: "Buat PO Manual" },
      { href: "/po/import", icon: "📥", label: "Import PO dari Tabel" },
      { href: "/realisasi", icon: "✅", label: "PO Realisasi" },
    ],
  },
  {
    label: "Pembelanjaan",
    roles: ["admin", "super_admin"],
    items: [
      { href: "/belanja", icon: "🛒", label: "Transaksi Belanja" },
      { href: "/rekap-pembelanjaan", icon: "🛒", label: "Rekap Pembelanjaan" },
      { href: "/supplier", icon: "🏭", label: "Manajemen Supplier" },
      { href: "/reimbursement", icon: "💸", label: "Reimbursement", roles: ["admin", "super_admin"] },
    ],
  },
  {
    label: "Dokumen",
    items: [
      { href: "/invoice", icon: "🧾", label: "Invoice" },
      { href: "/surat-jalan", icon: "🚚", label: "Surat Jalan" },
      { href: "/rekap", icon: "📊", label: "Rekap Mingguan", roles: ["admin", "super_admin", "finance"] },
    ],
  },
  {
    label: "Hutang & Piutang",
    roles: ["admin", "super_admin", "finance"],
    items: [
      { href: "/hutang", icon: "💸", label: "Hutang Supplier" },
      { href: "/pembayaran-supplier", icon: "💳", label: "Pembayaran Supplier" },
      { href: "/piutang", icon: "💰", label: "Piutang Dapur" },
      { href: "/overhead", icon: "🏢", label: "Overhead & Ops" },
    ],
  },
  {
    label: "Laporan Keuangan",
    roles: ["admin", "super_admin", "finance"],
    items: [
      { href: "/laporan", icon: "📈", label: "Dashboard Laporan" },
      { href: "/laporan/laba-rugi", icon: "💹", label: "Laba Rugi" },
      { href: "/laporan/margin", icon: "📉", label: "Analisis Margin" },
      { href: "/harga-analitik", icon: "📊", label: "Tren Harga & Forecast" },
      { href: "/harga-forecast", icon: "🔮", label: "Harga Forecast" },
    ],
  },

  {
    label: "Master Data",
    roles: ["admin", "super_admin", "finance"],
    items: [
      { href: "/master-harga", icon: "💰", label: "Master Harga" },
      { href: "/master-item", icon: "📦", label: "Master Item" },
      { href: "/dapur", icon: "🍳", label: "Dapur" },
    ],
  },
  {
    label: "Keuangan",
    roles: ["admin", "super_admin", "finance"],
    items: [
      { href: "/rab", icon: "📑", label: "RAB" },
    ],
  },
];



export default function Sidebar({ isOpen, onClose }) {
  const router = useRouter();
  const [user, setUser] = useState(null);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData) setUser(JSON.parse(userData));
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("user");
    if (onClose) onClose();
    router.push("/login");
  };

  const isActive = (href) => {
    if (href === "/") return router.pathname === "/";
    return router.pathname.startsWith(href);
  };

  const getInitials = (name) => {
    if (!name) return "U";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const handleNavClick = () => {
    if (onClose) onClose();
  };

  return (
    <aside className={`sidebar ${isOpen ? "open" : ""}`}>
      <div className="sidebar-logo">
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
          <img
            src="/logo koperasi.png"
            alt="Logo"
            style={{ width: 36, height: 36, objectFit: "contain", flexShrink: 0 }}
          />
          <div>
            <div className="sidebar-logo-text">KGRSN</div>
            <div className="sidebar-logo-sub">PO Management</div>
          </div>
        </div>
        {onClose && (
          <button className="sidebar-close-btn" onClick={onClose} aria-label="Close Menu">
            ✕
          </button>
        )}
      </div>

      <nav className="sidebar-nav">
        {menuGroups
          .filter(group => !group.roles || (user && group.roles.includes(user.role)))
          .map((group) => {
            const visibleItems = group.items.filter(item => !item.roles || (user && item.roles.includes(user.role)));
            if (visibleItems.length === 0) return null;
            return (
              <div key={group.label} className="sidebar-section">
                <div className="sidebar-section-label">{group.label}</div>
                {visibleItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={handleNavClick}
                    className={`sidebar-link ${isActive(item.href) ? "active" : ""}`}
                  >
                    <span className="sidebar-link-icon">{item.icon}</span>
                    {item.label}
                  </Link>
                ))}
              </div>
            );
          })}


        {user?.role === "super_admin" || user?.role === "admin" ? (
          <div className="sidebar-section">
            <div className="sidebar-section-label">Admin</div>
            <Link
              href="/users"
              onClick={handleNavClick}
              className={`sidebar-link ${isActive("/users") ? "active" : ""}`}
            >
              <span className="sidebar-link-icon">👥</span>
              Manajemen User
            </Link>
            <Link
              href="/pengaturan"
              onClick={handleNavClick}
              className={`sidebar-link ${isActive("/pengaturan") ? "active" : ""}`}
            >
              <span className="sidebar-link-icon">⚙️</span>
              Pengaturan Sistem
            </Link>
          </div>
        ) : null}
      </nav>

      <div className="sidebar-bottom">
        <div className="sidebar-user">
          <div className="sidebar-user-avatar">
            {getInitials(user?.full_name || user?.username)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="sidebar-user-name" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user?.full_name || user?.username || "User"}
            </div>
            <div className="sidebar-user-role">{user?.role}</div>
          </div>
          <button
            onClick={handleLogout}
            className="sidebar-link"
            style={{ padding: "4px 6px", width: "auto", color: "#ef4444" }}
            title="Logout"
          >
            🚪
          </button>
        </div>
      </div>
    </aside>
  );
}
