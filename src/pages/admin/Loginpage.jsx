import { useState } from "react";
import { useAuth } from "../../context/AuthContext";

export default function LoginPage({ onLogin }) {
  const { login } = useAuth();
  const [user, setUser] = useState("admin");
  const [pass, setPass] = useState("admin123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    await new Promise((r) => setTimeout(r, 400));
    const ok = login(user, pass);
    if (!ok) setError("Identifiants incorrects");
    setLoading(false);
    if (ok && onLogin) onLogin();
  };

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.logo}>⚙</div>
        <h1 style={s.title}>Backoffice</h1>
        <p style={s.sub}>PrestaShop Manager</p>
        <form onSubmit={handleSubmit} style={s.form}>
          <div style={s.field}>
            <label style={s.label}>Identifiant</label>
            <input
              style={s.input}
              value={user}
              onChange={(e) => setUser(e.target.value)}
              autoComplete="username"
            />
          </div>
          <div style={s.field}>
            <label style={s.label}>Mot de passe</label>
            <input
              style={s.input}
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          {error && <p style={s.error}>{error}</p>}
          <button style={{ ...s.btn, opacity: loading ? 0.6 : 1 }} disabled={loading}>
            {loading ? "Connexion…" : "Se connecter"}
          </button>
        </form>
      </div>
    </div>
  );
}

const s = {
  page: {
    minHeight: "100vh",
    background: "#0a0a0a",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'IBM Plex Mono', monospace",
  },
  card: {
    background: "#111",
    border: "1px solid #222",
    borderRadius: 16,
    padding: "48px 40px",
    width: "100%",
    maxWidth: 380,
    textAlign: "center",
  },
  logo: { fontSize: 40, marginBottom: 16 },
  title: { color: "#fff", fontSize: 22, fontWeight: 700, margin: "0 0 4px" },
  sub: { color: "#555", fontSize: 13, margin: "0 0 32px" },
  form: { display: "flex", flexDirection: "column", gap: 16, textAlign: "left" },
  field: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 11, color: "#666", letterSpacing: 1, textTransform: "uppercase" },
  input: {
    background: "#0e0e0e",
    border: "1px solid #2a2a2a",
    borderRadius: 8,
    padding: "12px 14px",
    color: "#e0e0e0",
    fontSize: 14,
    fontFamily: "inherit",
    outline: "none",
  },
  error: { color: "#e74c3c", fontSize: 12, margin: 0 },
  btn: {
    background: "#3498db",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "14px",
    fontSize: 14,
    fontWeight: 700,
    fontFamily: "inherit",
    cursor: "pointer",
    marginTop: 8,
    letterSpacing: "0.5px",
  },
};