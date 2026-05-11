import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAll, getProductImageUrl } from "../../api/prestashopClient";
import { useCart } from "../../context/CartContext";

export default function HomePage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { add } = useCart();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const xml = await getAll("products");
        setProducts(parseProducts(xml));
      } catch (err) {
        setError(err?.message || "Impossible de charger les produits");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  return (
    <section className="home">
      <div className="hero">
        <div className="hero-copy">
          <p className="hero-kicker">Collection 2026</p>
          <h1>Des essentials sobres, tailles nettes, livraison directe.</h1>
          <p className="hero-sub">
            Paiement a la livraison, pas de frais de port. Tu ajoutes, on prepare, tu regles.
          </p>
          <div className="hero-actions">
            <a className="btn primary" href="#catalogue">Voir le catalogue</a>
            <Link className="btn ghost" to="/orders">Mes commandes</Link>
          </div>
        </div>
        <div className="hero-panel">
          <div className="hero-card">
            <span>48h</span>
            <p>Preparation rapide sur stock local.</p>
          </div>
          <div className="hero-card">
            <span>0 EUR</span>
            <p>Frais de livraison offerts.</p>
          </div>
        </div>
      </div>

      <div className="catalogue" id="catalogue">
        <div className="catalogue-head">
          <h2>Produits</h2>
          <p>Selection minimaliste et durable.</p>
        </div>

        {loading ? (
          <div className="panel">Chargement du catalogue...</div>
        ) : error ? (
          <div className="panel error">{error}</div>
        ) : (
          <div className="product-grid">
            {products.map((product, index) => (
              <article className="product-card" style={{ "--i": index }} key={product.id}>
                <div className="product-media">
                  {product.imageUrl ? (
                    <img src={product.imageUrl} alt={product.name} loading="lazy" />
                  ) : (
                    <div className="product-placeholder">No image</div>
                  )}
                </div>
                <div className="product-body">
                  <h3>{product.name}</h3>
                  <p className="product-desc">{product.shortDescription || "Edition limitee."}</p>
                  <div className="product-row">
                    <span className="price">{formatMoney(product.price)}</span>
                    <Link className="link" to={`/product/${product.id}`}>Fiche</Link>
                  </div>
                </div>
                <button
                  className="btn primary full"
                  onClick={() => add(product, 1)}
                >
                  Ajouter au panier
                </button>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function parseProducts(xmlString) {
  const doc = new DOMParser().parseFromString(xmlString, "application/xml");
  const items = Array.from(doc.getElementsByTagName("product"));

  return items
    .map((item) => {
      const id = getText(item, "id");
      const name = getLanguageText(item.querySelector("name"));
      const price = getText(item, "price");
      const shortDescription = getLanguageText(item.querySelector("description_short"));
      const reference = getText(item, "reference");
      const imageId = getText(item, "id_default_image");
      const imageUrl = getProductImageUrl(id, imageId);

      return {
        id,
        name: name || `Produit ${id}`,
        price: price || "0",
        shortDescription,
        reference,
        imageId,
        imageUrl,
      };
    })
    .filter((product) => product.id);
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

function formatMoney(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return value || "-";
  return `${n.toFixed(2)} EUR`;
}
