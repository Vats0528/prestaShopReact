import { useEffect, useMemo, useState } from "react";
import { getAll } from "../../api/prestashopClient";
import { useCustomer } from "../../context/CustomerContext";
import LoginPage from "./LoginPage";

export default function OrdersPage() {
  const { customer, isAuthenticated } = useCustomer();
  const [orders, setOrders] = useState([]);
  const [statusMap, setStatusMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadOrders = async (customerId) => {
    setLoading(true);
    setError("");
    try {
      const [ordersXml, statesXml] = await Promise.all([
        getAll("orders"),
        getAll("order_states"),
      ]);
      const nextStatusMap = parseOrderStates(statesXml);
      const nextOrders = parseOrders(ordersXml, customerId, nextStatusMap);
      setStatusMap(nextStatusMap);
      setOrders(nextOrders);
    } catch (err) {
      setError(err?.message || "Impossible de charger les commandes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (customer?.id) {
      void loadOrders(customer.id);
    }
  }, [customer?.id]);

  const ordered = useMemo(() => (
    [...orders].sort((a, b) => (a.date < b.date ? 1 : -1))
  ), [orders]);

  if (!isAuthenticated) {
    return <LoginPage redirectTo="/orders" message="Connectez-vous pour afficher vos commandes." />;
  }

  return (
    <section className="orders-page">
      <div className="panel">
        <h2>Mes commandes</h2>
        {error && <div className="callout error">{error}</div>}
        {loading && <div className="panel">Chargement...</div>}

        {!loading && orders.length === 0 && (
          <p className="muted">Aucune commande trouvee.</p>
        )}

        {orders.length > 0 && (
          <div className="orders-table">
            {ordered.map((order) => (
              <div className="order-row" key={order.id}>
                <div>
                  <strong>#{order.reference || order.id}</strong>
                  <p className="muted">{order.date}</p>
                </div>
                <div>
                  <span className="status">{statusMap[order.stateId] || order.stateId}</span>
                  <span className="price">{formatMoney(order.total)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function parseOrders(xmlString, customerId, statusMap) {
  const doc = new DOMParser().parseFromString(xmlString, "application/xml");
  const items = Array.from(doc.getElementsByTagName("order"));

  return items
    .map((item) => ({
      id: getText(item, "id"),
      reference: getText(item, "reference"),
      date: formatDate(getText(item, "date_add")),
      total: getText(item, "total_paid"),
      customerId: getText(item, "id_customer"),
      stateId: getText(item, "current_state"),
      stateLabel: statusMap[getText(item, "current_state")],
    }))
    .filter((order) => order.customerId === String(customerId));
}

function parseOrderStates(xmlString) {
  const doc = new DOMParser().parseFromString(xmlString, "application/xml");
  const items = Array.from(doc.getElementsByTagName("order_state"));
  const map = {};

  items.forEach((item) => {
    const id = getText(item, "id");
    const name = getLanguageText(item.querySelector("name"));
    if (id && name) map[id] = name;
  });

  return map;
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

function formatDate(value) {
  if (!value) return "";
  return value.split(" ")[0];
}

function formatMoney(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return value || "-";
  return `${n.toFixed(2)} EUR`;
}
