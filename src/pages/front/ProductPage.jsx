import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getById, getProductImageUrl } from "../../api/prestashopClient";
import { useCart } from "../../context/CartContext";

export default function ProductPage() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { add } = useCart();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const xml = await getById("products", id);
        setProduct(parseProduct(xml));
      } catch (err) {
        setError(err?.message || "Impossible de charger la fiche produit");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [id]);

  if (loading) return <div className="panel">Chargement...</div>;
  if (error) return <div className="panel error">{error}</div>;
  if (!product) return <div className="panel">Produit introuvable.</div>;

  return (
    <section className="product-page">
      <Link className="link" to="/">Retour au catalogue</Link>
      <div className="product-layout">
        <div className="product-media large">
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={product.name} loading="lazy" />
          ) : (
            <div className="product-placeholder">No image</div>
          )}
        </div>
        <div className="product-info">
          <h1>{product.name}</h1>
          <p className="product-desc">{product.shortDescription || "Fiche detaillee a venir."}</p>
          <div className="product-row">
            <span className="price">{formatMoney(product.price)}</span>
          </div>
          <div className="qty-row">
            <button className="btn ghost" onClick={() => setQty((q) => Math.max(1, q - 1))}>-</button>
            <span>{qty}</span>
            <button className="btn ghost" onClick={() => setQty((q) => q + 1)}>+</button>
          </div>
          <button className="btn primary" onClick={() => add(product, qty)}>
            Ajouter au panier
          </button>
        </div>
      </div>
    </section>
  );
}

function parseProduct(xmlString) {
  const doc = new DOMParser().parseFromString(xmlString, "application/xml");
  const item = doc.querySelector("product");
  if (!item) return null;
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
