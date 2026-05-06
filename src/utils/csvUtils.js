// src/utils/csvUtils.js
// -----------------------------------------------------------------------
// Utilitaires CSV pour l'import PrestaShop
// -----------------------------------------------------------------------

/**
 * Parse un fichier CSV en tableau d'objets plats.
 * Gère les champs entre guillemets (RFC 4180) et les sauts de ligne internes.
 *
 * @param {string} raw        - Contenu brut du fichier
 * @param {string} separator  - Séparateur de champ (",", ";", "\t", "|")
 * @returns {{ items: object[] }}
 */
export function parseCSV(raw, separator = ",") {
  // Normalise les fins de ligne
  const text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!text) throw new Error("Fichier CSV vide");

  const rows = splitCSVRows(text, separator);
  if (rows.length < 2) throw new Error("Le fichier doit contenir un en-tête et au moins une ligne de données");

  const headers = rows[0];
  if (headers.length === 0) throw new Error("L'en-tête CSV est vide");

  const items = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    // Ignorer les lignes totalement vides
    if (row.length === 1 && row[0] === "") continue;

    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = row[idx] !== undefined ? row[idx] : "";
    });
    items.push(obj);
  }

  if (items.length === 0) throw new Error("Aucune donnée trouvée après l'en-tête");

  return { items };
}

/**
 * Découpe le CSV en tableau de tableaux (lignes × cellules).
 * Respecte les guillemets doubles et les cellules multi-lignes.
 */
function splitCSVRows(text, sep) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        // Guillemet fermant ou doublon (escaped quote)
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        cell += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (text.startsWith(sep, i)) {
        row.push(cell.trim());
        cell = "";
        i += sep.length;
      } else if (ch === "\n") {
        row.push(cell.trim());
        rows.push(row);
        row = [];
        cell = "";
        i++;
      } else {
        cell += ch;
        i++;
      }
    }
  }
  // Dernière cellule / ligne
  if (cell !== "" || row.length > 0) {
    row.push(cell.trim());
    rows.push(row);
  }

  return rows;
}

/**
 * Construit un XML PrestaShop minimal à partir d'un item CSV (objet plat).
 *
 * Gère les champs multilingues (name, description, etc.) en créant
 * des balises <language id="1"> et <language id="2"> appropriées.
 *
 * @param {string} resource  - Nom de la ressource PrestaShop (ex: "products")
 * @param {object} item      - Objet plat { champ: valeur }
 * @returns {string}         - XML sérialisé
 */
export function buildXMLFromCSV(resource, item) {
  // Singularise de façon basique (products → product, categories → category)
  const singular = singularize(resource);

  // Champs multilingues qui doivent être structurés avec <language> tags
  const MULTILINGUAL_FIELDS = [
    "name",
    "description",
    "description_short",
    "link_rewrite",
    "meta_title",
    "meta_description",
    "meta_keywords",
    "available_now",
    "available_later",
    "delivery_in_stock",
    "delivery_out_stock",
  ];

  const fields = Object.entries(item)
    .map(([key, val]) => {
      const safeKey = sanitizeTagName(key);
      if (!safeKey) return "";
      const safeVal = escapeXML(String(val ?? ""));

      // Si le champ est multilingue, crée les balises <language>
      if (MULTILINGUAL_FIELDS.includes(key)) {
        return (
          `    <${safeKey}>\n` +
          `      <language id="1">${safeVal}</language>\n` +
          `      <language id="2">${safeVal}</language>\n` +
          `    </${safeKey}>`
        );
      }

      // Sinon, champ simple
      return `    <${safeKey}>${safeVal}</${safeKey}>`;
    })
    .filter(Boolean)
    .join("\n");

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">\n` +
    `  <${singular}>\n` +
    fields + "\n" +
    `  </${singular}>\n` +
    `</prestashop>`
  );
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

/**
 * Singularisation naïve adaptée aux ressources PrestaShop courantes.
 */
function singularize(resource) {
  const MAP = {
    products: "product",
    customers: "customer",
    orders: "order",
    addresses: "address",
    categories: "category",
    carriers: "carrier",
    manufacturers: "manufacturer",
    suppliers: "supplier",
    combinations: "combination",
    cart_rules: "cart_rule",
    specific_prices: "specific_price",
    tags: "tag",
    contacts: "contact",
  };
  return MAP[resource] ?? resource.replace(/s$/, "");
}

/**
 * Nettoie une chaîne pour en faire un nom de balise XML valide.
 * - Remplace les espaces et caractères invalides par _
 * - Préfixe par _ si commence par un chiffre
 */
function sanitizeTagName(name) {
  let tag = name.trim().replace(/[^a-zA-Z0-9_\-\.]/g, "_");
  if (/^[0-9]/.test(tag)) tag = "_" + tag;
  return tag || null;
}

/**
 * Échappe les caractères spéciaux XML.
 */
function escapeXML(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
