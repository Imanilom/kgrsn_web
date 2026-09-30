import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { notifikasiApi } from "../lib/api";

export default function NotificationBell() {
  const [notifs, setNotifs] = useState([]);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);
  const router = useRouter();

  const fetchNotifs = async () => {
    try {
      const res = await notifikasiApi.list();
      setNotifs(res.data);
    } catch (e) {
      console.error("Gagal load notif", e);
    }
  };

  useEffect(() => {
    fetchNotifs();
    // Poll every 30 seconds
    const interval = setInterval(fetchNotifs, 30000);
    return () => clearInterval(interval);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const unreadCount = notifs.filter(n => !n.is_read).length;

  const handleRead = async (notif) => {
    if (!notif.is_read) {
      await notifikasiApi.read(notif.id);
      fetchNotifs();
    }
    if (notif.link) {
      router.push(notif.link);
    }
    setOpen(false);
  };

  const handleReadAll = async () => {
    await notifikasiApi.readAll();
    fetchNotifs();
  };

  return (
    <div className="notif-container" ref={dropdownRef} style={{ position: "relative" }}>
      <button className="notif-bell-btn" onClick={() => setOpen(!open)} style={{ background: "transparent", border: "none", cursor: "pointer", position: "relative", padding: "8px" }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
        </svg>
        {unreadCount > 0 && (
          <span style={{
            position: "absolute", top: 2, right: 2, background: "red", color: "white",
            fontSize: "10px", fontWeight: "bold", padding: "2px 6px", borderRadius: "10px"
          }}>
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="notif-dropdown" style={{
          position: "absolute", top: "45px", right: "0", width: "320px", background: "white",
          boxShadow: "0 10px 25px rgba(0,0,0,0.1)", borderRadius: "10px", zIndex: 1000,
          border: "1px solid #e2e8f0", overflow: "hidden"
        }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc" }}>
            <h4 style={{ margin: 0, fontSize: "14px", fontWeight: "600", color: "#0f172a" }}>Notifikasi</h4>
            {unreadCount > 0 && (
              <button onClick={handleReadAll} style={{ background: "none", border: "none", color: "#3b82f6", fontSize: "12px", cursor: "pointer", padding: 0 }}>
                Tandai semua dibaca
              </button>
            )}
          </div>
          <div style={{ maxHeight: "350px", overflowY: "auto" }}>
            {notifs.length === 0 ? (
              <div style={{ padding: "20px", textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>Belum ada notifikasi</div>
            ) : (
              notifs.map(n => (
                <div 
                  key={n.id} 
                  onClick={() => handleRead(n)}
                  style={{
                    padding: "12px 16px",
                    borderBottom: "1px solid #f1f5f9",
                    cursor: "pointer",
                    background: n.is_read ? "white" : "#f0f9ff",
                    transition: "background 0.2s"
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = n.is_read ? "#f8fafc" : "#e0f2fe"}
                  onMouseOut={(e) => e.currentTarget.style.background = n.is_read ? "white" : "#f0f9ff"}
                >
                  <div style={{ fontWeight: n.is_read ? "500" : "600", fontSize: "13px", color: "#1e293b", marginBottom: "4px" }}>
                    {n.title}
                  </div>
                  <div style={{ fontSize: "12px", color: "#64748b", lineHeight: "1.4" }}>
                    {n.message}
                  </div>
                  <div style={{ fontSize: "10px", color: "#94a3b8", marginTop: "6px" }}>
                    {new Date(n.created_at).toLocaleString('id-ID')}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
