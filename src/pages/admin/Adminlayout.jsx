import { useAuth } from "../../context/AuthContext";
import LoginPage from "./Loginpage";

const NAV = [
  { label: "Import CSV + image", key: "import-mai-26" },
  { label: "Import libre", key: "import" },
  { label: "Commandes", key: "orders" },
  { label: "Reset donnees", key: "reset" },
];

export default function AdminLayout({ page, setPage, children }) {
  const { admin, logout } = useAuth();

  if (!admin) return <LoginPage />;

  return (
    <div style={s.shell}>
      <aside style={s.sidebar}>
        <div style={s.brand}>
          <span style={s.brandIcon}>⚙</span>
          <span style={s.brandName}>Backoffice</span>
        </div>
        <nav style={s.nav}>
          {NAV.map((n) => (
            <button
              key={n.key}
              style={{ ...s.navItem, ...(page === n.key ? s.navActive : {}) }}
              onClick={() => setPage(n.key)}
            >
              {n.label}
            </button>
          ))}
        </nav>
        <button style={s.logoutBtn} onClick={logout}>
          ↩ Déconnexion
        </button>
      </aside>
      <main style={s.main}>{children}</main>
    </div>
  );
}

const s = {
  shell: { display: "flex", minHeight: "100vh", background: "#0a0a0a", fontFamily: "'IBM Plex Mono', monospace" },
  sidebar: {
    width: 220,
    background: "#111",
    borderRight: "1px solid #1e1e1e",
    display: "flex",
    flexDirection: "column",
    padding: "24px 0",
    position: "sticky",
    top: 0,
    height: "100vh",
    flexShrink: 0,
  },
  brand: { display: "flex", alignItems: "center", gap: 10, padding: "0 20px 24px", borderBottom: "1px solid #1e1e1e" },
  brandIcon: { fontSize: 20 },
  brandName: { color: "#fff", fontWeight: 700, fontSize: 14, letterSpacing: "0.5px" },
  nav: { flex: 1, display: "flex", flexDirection: "column", gap: 4, padding: "20px 12px" },
  navItem: {
    display: "flex", alignItems: "center", gap: 10,
    background: "transparent", border: "none",
    color: "#555", padding: "10px 12px", borderRadius: 8,
    fontSize: 13, fontFamily: "inherit", cursor: "pointer",
    textAlign: "left", width: "100%", transition: "all 0.15s",
  },
  navActive: { background: "#1a2a3a", color: "#3498db" },
  logoutBtn: {
    margin: "0 12px",
    background: "transparent", border: "1px solid #222",
    color: "#444", padding: "10px 12px", borderRadius: 8,
    fontSize: 12, fontFamily: "inherit", cursor: "pointer",
  },
  main: { flex: 1, padding: "40px 32px", color: "#e0e0e0", overflowY: "auto" },
};