// src/pages/ImportPage.jsx
import { useState, useRef } from "react";
import { parseXML, buildXML, getPreviewColumns, getCellValue } from "../../utils/xmlUtils";
import { parseCSV, buildXMLFromCSV, getNormalizedHeaders } from "../../utils/csvUtils";   // à créer – voir bas de fichier
import { createFromXml, getLookupMap } from "../../api/prestashopClient";

const STEPS = { idle: 0, preview: 1, importing: 2, done: 3 };
const MODES  = { xml: "xml", csv: "csv" };

const RESOURCES = [
  "products", "customers", "orders", "addresses", "categories",
  "carriers", "manufacturers", "suppliers", "combinations",
  "cart_rules", "specific_prices", "tags", "contacts",
  "aliases", "stores",
];

// Séparateurs CSV proposés
const CSV_SEPARATORS = [
  { label: "Virgule  ,", value: "," },
  { label: "Point-virgule  ;", value: ";" },
  { label: "Tabulation  ⇥", value: "\t" },
  { label: "Pipe  |", value: "|" },
];

export default function ImportPage() {
  const [mode, setMode]       = useState(MODES.xml);
  const [step, setStep]       = useState(STEPS.idle);
  const [file, setFile]       = useState(null);
  const [parsed, setParsed]   = useState(null);   // { resource?, items }
  const [resource, setResource] = useState("");
  const [error, setError]     = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0, errors: [] });
  const [dragOver, setDragOver] = useState(false);
  const [separator, setSeparator] = useState(",");
  const [encoding, setEncoding]   = useState("UTF-8");
  const inputRef = useRef();

  // ---- Lecture du fichier ----
  const readFile = (f) => {
    if (!f) return;
    const isXml = f.name.toLowerCase().endsWith(".xml");
    const isCsv = f.name.toLowerCase().endsWith(".csv");

    if (mode === MODES.xml && !isXml) {
      setError("Le fichier doit être au format .xml");
      return;
    }
    if (mode === MODES.csv && !isCsv) {
      setError("Le fichier doit être au format .csv");
      return;
    }

    setError("");
    setFile(f);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        let result;
        if (mode === MODES.xml) {
          result = parseXML(e.target.result);
          setResource(result.resource || "");
        } else {
          result = parseCSV(e.target.result, separator);
          setResource("");
        }
        setParsed(result);
        setStep(STEPS.preview);
      } catch (err) {
        setError("Erreur de parsing : " + err.message);
      }
    };
    reader.readAsText(f, encoding);
  };

  // Re-parser le CSV quand le séparateur change (si fichier déjà chargé)
  const handleSeparatorChange = (sep) => {
    setSeparator(sep);
    if (file && mode === MODES.csv) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const result = parseCSV(e.target.result, sep);
          setParsed(result);
          setStep(STEPS.preview);
          setError("");
        } catch (err) {
          setError("Erreur de parsing : " + err.message);
        }
      };
      reader.readAsText(file, encoding);
    }
  };

  // ---- Drag & Drop ----
  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    readFile(e.dataTransfer.files[0]);
  };

  // ---- Changement de mode (reset complet) ----
  const switchMode = (m) => {
    setMode(m);
    handleReset();
  };

  // ---- Import ----
  const handleImport = async () => {
    setStep(STEPS.importing);
    const total = parsed.items.length;
    let done = 0;
    const errors = [];

    const lookups = await prepareLookups(resource, parsed.items);

    for (const item of parsed.items) {
      try {
        const xml =
          mode === MODES.xml
            ? buildXML(resource, item)
            : buildXMLFromCSV(resource, item, lookups);
        await createFromXml(resource, xml);
        done++;
      } catch (err) {
        errors.push({ item, error: err.message });
      }
      setProgress({ done, total, errors: [...errors] });
    }

    setStep(STEPS.done);
  };

  const prepareLookups = async (res, items) => {
    if (mode !== MODES.csv) return {};
    const headers = getNormalizedHeaders(items);
    const lookups = {};

    // ── Helpers pour ne fetcher qu'une fois chaque ressource ──
    const need = (key) => !lookups[key];
    const fetchCountries = async () => {
      if (need("countriesByName"))
        lookups.countriesByName = await getLookupMap("countries");
    };
    const fetchStates = async () => {
      if (need("statesByName"))
        lookups.statesByName = await getLookupMap("states");
    };
    const fetchSuppliers = async () => {
      if (need("suppliersByName"))
        lookups.suppliersByName = await getLookupMap("suppliers");
    };
    const fetchManufacturers = async () => {
      if (need("manufacturersByName"))
        lookups.manufacturersByName = await getLookupMap("manufacturers");
    };
    const fetchCategories = async () => {
      if (need("categoriesByName"))
        lookups.categoriesByName = await getLookupMap("categories");
    };
    const fetchCustomers = async () => {
      if (need("customersByEmail"))
        lookups.customersByEmail = await getLookupMap("customers", { keyField: "email" });
    };

    // ── addresses ──
    if (res === "addresses") {
      // country est toujours présent dans le CSV exemple → toujours fetcher
      await fetchCountries();
      await fetchStates();
      // customer email → id_customer
      if (headers.has("customer e mail") || headers.has("customer email"))
        await fetchCustomers();
      // manufacturer/supplier pour adresses pro
      if (headers.has("manufacturer")) await fetchManufacturers();
      if (headers.has("supplier"))     await fetchSuppliers();
    }

    // ── products ──
    if (res === "products") {
      if (headers.has("supplier"))     await fetchSuppliers();
      if (headers.has("manufacturer") || headers.has("brand")) await fetchManufacturers();
      // "categories", "category", "category default"…
      if (Array.from(headers).some(h => h.includes("categor"))) await fetchCategories();
    }

    // ── combinations ──
    // combinations n'ont pas de lookups propres mais héritent de products
    // (id_product doit déjà être numérique dans le CSV)

    // ── categories ──
    if (res === "categories") {
      // parent category peut être un nom → besoin du lookup
      if (headers.has("parent category") || headers.has("parent category id"))
        await fetchCategories();
    }

    // ── stores ──
    if (res === "stores") {
      await fetchCountries();
      await fetchStates();
    }

    // ── customers ── (pas de lookups nécessaires pour eux-mêmes)

    // ── manufacturers / suppliers ── (pas de lookups nécessaires)

    // ── cart_rules ──
    if (res === "cart_rules") {
      if (Array.from(headers).some(h => h.includes("categor"))) await fetchCategories();
    }

    // ── specific_prices ──
    if (res === "specific_prices") {
      if (headers.has("id country") || headers.has("country")) await fetchCountries();
    }

    return lookups;
  };

  // ---- Reset ----
  const handleReset = () => {
    setStep(STEPS.idle);
    setFile(null);
    setParsed(null);
    setResource("");
    setError("");
    setProgress({ done: 0, total: 0, errors: [] });
  };

  const columns  = parsed ? getPreviewColumns(parsed.items) : [];
  const percent  = progress.total > 0
    ? Math.round((progress.done / progress.total) * 100)
    : 0;
  const accept   = mode === MODES.xml ? ".xml" : ".csv";

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>Import de données</h1>
        <p style={styles.subtitle}>
          Importe un fichier XML ou CSV PrestaShop et envoie les données via le Webservice.
        </p>
      </header>

      {/* ---- Mode switcher ---- */}
      <div style={styles.modeSwitcher}>
        <button
          style={{
            ...styles.modeBtn,
            ...(mode === MODES.xml ? styles.modeBtnActive : {}),
          }}
          onClick={() => switchMode(MODES.xml)}
        >
          <span style={styles.modeBtnIcon}>&#x3c;/&#x3e;</span>
          XML
        </button>
        <button
          style={{
            ...styles.modeBtn,
            ...(mode === MODES.csv ? styles.modeBtnActive : {}),
          }}
          onClick={() => switchMode(MODES.csv)}
        >
          <span style={styles.modeBtnIcon}>⊞</span>
          CSV
        </button>
      </div>

      {/* ---- Options CSV (uniquement si mode CSV et étape idle) ---- */}
      {mode === MODES.csv && step === STEPS.idle && (
        <div style={styles.csvOptions}>
          <div style={styles.csvOptRow}>
            <span style={styles.label}>Séparateur</span>
            <div style={styles.sepButtons}>
              {CSV_SEPARATORS.map((s) => (
                <button
                  key={s.value}
                  style={{
                    ...styles.sepBtn,
                    ...(separator === s.value ? styles.sepBtnActive : {}),
                  }}
                  onClick={() => setSeparator(s.value)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div style={styles.csvOptRow}>
            <span style={styles.label}>Encodage</span>
            <select
              style={styles.select}
              value={encoding}
              onChange={(e) => setEncoding(e.target.value)}
            >
              <option value="UTF-8">UTF-8</option>
              <option value="ISO-8859-1">ISO-8859-1 (Latin-1)</option>
              <option value="windows-1252">Windows-1252</option>
            </select>
          </div>
        </div>
      )}

      {/* ---- STEP 0 : Upload ---- */}
      {step === STEPS.idle && (
        <div
          style={{
            ...styles.dropzone,
            borderColor: dragOver ? "#3498db" : "#2a2a2a",
            background: dragOver ? "#3498db11" : "#141414",
          }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            style={{ display: "none" }}
            onChange={(e) => readFile(e.target.files[0])}
          />
          <div style={styles.dropIcon}>&#x2191;</div>
          <p style={styles.dropText}>
            Glisse ton fichier{" "}
            <strong style={{ color: "#3498db" }}>
              .{mode === MODES.xml ? "xml" : "csv"}
            </strong>{" "}
            ici
          </p>
          <p style={styles.dropSub}>ou clique pour parcourir</p>
          {mode === MODES.csv && (
            <p style={styles.dropHint}>
              Séparateur : <strong style={{ color: "#aaa" }}>
                {CSV_SEPARATORS.find((s) => s.value === separator)?.label}
              </strong>
              &nbsp;·&nbsp;
              Encodage : <strong style={{ color: "#aaa" }}>{encoding}</strong>
            </p>
          )}
          {error && <p style={styles.errorMsg}>{error}</p>}
        </div>
      )}

      {/* ---- STEP 1 : Preview ---- */}
      {step === STEPS.preview && parsed && (
        <div>
          {/* Info fichier */}
          <div style={styles.fileInfo}>
            <div style={styles.fileInfoLeft}>
              <span style={styles.fileName}>{file?.name}</span>
              <span style={styles.fileCount}>
                {parsed.items.length} entrée{parsed.items.length > 1 ? "s" : ""} détectée{parsed.items.length > 1 ? "s" : ""}
                {mode === MODES.csv && (
                  <span style={{ color: "#555", marginLeft: 8 }}>
                    · séparateur : «{separator === "\t" ? "TAB" : separator}»
                  </span>
                )}
              </span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {/* Re-parse CSV avec autre séparateur */}
              {mode === MODES.csv && (
                <div style={styles.inlineSepRow}>
                  {CSV_SEPARATORS.map((s) => (
                    <button
                      key={s.value}
                      style={{
                        ...styles.sepBtnSm,
                        ...(separator === s.value ? styles.sepBtnSmActive : {}),
                      }}
                      onClick={() => handleSeparatorChange(s.value)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
              <button style={styles.ghostBtn} onClick={handleReset}>
                Changer de fichier
              </button>
            </div>
          </div>

          {/* Sélecteur de ressource */}
          <div style={styles.resourceRow}>
            <label style={styles.label}>Ressource cible</label>
            <select
              style={styles.select}
              value={resource}
              onChange={(e) => setResource(e.target.value)}
            >
              <option value="">-- Choisir --</option>
              {RESOURCES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
              {mode === MODES.xml &&
                parsed.resource &&
                !RESOURCES.includes(parsed.resource) && (
                  <option value={parsed.resource}>
                    {parsed.resource} (détecté)
                  </option>
                )}
            </select>
            {mode === MODES.xml && parsed.resource && (
              <span style={styles.resourceHint}>
                Détectée automatiquement :{" "}
                <strong style={{ color: "#3498db" }}>{parsed.resource}</strong>
              </span>
            )}
            {mode === MODES.csv && (
              <span style={styles.resourceHint}>
                Non détectable automatiquement depuis un CSV — sélectionne manuellement.
              </span>
            )}
          </div>

          {/* Tableau preview */}
          <div style={styles.tableWrapper}>
            <div style={styles.tableHeader}>
              <span style={styles.sectionTitle}>Aperçu des données</span>
              <span style={styles.tableMeta}>
                {columns.length} colonne{columns.length > 1 ? "s" : ""} · max 8 affichées
              </span>
            </div>
            <div style={styles.tableScroll}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>#</th>
                    {columns.map((col) => (
                      <th key={col} style={styles.th}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.items.slice(0, 20).map((item, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? "#111" : "#141414" }}>
                      <td style={{ ...styles.td, color: "#555" }}>{i + 1}</td>
                      {columns.map((col) => (
                        <td key={col} style={styles.td}>
                          {getCellValue(item, col)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsed.items.length > 20 && (
              <p style={styles.moreRows}>
                … et {parsed.items.length - 20} entrées supplémentaires non affichées
              </p>
            )}
          </div>

          {/* Actions */}
          <div style={styles.actions}>
            <button style={styles.ghostBtn} onClick={handleReset}>
              Annuler
            </button>
            <button
              style={{
                ...styles.importBtn,
                opacity: !resource ? 0.4 : 1,
                cursor: !resource ? "not-allowed" : "pointer",
              }}
              onClick={() => resource && handleImport()}
              disabled={!resource}
            >
              Importer {parsed.items.length} entrée{parsed.items.length > 1 ? "s" : ""} dans /{resource || "…"}
            </button>
          </div>
        </div>
      )}

      {/* ---- STEP 2 : Importing ---- */}
      {step === STEPS.importing && (
        <div style={styles.progressSection}>
          <p style={styles.progressTitle}>Import en cours…</p>
          <div style={styles.bigProgBar}>
            <div style={{ ...styles.bigProgFill, width: `${percent}%` }} />
          </div>
          <div style={styles.progressStats}>
            <span style={{ color: "#27ae60" }}>{progress.done} importés</span>
            <span style={{ color: "#555" }}>/ {progress.total}</span>
            {progress.errors.length > 0 && (
              <span style={{ color: "#e74c3c" }}>{progress.errors.length} erreurs</span>
            )}
            <span style={{ color: "#888", marginLeft: "auto" }}>{percent}%</span>
          </div>
          <div style={styles.progressLog}>
            {progress.errors.slice(-5).map((e, i) => (
              <div key={i} style={styles.logError}>Erreur : {e.error}</div>
            ))}
          </div>
        </div>
      )}

      {/* ---- STEP 3 : Done ---- */}
      {step === STEPS.done && (
        <div style={styles.doneSection}>
          <div style={styles.doneIcon}>
            {progress.errors.length === 0 ? "✓" : "⚠"}
          </div>
          <h2 style={styles.doneTitle}>
            {progress.errors.length === 0
              ? "Import terminé avec succès"
              : "Import terminé avec des erreurs"}
          </h2>
          <div style={styles.doneStats}>
            <div style={styles.statBox}>
              <span style={{ ...styles.statNum, color: "#27ae60" }}>{progress.done}</span>
              <span style={styles.statLabel}>importés</span>
            </div>
            <div style={styles.statBox}>
              <span style={{ ...styles.statNum, color: "#e74c3c" }}>{progress.errors.length}</span>
              <span style={styles.statLabel}>erreurs</span>
            </div>
            <div style={styles.statBox}>
              <span style={{ ...styles.statNum, color: "#3498db" }}>{progress.total}</span>
              <span style={styles.statLabel}>total</span>
            </div>
          </div>
          {progress.errors.length > 0 && (
            <div style={styles.errorList}>
              <p style={styles.errorListTitle}>Détail des erreurs :</p>
              {progress.errors.map((e, i) => (
                <div key={i} style={styles.errorItem}>
                  <span style={{ color: "#e74c3c" }}>#{i + 1}</span> {e.error}
                </div>
              ))}
            </div>
          )}
          <button style={styles.importBtn} onClick={handleReset}>
            Nouvel import
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = {
  page: {
    minHeight: "100vh",
    background: "#0e0e0e",
    color: "#e0e0e0",
    fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
    padding: "40px 32px",
    maxWidth: 960,
    margin: "0 auto",
  },
  header: {
    marginBottom: 32,
    borderBottom: "1px solid #222",
    paddingBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    color: "#fff",
    margin: 0,
    letterSpacing: "-0.5px",
  },
  subtitle: {
    marginTop: 8,
    color: "#888",
    fontSize: 14,
    lineHeight: 1.6,
  },
  // ---- Mode switcher ----
  modeSwitcher: {
    display: "flex",
    gap: 8,
    marginBottom: 20,
  },
  modeBtn: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "#141414",
    border: "1px solid #2a2a2a",
    color: "#666",
    padding: "10px 20px",
    borderRadius: 6,
    fontSize: 13,
    fontFamily: "inherit",
    cursor: "pointer",
    fontWeight: 600,
    letterSpacing: "0.5px",
    transition: "all 0.15s ease",
  },
  modeBtnActive: {
    background: "#1a2a3a",
    border: "1px solid #3498db",
    color: "#3498db",
  },
  modeBtnIcon: {
    fontSize: 15,
    opacity: 0.8,
  },
  // ---- CSV options ----
  csvOptions: {
    background: "#141414",
    border: "1px solid #222",
    borderRadius: 8,
    padding: "16px 20px",
    marginBottom: 20,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  csvOptRow: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
  },
  sepButtons: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
  },
  sepBtn: {
    background: "#1a1a1a",
    border: "1px solid #2a2a2a",
    color: "#666",
    padding: "6px 12px",
    borderRadius: 4,
    fontSize: 12,
    fontFamily: "inherit",
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  sepBtnActive: {
    background: "#1a2a3a",
    border: "1px solid #3498db",
    color: "#3498db",
  },
  // inline séparateur dans la fileInfo
  inlineSepRow: {
    display: "flex",
    gap: 4,
    alignItems: "center",
  },
  sepBtnSm: {
    background: "#1a1a1a",
    border: "1px solid #2a2a2a",
    color: "#555",
    padding: "4px 8px",
    borderRadius: 4,
    fontSize: 11,
    fontFamily: "inherit",
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  sepBtnSmActive: {
    background: "#1a2a3a",
    border: "1px solid #3498db",
    color: "#3498db",
  },
  // ---- Dropzone ----
  dropzone: {
    border: "2px dashed",
    borderRadius: 12,
    padding: "64px 32px",
    textAlign: "center",
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  dropIcon: {
    fontSize: 48,
    color: "#444",
    marginBottom: 16,
  },
  dropText: {
    fontSize: 18,
    color: "#ccc",
    margin: "0 0 8px",
  },
  dropSub: {
    fontSize: 13,
    color: "#555",
    margin: "0 0 10px",
  },
  dropHint: {
    fontSize: 12,
    color: "#555",
    marginTop: 6,
    margin: 0,
  },
  errorMsg: {
    marginTop: 16,
    color: "#e74c3c",
    fontSize: 13,
  },
  // ---- File info ----
  fileInfo: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 16px",
    background: "#141414",
    border: "1px solid #222",
    borderRadius: 8,
    marginBottom: 20,
    flexWrap: "wrap",
    gap: 12,
  },
  fileInfoLeft: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  fileName: {
    fontSize: 14,
    color: "#3498db",
    fontWeight: 600,
  },
  fileCount: {
    fontSize: 12,
    color: "#666",
  },
  // ---- Resource row ----
  resourceRow: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    marginBottom: 24,
    flexWrap: "wrap",
  },
  label: {
    fontSize: 12,
    color: "#666",
    letterSpacing: 1,
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  },
  select: {
    background: "#1a1a1a",
    border: "1px solid #333",
    color: "#e0e0e0",
    padding: "8px 12px",
    borderRadius: 6,
    fontSize: 13,
    fontFamily: "inherit",
    cursor: "pointer",
  },
  resourceHint: {
    fontSize: 12,
    color: "#555",
  },
  // ---- Table ----
  tableWrapper: {
    marginBottom: 24,
    border: "1px solid #1e1e1e",
    borderRadius: 8,
    overflow: "hidden",
  },
  tableHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 16px",
    background: "#141414",
    borderBottom: "1px solid #1e1e1e",
  },
  sectionTitle: {
    fontSize: 12,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "#555",
  },
  tableMeta: {
    fontSize: 11,
    color: "#444",
  },
  tableScroll: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 12,
  },
  th: {
    padding: "10px 14px",
    textAlign: "left",
    background: "#0e0e0e",
    color: "#555",
    fontWeight: 600,
    borderBottom: "1px solid #1e1e1e",
    whiteSpace: "nowrap",
    letterSpacing: "0.5px",
  },
  td: {
    padding: "8px 14px",
    color: "#bbb",
    borderBottom: "1px solid #161616",
    whiteSpace: "nowrap",
    maxWidth: 200,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  moreRows: {
    padding: "10px 16px",
    fontSize: 12,
    color: "#555",
    background: "#141414",
    margin: 0,
    borderTop: "1px solid #1e1e1e",
  },
  // ---- Actions ----
  actions: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 24,
    paddingTop: 24,
    borderTop: "1px solid #222",
  },
  ghostBtn: {
    background: "transparent",
    border: "1px solid #333",
    color: "#888",
    padding: "10px 20px",
    borderRadius: 6,
    fontSize: 13,
    fontFamily: "inherit",
    cursor: "pointer",
  },
  importBtn: {
    background: "#3498db",
    color: "#fff",
    border: "none",
    padding: "12px 28px",
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 700,
    fontFamily: "inherit",
    letterSpacing: "0.5px",
    cursor: "pointer",
  },
  // ---- Progress ----
  progressSection: {
    padding: 32,
    background: "#141414",
    border: "1px solid #222",
    borderRadius: 12,
  },
  progressTitle: {
    fontSize: 16,
    color: "#fff",
    marginBottom: 20,
    marginTop: 0,
  },
  bigProgBar: {
    height: 8,
    background: "#222",
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 12,
  },
  bigProgFill: {
    height: "100%",
    background: "#3498db",
    borderRadius: 4,
    transition: "width 0.3s ease",
  },
  progressStats: {
    display: "flex",
    gap: 16,
    fontSize: 13,
    marginBottom: 16,
  },
  progressLog: {
    marginTop: 8,
  },
  logError: {
    fontSize: 11,
    color: "#e74c3c",
    padding: "4px 0",
    borderBottom: "1px solid #1a1a1a",
  },
  // ---- Done ----
  doneSection: {
    textAlign: "center",
    padding: "48px 32px",
    background: "#141414",
    border: "1px solid #222",
    borderRadius: 12,
  },
  doneIcon: {
    fontSize: 56,
    marginBottom: 16,
    color: "#27ae60",
  },
  doneTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: "#fff",
    marginBottom: 32,
    marginTop: 0,
  },
  doneStats: {
    display: "flex",
    justifyContent: "center",
    gap: 32,
    marginBottom: 32,
  },
  statBox: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
  },
  statNum: {
    fontSize: 36,
    fontWeight: 700,
  },
  statLabel: {
    fontSize: 12,
    color: "#555",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  errorList: {
    textAlign: "left",
    background: "#0e0e0e",
    border: "1px solid #2a1a1a",
    borderRadius: 8,
    padding: 16,
    marginBottom: 32,
    maxHeight: 200,
    overflowY: "auto",
  },
  errorListTitle: {
    fontSize: 12,
    color: "#666",
    marginBottom: 8,
    marginTop: 0,
  },
  errorItem: {
    fontSize: 12,
    color: "#cc7a7a",
    padding: "4px 0",
    borderBottom: "1px solid #1a1a1a",
  },
};