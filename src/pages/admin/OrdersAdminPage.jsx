import { useEffect, useMemo, useState } from "react";
import { getAll, getById, updateFromXml } from "../../api/prestashopClient";

const ETATS = ["echec paiement", "paiement effectue", "annule"];

export default function OrdersAdminPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState(null);
  const [statusMap, setStatusMap] = useState({ labelToId: {}, idToLabel: {} });
  const [lastSync, setLastSync] = useState(null);

  useEffect(() => {
    void refreshOrders();
  }, []);

  const canUpdate = useMemo(() => Object.keys(statusMap.labelToId).length > 0, [statusMap]);

  const refreshOrders = async () => {
    setLoading(true);
    setError("");
    try {
      const [ordersXml, customersXml, addressesXml, statesXml] = await Promise.all([
        getAll("orders"),
        getAll("customers"),
        getAll("addresses"),
        getAll("order_states"),
      ]);

      const nextStatusMap = parseOrderStates(statesXml);
      setStatusMap(nextStatusMap);

      const customerMap = parseCustomers(customersXml);
      const addressMap = parseAddresses(addressesXml);
      const nextRows = parseOrders(ordersXml, customerMap, addressMap, nextStatusMap);
      setRows(nextRows);
      setLastSync(new Date());
    } catch (err) {
      setError(err?.message || "Erreur lors du chargement des commandes");
    } finally {
      setLoading(false);
    }
  };

  const updateEtat = async (orderId, value) => {
    const stateId = statusMap.labelToId[value];
    if (!stateId) {
      setError("Aucun statut PrestaShop ne correspond a cet etat");
      return;
    }

    setUpdatingId(orderId);
    setError("");
    try {
      const orderXml = await getById("orders", orderId);
      const updatedXml = updateOrderStateXml(orderXml, stateId);
      await updateFromXml("orders", orderId, updatedXml);

      setRows((prev) =>
        prev.map((row) =>
          row.id === orderId
            ? { ...row, etat: value, currentStateId: stateId }
            : row
        )
      );
    } catch (err) {
      setError(err?.message || "Erreur lors de la mise a jour du statut");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Commandes</h1>
          <p style={styles.subtitle}>Etat synchronise avec PrestaShop.</p>
        </div>
        <button style={styles.ghostBtn} onClick={refreshOrders} disabled={loading}>
          {loading ? "Chargement..." : "Rafraichir"}
        </button>
      </header>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.metaRow}>
        <span style={styles.count}>{rows.length} commandes</span>
        <span style={styles.metaHint}>
          {lastSync ? `Maj: ${formatDateTime(lastSync)}` : ""}
        </span>
      </div>

      {loading ? (
        <div style={styles.empty}>Chargement des commandes en cours...</div>
      ) : rows.length === 0 ? (
        <div style={styles.empty}>Aucune commande retournee par l API.</div>
      ) : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>ID</th>
                <th style={styles.th}>Date</th>
                <th style={styles.th}>Reference</th>
                <th style={styles.th}>Client</th>
                <th style={styles.th}>Email</th>
                <th style={styles.th}>Adresse</th>
                <th style={styles.th}>Total</th>
                <th style={styles.th}>Etat</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td style={styles.td}>{row.id}</td>
                  <td style={styles.td}>{row.date || "-"}</td>
                  <td style={styles.td}>{row.reference || "-"}</td>
                  <td style={styles.td}>{row.customerName || "-"}</td>
                  <td style={styles.td}>{row.email || "-"}</td>
                  <td style={styles.td}>{row.address || "-"}</td>
                  <td style={styles.td}>{formatMoney(row.total)}</td>
                  <td style={styles.td}>
                    <select
                      style={styles.select}
                      value={row.etat}
                      disabled={updatingId === row.id || !canUpdate}
                      onChange={(e) => updateEtat(row.id, e.target.value)}
                    >
                      {ETATS.map((etat) => (
                        <option key={etat} value={etat}>{etat}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function parseOrders(xmlString, customerMap, addressMap, statusMap) {
  const doc = new DOMParser().parseFromString(xmlString, "application/xml");
  const items = Array.from(doc.getElementsByTagName("order"));

  return items.map((item) => {
    const id = getText(item, "id");
    const idCustomer = getText(item, "id_customer");
    const idAddress = getText(item, "id_address_delivery");
    const currentStateId = getText(item, "current_state");
    const customer = customerMap[idCustomer] || {};
    const address = addressMap[idAddress] || {};
    const etat = statusMap.idToLabel[currentStateId] || "en attente";

    return {
      id,
      date: formatDate(getText(item, "date_add")),
      reference: getText(item, "reference"),
      total: getText(item, "total_paid"),
      customerName: customer.name,
      email: customer.email,
      address: address.summary,
      etat,
      currentStateId,
    };
  });
}

function parseCustomers(xmlString) {
  const doc = new DOMParser().parseFromString(xmlString, "application/xml");
  const items = Array.from(doc.getElementsByTagName("customer"));
  const map = {};
  items.forEach((item) => {
    const id = getText(item, "id");
    if (!id) return;
    const firstname = getText(item, "firstname");
    const lastname = getText(item, "lastname");
    map[id] = {
      name: `${firstname} ${lastname}`.trim() || null,
      email: getText(item, "email") || null,
    };
  });
  return map;
}

function parseAddresses(xmlString) {
  const doc = new DOMParser().parseFromString(xmlString, "application/xml");
  const items = Array.from(doc.getElementsByTagName("address"));
  const map = {};
  items.forEach((item) => {
    const id = getText(item, "id");
    if (!id) return;
    const address1 = getText(item, "address1");
    const postcode = getText(item, "postcode");
    const city = getText(item, "city");
    map[id] = { summary: [address1, postcode, city].filter(Boolean).join(" ") };
  });
  return map;
}

function parseOrderStates(xmlString) {
  const doc = new DOMParser().parseFromString(xmlString, "application/xml");
  const items = Array.from(doc.getElementsByTagName("order_state"));
  const labelToId = {};
  const idToLabel = {};

  items.forEach((item) => {
    const id = getText(item, "id");
    const name = getLanguageText(item.querySelector("name"));
    if (!id || !name) return;
    const label = mapOrderStateToLabel(name);
    if (!label) return;
    labelToId[label] = id;
    idToLabel[id] = label;
  });

  return { labelToId, idToLabel };
}

function mapOrderStateToLabel(name) {
  const v = normalizeText(name);
  if (v.includes("annul") || v.includes("cancel")) return "annule";
  if ((v.includes("echec") || v.includes("erreur") || v.includes("error") || v.includes("failed")) && v.includes("paiement")) {
    return "echec paiement";
  }
  if ((v.includes("paiement") || v.includes("payment")) && (v.includes("accepte") || v.includes("effectue") || v.includes("accepted"))) {
    return "paiement effectue";
  }
  return null;
}

function getText(node, tag) {
  const el = node.querySelector(tag);
  return el?.textContent?.trim() || "";
}

function getLanguageText(node) {
  if (!node) return "";
  const langNode = node.querySelector("language");
  if (langNode) return langNode.textContent?.trim() || "";
  return node.textContent?.trim() || "";
}

function updateOrderStateXml(xmlString, stateId) {
  const doc = new DOMParser().parseFromString(xmlString, "application/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error("XML invalide: " + parseError.textContent);
  }

  const currentState = doc.querySelector("current_state");
  if (!currentState) throw new Error("Champ current_state introuvable");
  currentState.textContent = String(stateId);

  const serializer = new XMLSerializer();
  let payload = serializer.serializeToString(doc);
  if (!payload.startsWith("<?xml")) {
    payload = `<?xml version="1.0" encoding="UTF-8"?>\n${payload}`;
  }
  return payload;
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function formatMoney(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return value || "-";
  return `${n.toFixed(2)} EUR`;
}

function formatDate(value) {
  if (!value) return "";
  return value.split(" ")[0];
}

function formatDateTime(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#0e0e0e",
    color: "#e0e0e0",
    fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
    padding: "40px 32px",
    maxWidth: 1100,
    margin: "0 auto",
  },
  header: {
    marginBottom: 16,
    borderBottom: "1px solid #222",
    paddingBottom: 16,
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
  },
  title: { fontSize: 26, fontWeight: 700, color: "#fff", margin: 0 },
  subtitle: { marginTop: 8, color: "#888", fontSize: 13 },
  actions: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  metaRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  metaHint: { fontSize: 12, color: "#666" },
  ghostBtn: {
    background: "transparent",
    border: "1px solid #333",
    color: "#888",
    padding: "8px 16px",
    borderRadius: 6,
    fontSize: 12,
    fontFamily: "inherit",
    cursor: "pointer",
  },
  count: { fontSize: 12, color: "#666" },
  empty: {
    padding: "18px 16px",
    borderRadius: 8,
    border: "1px solid #222",
    background: "#121212",
    color: "#666",
    fontSize: 12,
  },
  error: {
    padding: "12px 14px",
    borderRadius: 8,
    border: "1px solid #5c2b29",
    background: "#2a1211",
    color: "#f3b9b4",
    fontSize: 12,
    marginBottom: 12,
  },
  tableWrap: {
    border: "1px solid #1e1e1e",
    borderRadius: 8,
    overflowX: "auto",
  },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
  th: {
    textAlign: "left",
    padding: "10px 12px",
    color: "#666",
    borderBottom: "1px solid #1e1e1e",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "10px 12px",
    borderBottom: "1px solid #151515",
    color: "#bbb",
    whiteSpace: "nowrap",
  },
  select: {
    background: "#151515",
    border: "1px solid #333",
    color: "#ddd",
    padding: "4px 8px",
    borderRadius: 6,
    fontSize: 12,
    fontFamily: "inherit",
  },
};
