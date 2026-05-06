import { useState } from "react";
import ImportPage from "./pages/ImportPage";
import ResetPage from "./pages/ResetPage";

function App() {
  const [page, setPage] = useState("import");

  return (
    <div style={{ background: "#0e0e0e", minHeight: "100vh" }}>
      {/* Nav simple */}
      <nav style={{
        display: "flex", gap: 16, padding: "16px 32px",
        borderBottom: "1px solid #1a1a1a", fontFamily: "monospace"
      }}>
        <button
          onClick={() => setPage("import")}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: page === "import" ? "#3498db" : "#555", fontSize: 14
          }}
        >
          Import XML
        </button>
        <button
          onClick={() => setPage("reset")}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: page === "reset" ? "#e74c3c" : "#555", fontSize: 14
          }}
        >
          Reset donnees
        </button>
      </nav>

      {page === "import" ? <ImportPage /> : <ResetPage />}
    </div>
  );
}

export default App;