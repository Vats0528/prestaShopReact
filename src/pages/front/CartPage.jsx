import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createAddressFromData,
  createCartFromItems,
  createCustomerFromData,
  createOrderFromCart,
  createOrderHistory,
  getActiveCountryId,
  getAll,
  getCustomerIdByEmail,
  getCustomerSecureKey,
} from "../../api/prestashopClient";
import { useCart } from "../../context/CartContext";
import { useCustomer } from "../../context/CustomerContext";
import LoginPage from "./LoginPage";

const DEFAULT_COUNTRY = "FR";

export default function CartPage() {
  const { items, updateQty, remove, clear, total } = useCart();
  const { customer, setCustomer, isAuthenticated } = useCustomer();
  const [form, setForm] = useState(() => ({
    email: customer?.email || "",
    firstname: customer?.firstname || "",
    lastname: customer?.lastname || "",
    address1: "",
    city: "",
    postcode: "",
    country: DEFAULT_COUNTRY,
  }));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const navigate = useNavigate();

  const totals = useMemo(() => computeTotals(items), [items]);

  useEffect(() => {
    if (customer?.email) {
      setForm((prev) => ({ ...prev, email: customer.email }));
    }
  }, [customer?.email]);

  const handleCheckout = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!isAuthenticated) {
      setError("Vous devez vous connecter pour valider la commande.");
      return;
    }

    if (items.length === 0) {
      setError("Votre panier est vide.");
      return;
    }

    if (!form.email || !form.firstname || !form.lastname) {
      setError("Merci de renseigner nom, prenom et email.");
      return;
    }

    if (!form.address1 || !form.city || !form.postcode) {
      setError("Merci de renseigner une adresse de livraison complete.");
      return;
    }

    setLoading(true);
    try {
      let customerId = await getCustomerIdByEmail(form.email);
      if (!customerId) {
        const passwd = `ps_${Math.random().toString(36).slice(2, 10)}`;
        customerId = await createCustomerFromData({
          firstname: form.firstname,
          lastname: form.lastname,
          email: form.email,
          passwd,
        });
      }

      const secureKey = await getCustomerSecureKey(customerId);
      const countryId = await getActiveCountryId(form.country, form.country);
      if (!countryId) {
        throw new Error("Impossible de determiner le pays actif.");
      }

      const addressId = await createAddressFromData({
        id_customer: customerId,
        alias: "Livraison",
        firstname: form.firstname,
        lastname: form.lastname,
        address1: form.address1,
        city: form.city,
        postcode: form.postcode,
        id_country: countryId,
      });

      const cartId = await createCartFromItems({
        id_customer: customerId,
        id_address_delivery: addressId,
        id_address_invoice: addressId,
        items: items.map((item) => ({
          productId: item.id,
          productAttributeId: item.productAttributeId || "0",
          quantity: item.qty,
        })),
      });

      const stateId = await resolveCodStateId();
      if (!stateId) throw new Error("Etat 'paiement a la livraison' introuvable.");

      const orderId = await createOrderFromCart({
        id_customer: customerId,
        id_address_delivery: addressId,
        id_address_invoice: addressId,
        id_cart: cartId,
        current_state: stateId,
        payment: "Paiement a la livraison",
        module: "ps_cashondelivery",
        secure_key: secureKey,
        total_paid: totals.total,
        total_paid_real: totals.total,
        total_paid_tax_incl: totals.total,
        total_paid_tax_excl: totals.total,
        total_products: totals.total,
        total_products_wt: totals.total,
        items: items.map((item) => ({
          productId: item.id,
          productAttributeId: item.productAttributeId || "0",
          quantity: item.qty,
          name: item.name,
          reference: item.reference || "",
          price: normalizePrice(item.price),
          taxRate: 0,
        })),
      });

      await createOrderHistory(orderId, stateId, "0");

      setCustomer({
        id: customerId,
        email: form.email,
        firstname: form.firstname,
        lastname: form.lastname,
        secureKey,
      });

      clear();
      setSuccess(`Commande #${orderId} validee.`);
      navigate("/orders");
    } catch (err) {
      setError(err?.message || "Erreur pendant la validation de commande.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="cart-page">
      <div className="cart-grid">
        <div className="panel">
          <h2>Panier</h2>
          {items.length === 0 ? (
            <p className="muted">Votre panier est vide.</p>
          ) : (
            <div className="cart-list">
              {items.map((item) => (
                <div className="cart-item" key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <span className="muted">{formatMoney(item.price)}</span>
                  </div>
                  <div className="qty-row">
                    <button className="btn ghost" onClick={() => updateQty(item.id, item.qty - 1)}>-</button>
                    <span>{item.qty}</span>
                    <button className="btn ghost" onClick={() => updateQty(item.id, item.qty + 1)}>+</button>
                  </div>
                  <button className="btn ghost" onClick={() => remove(item.id)}>Retirer</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {isAuthenticated ? (
          <div className="panel">
            <h2>Validation</h2>
            <div className="recap">
              <div>
                <span>Total produits</span>
                <strong>{formatMoney(total)}</strong>
              </div>
              <div>
                <span>Livraison</span>
                <strong>0 EUR</strong>
              </div>
              <div>
                <span>Paiement</span>
                <strong>Paiement a la livraison</strong>
              </div>
            </div>

            <form className="checkout" onSubmit={handleCheckout}>
              <div className="field">
                <label>Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                  required
                />
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Prenom</label>
                  <input
                    value={form.firstname}
                    onChange={(e) => setForm((prev) => ({ ...prev, firstname: e.target.value }))}
                    required
                  />
                </div>
                <div className="field">
                  <label>Nom</label>
                  <input
                    value={form.lastname}
                    onChange={(e) => setForm((prev) => ({ ...prev, lastname: e.target.value }))}
                    required
                  />
                </div>
              </div>
              <div className="field">
                <label>Adresse</label>
                <input
                  value={form.address1}
                  onChange={(e) => setForm((prev) => ({ ...prev, address1: e.target.value }))}
                  required
                />
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Ville</label>
                  <input
                    value={form.city}
                    onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))}
                    required
                  />
                </div>
                <div className="field">
                  <label>Code postal</label>
                  <input
                    value={form.postcode}
                    onChange={(e) => setForm((prev) => ({ ...prev, postcode: e.target.value }))}
                    required
                  />
                </div>
              </div>
              <div className="field">
                <label>Pays (nom ou ISO)</label>
                <input
                  value={form.country}
                  onChange={(e) => setForm((prev) => ({ ...prev, country: e.target.value }))}
                />
              </div>

              {error && <div className="callout error">{error}</div>}
              {success && <div className="callout success">{success}</div>}

              <button className="btn primary full" type="submit" disabled={loading}>
                {loading ? "Validation..." : "Valider la commande"}
              </button>
            </form>
          </div>
        ) : (
          <LoginPage redirectTo="/cart" message="Connectez-vous pour valider votre commande." />
        )}
      </div>
    </section>
  );
}

function computeTotals(items) {
  const total = items.reduce((sum, item) => sum + toNumber(item.price) * item.qty, 0);
  return { total: total.toFixed(6) };
}

function toNumber(value) {
  const n = Number(value);
  return Number.isNaN(n) ? 0 : n;
}

function normalizePrice(value) {
  return toNumber(value).toFixed(6);
}

function formatMoney(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return value || "-";
  return `${n.toFixed(2)} EUR`;
}

async function resolveCodStateId() {
  const xml = await getAll("order_states");
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const items = Array.from(doc.getElementsByTagName("order_state"));

  for (const item of items) {
    const id = getText(item, "id");
    const name = getLanguageText(item.querySelector("name"));
    const v = normalizeText(name);
    if (v.includes("paiement") && v.includes("livraison")) return id;
    if (v.includes("cash") && v.includes("delivery")) return id;
  }

  return items.length > 0 ? getText(items[0], "id") : "";
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

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
