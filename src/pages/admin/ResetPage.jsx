// src/pages/ResetPage.jsx
import { useState } from "react";
import { deleteAll } from "../../api/prestashopClient";

// ---------------------------------------------------------------------------
// Ressources disponibles pour le reset
// ---------------------------------------------------------------------------
const RESOURCES = [
  {
    key: "combinations",
    label: "Combinaisons",
    description: "Variantes de produits (taille, couleur...)",
    color: "#9b59b6",
  },
  {
    key: "products",
    label: "Produits",
    description: "Tous les produits du catalogue",
    color: "#e74c3c",
  },
  {
    key: "manufacturers",
    label: "Fabricants",
    description: "Tous les fabricants / marques",
    color: "#d35400",
  },
  {
    key: "categories",
    label: "Categories",
    description: "Categories (sauf racines protegees)",
    color: "#27ae60",
  },
  {
    key: "orders",
    label: "Commandes",
    description: "Toutes les commandes passees",
    color: "#f39c12",
  },
  {
    key: "customers",
    label: "Clients",
    description: "Tous les comptes clients",
    color: "#e67e22",
  },
  {
    key: "addresses",
    label: "Adresses",
    description: "Toutes les adresses clients",
    color: "#8e44ad",
  },
  {
    key: "carts",
    label: "Paniers",
    description: "Tous les paniers en cours",
    color: "#2980b9",
  },
  {
    key: "carriers",
    label: "Transporteurs",
    description: "Tous les transporteurs",
    color: "#16a085",
  },
  {
    key: "suppliers",
    label: "Fournisseurs",
    description: "Tous les fournisseurs",
    color: "#c0392b",
  },
];

// ---------------------------------------------------------------------------
// Etats possibles par ressource
// ---------------------------------------------------------------------------
const STATUS = {
  idle: "idle",
  running: "running",
  done: "done",
  error: "error",
};

export default function ResetPage() {
  const [selected, setSelected] = useState(new Set());
  const [showModal, setShowModal] = useState(false);
  const [progress, setProgress] = useState({}); // { [resource]: { deleted, total, errors, status } }
  const [isRunning, setIsRunning] = useState(false);

  // ---- Selection ----
  const toggle = (key) => {
    if (isRunning) return;
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    if (isRunning) return;
    if (selected.size === RESOURCES.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(RESOURCES.map((r) => r.key)));
    }
  };

  // ---- Reset ----
  const handleConfirm = async () => {
    setShowModal(false);
    setIsRunning(true);

    // Ordre de suppression respectant les dependances
    const ORDER = [
      "combinations",
      "products",
      "manufacturers",
      "categories",
      "orders",
      "carts",
      "addresses",
      "customers",
      "carriers",
      "suppliers",
    ];

    // Filtrer uniquement les ressources selectionnees dans le bon ordre
    const toDelete = ORDER.filter((key) => selected.has(key));

    const initial = {};
    toDelete.forEach((key) => {
      initial[key] = { deleted: 0, total: 0, errors: [], status: STATUS.running };
    });
    setProgress(initial);

    for (const key of toDelete) {
      try {
        const result = await deleteAll(key, ({ deleted, total, errors }) => {
          setProgress((prev) => ({
            ...prev,
            [key]: { deleted, total, errors, status: STATUS.running },
          }));
        });
        setProgress((prev) => ({
          ...prev,
          [key]: {
            ...result,
            status: result.errors.length > 0 ? STATUS.error : STATUS.done,
          },
        }));
      } catch (err) {
        setProgress((prev) => ({
          ...prev,
          [key]: {
            deleted: 0,
            total: 0,
            errors: [{ id: "global", error: err.message }],
            status: STATUS.error,
          },
        }));
      }
    }

    setIsRunning(false);
  };

  // ---- Helpers UI ----
  const statusIcon = (status) => {
    if (status === STATUS.running) return "⏳";
    if (status === STATUS.done) return "✓";
    if (status === STATUS.error) return "✗";
    return "";
  };

  const statusColor = (status) => {
    if (status === STATUS.running) return "#f39c12";
    if (status === STATUS.done) return "#27ae60";
    if (status === STATUS.error) return "#e74c3c";
    return "inherit";
  };

  const allDone =
    Object.keys(progress).length > 0 &&
    Object.values(progress).every((p) => p.status === STATUS.done || p.status === STATUS.error);

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>Reinitialisation des donnees</h1>
        <p style={styles.subtitle}>
          Selectionne les ressources a supprimer puis confirme. Cette action est
          irreversible.
        </p>
      </header>

      {/* ---- Grille de selection ---- */}
      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <span style={styles.sectionTitle}>Ressources PrestaShop</span>
          <button style={styles.selectAllBtn} onClick={toggleAll} disabled={isRunning}>
            {selected.size === RESOURCES.length ? "Tout deselectionner" : "Tout selectionner"}
          </button>
        </div>

        <div style={styles.grid}>
          {RESOURCES.map((r) => {
            const isChecked = selected.has(r.key);
            const prog = progress[r.key];
            return (
              <div
                key={r.key}
                style={{
                  ...styles.card,
                  borderColor: isChecked ? r.color : "#2a2a2a",
                  background: isChecked ? `${r.color}11` : "#1a1a1a",
                  opacity: isRunning && !isChecked ? 0.4 : 1,
                  cursor: isRunning ? "not-allowed" : "pointer",
                }}
                onClick={() => toggle(r.key)}
              >
                <div style={styles.cardTop}>
                  <label style={styles.checkboxWrapper}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggle(r.key)}
                      disabled={isRunning}
                      style={styles.checkbox}
                    />
                    <span
                      style={{
                        ...styles.customCheck,
                        borderColor: isChecked ? r.color : "#555",
                        background: isChecked ? r.color : "transparent",
                      }}
                    >
                      {isChecked && "✓"}
                    </span>
                  </label>
                  <div style={styles.dot} />
                </div>

                <div style={{ ...styles.resourceLabel, color: r.color }}>
                  {r.label}
                </div>
                <div style={styles.resourceDesc}>{r.description}</div>

                {/* Barre de progression */}
                {prog && (
                  <div style={styles.progWrapper}>
                    <div style={styles.progBar}>
                      <div
                        style={{
                          ...styles.progFill,
                          width: prog.total > 0 ? `${(prog.deleted / prog.total) * 100}%` : "0%",
                          background: statusColor(prog.status),
                        }}
                      />
                    </div>
                    <span
                      style={{ ...styles.progLabel, color: statusColor(prog.status) }}
                    >
                      {statusIcon(prog.status)}{" "}
                      {prog.total > 0
                        ? `${prog.deleted} / ${prog.total} supprimes`
                        : prog.status === STATUS.running
                          ? "Recuperation des IDs..."
                          : ""}
                      {prog.errors.length > 0 && ` (${prog.errors.length} erreurs)`}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ---- Bouton Reset ---- */}
      {!isRunning && !allDone && (
        <div style={styles.actions}>
          <span style={styles.selectedCount}>
            {selected.size} ressource{selected.size > 1 ? "s" : ""} selectionnee
            {selected.size > 1 ? "s" : ""}
          </span>
          <button
            style={{
              ...styles.resetBtn,
              opacity: selected.size === 0 ? 0.4 : 1,
              cursor: selected.size === 0 ? "not-allowed" : "pointer",
            }}
            onClick={() => selected.size > 0 && setShowModal(true)}
            disabled={selected.size === 0}
          >
            Reinitialiser
          </button>
        </div>
      )}

      {/* ---- Recap apres reset ---- */}
      {allDone && (
        <div style={styles.recap}>
          <h2 style={styles.recapTitle}>Resume du reset</h2>
          {Object.entries(progress).map(([key, p]) => {
            const resource = RESOURCES.find((r) => r.key === key);
            return (
              <div key={key} style={styles.recapRow}>
                <span style={{ color: resource.color }}>{resource.label}</span>
                <span style={{ color: statusColor(p.status) }}>
                  {statusIcon(p.status)} {p.deleted}/{p.total} supprimes
                  {p.errors.length > 0 && ` — ${p.errors.length} erreurs`}
                </span>
              </div>
            );
          })}
          <button
            style={styles.resetBtn}
            onClick={() => {
              setProgress({});
              setSelected(new Set());
            }}
          >
            Nouveau reset
          </button>
        </div>
      )}

      {/* ---- Modal de confirmation ---- */}
      {showModal && (
        <div style={styles.overlay} onClick={() => setShowModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalIcon}>⚠</div>
            <h2 style={styles.modalTitle}>Confirmation requise</h2>
            <p style={styles.modalText}>
              Tu es sur le point de supprimer definitivement les donnees de :
            </p>
            <ul style={styles.modalList}>
              {[...selected].map((key) => {
                const r = RESOURCES.find((r) => r.key === key);
                return (
                  <li key={key} style={{ ...styles.modalListItem, color: r.color }}>
                    {r.label}
                  </li>
                );
              })}
            </ul>
            <p style={styles.modalWarning}>Cette action est irreversible.</p>
            <div style={styles.modalActions}>
              <button
                style={styles.cancelBtn}
                onClick={() => setShowModal(false)}
              >
                Annuler
              </button>
              <button style={styles.confirmBtn} onClick={handleConfirm}>
                Confirmer le reset
              </button>
            </div>
          </div>
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
    marginBottom: 40,
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
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 12,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "#555",
  },
  selectAllBtn: {
    background: "transparent",
    border: "1px solid #333",
    color: "#888",
    padding: "6px 12px",
    borderRadius: 4,
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    gap: 12,
  },
  card: {
    border: "1px solid",
    borderRadius: 8,
    padding: "16px",
    transition: "all 0.15s ease",
    userSelect: "none",
  },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  checkboxWrapper: {
    display: "flex",
    alignItems: "center",
    cursor: "pointer",
    gap: 8,
  },
  checkbox: {
    display: "none",
  },
  customCheck: {
    width: 18,
    height: 18,
    borderRadius: 4,
    border: "2px solid",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    fontWeight: 700,
    color: "#fff",
    flexShrink: 0,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "#333",
  },
  resourceLabel: {
    fontSize: 15,
    fontWeight: 700,
    marginBottom: 4,
    letterSpacing: "0.3px",
  },
  resourceDesc: {
    fontSize: 12,
    color: "#666",
    lineHeight: 1.4,
  },
  progWrapper: {
    marginTop: 12,
  },
  progBar: {
    height: 4,
    background: "#222",
    borderRadius: 2,
    overflow: "hidden",
    marginBottom: 6,
  },
  progFill: {
    height: "100%",
    borderRadius: 2,
    transition: "width 0.2s ease",
  },
  progLabel: {
    fontSize: 11,
    fontFamily: "inherit",
  },
  actions: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 32,
    paddingTop: 24,
    borderTop: "1px solid #222",
  },
  selectedCount: {
    fontSize: 13,
    color: "#666",
  },
  resetBtn: {
    background: "#e74c3c",
    color: "#fff",
    border: "none",
    padding: "12px 28px",
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 700,
    fontFamily: "inherit",
    letterSpacing: "0.5px",
    transition: "background 0.15s",
  },
  recap: {
    marginTop: 32,
    padding: 24,
    background: "#141414",
    border: "1px solid #222",
    borderRadius: 8,
  },
  recapTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: "#fff",
    marginBottom: 16,
    marginTop: 0,
  },
  recapRow: {
    display: "flex",
    justifyContent: "space-between",
    padding: "8px 0",
    borderBottom: "1px solid #1e1e1e",
    fontSize: 13,
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.8)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  modal: {
    background: "#161616",
    border: "1px solid #333",
    borderRadius: 12,
    padding: 32,
    maxWidth: 460,
    width: "90%",
    textAlign: "center",
  },
  modalIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: "#fff",
    margin: "0 0 12px",
  },
  modalText: {
    color: "#999",
    fontSize: 14,
    marginBottom: 12,
  },
  modalList: {
    listStyle: "none",
    padding: 0,
    margin: "0 0 12px",
  },
  modalListItem: {
    fontSize: 14,
    fontWeight: 600,
    padding: "4px 0",
  },
  modalWarning: {
    color: "#e74c3c",
    fontSize: 13,
    marginBottom: 24,
  },
  modalActions: {
    display: "flex",
    gap: 12,
    justifyContent: "center",
  },
  cancelBtn: {
    background: "transparent",
    border: "1px solid #333",
    color: "#888",
    padding: "10px 24px",
    borderRadius: 6,
    fontSize: 14,
    fontFamily: "inherit",
    cursor: "pointer",
  },
  confirmBtn: {
    background: "#e74c3c",
    color: "#fff",
    border: "none",
    padding: "10px 24px",
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 700,
    fontFamily: "inherit",
    cursor: "pointer",
  },
};