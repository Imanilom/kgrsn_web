import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Sidebar from "./Sidebar";

const PUBLIC_ROUTES = ["/login"];

export default function Layout({ children, title, subtitle }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token && !PUBLIC_ROUTES.includes(router.pathname)) {
      router.push("/login");
    } else {
      setReady(true);
    }
  }, [router.pathname]);

  if (PUBLIC_ROUTES.includes(router.pathname)) {
    return <>{children}</>;
  }

  if (!ready) return null;

  return (
    <div className="layout">
      <Sidebar />
      <div className="main-content">
        <header className="header">
          <div>
            <div className="header-title">{title || "KGRSN PO"}</div>
            {subtitle && <div className="header-subtitle">{subtitle}</div>}
          </div>
        </header>
        <div className="page-content">
          {children}
        </div>
      </div>
    </div>
  );
}

// Format currency helper
export function formatRupiah(value) {
  if (!value && value !== 0) return "-";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

// Format date helper
export function formatDate(dateStr) {
  if (!dateStr) return "-";
  const BULAN = ["", "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const d = new Date(dateStr);
  return `${d.getDate()} ${BULAN[d.getMonth() + 1]} ${d.getFullYear()}`;
}

// Status badge helper
export function StatusBadge({ status }) {
  return <span className={`badge badge-${status?.toLowerCase()}`}>{status}</span>;
}

// Confirm modal
export function ConfirmModal({ open, title, message, onConfirm, onCancel, danger }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ color: "var(--color-muted)" }}>{message}</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onCancel}>Batal</button>
          <button className={`btn ${danger ? "btn-danger" : "btn-primary"}`} onClick={onConfirm}>
            Konfirmasi
          </button>
        </div>
      </div>
    </div>
  );
}
