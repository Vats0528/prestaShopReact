// src/utils/xmlUtils.js
// Utilitaires pour parser le XML recu et construire le XML a envoyer a PrestaShop

// ---------------------------------------------------------------------------
// parseXML — convertit un string XML en tableau d'objets JS
// Retourne { resource: string, items: Array<Object> }
// ---------------------------------------------------------------------------
export function parseXML(xmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "application/xml");

  // Verifier les erreurs de parsing
  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error("XML invalide : " + parseError.textContent);
  }

  const root = doc.documentElement; // <prestashop>
  if (!root || root.tagName !== "prestashop") {
    throw new Error('Le XML doit avoir <prestashop> comme element racine');
  }

  // Detecter la ressource : premier enfant de <prestashop>
  // Ex: <prestashop><products><product>...</product></products></prestashop>
  // ou: <prestashop><product>...</product><product>...</product></prestashop>
  const firstChild = root.children[0];
  if (!firstChild) throw new Error("Le XML est vide");

  let resourceName = "";
  let itemElements = [];

  // Cas 1 : <prestashop><products><product>...</product></products></prestashop>
  if (firstChild.children.length > 0 && firstChild.children[0].tagName === firstChild.tagName.slice(0, -1)) {
    resourceName = firstChild.tagName; // "products"
    itemElements = Array.from(firstChild.children);
  }
  // Cas 2 : <prestashop><product>...</product><product>...</product></prestashop>
  else if (root.children.length > 0) {
    resourceName = root.children[0].tagName + "s"; // "product" -> "products"
    itemElements = Array.from(root.children);
  }

  const items = itemElements.map((el) => elementToObject(el));

  return { resource: resourceName, items };
}

// ---------------------------------------------------------------------------
// elementToObject — convertit un element XML en objet JS recursif
// ---------------------------------------------------------------------------
function elementToObject(element) {
  const obj = {};

  // Attributs XML
  Array.from(element.attributes).forEach((attr) => {
    obj[`@${attr.name}`] = attr.value;
  });

  if (element.children.length === 0) {
    // Noeud feuille — retourner la valeur texte
    const text = element.textContent.trim();
    return text || obj;
  }

  // Enfants
  Array.from(element.children).forEach((child) => {
    const key = child.tagName;
    const value = elementToObject(child);

    if (obj[key] !== undefined) {
      // Plusieurs enfants du meme nom → tableau
      if (!Array.isArray(obj[key])) obj[key] = [obj[key]];
      obj[key].push(value);
    } else {
      obj[key] = value;
    }
  });

  return obj;
}

// ---------------------------------------------------------------------------
// buildXML — construit le XML a envoyer a PrestaShop depuis un objet JS
// resource : "products", "customers", etc.
// item     : objet JS representant une entree
// ---------------------------------------------------------------------------
export function buildXML(resource, item) {
  // resource "products" -> singular "product"
  if (resource === "products") {
    item = { ...item, state: item.state || "1" };
  }
  // resource "products" -> singular "product"
  const singular = resource.endsWith("ies")
    ? resource.slice(0, -3) + "y"
    : resource.endsWith("s")
    ? resource.slice(0, -1)
    : resource;

  const inner = objectToXML(item, singular);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">\n${inner}\n</prestashop>`;
}

// ---------------------------------------------------------------------------
// objectToXML — convertit un objet JS en string XML recursif
// ---------------------------------------------------------------------------
function objectToXML(obj, tagName) {
  if (typeof obj === "string" || typeof obj === "number") {
    return `<${tagName}>${escapeXML(String(obj))}</${tagName}>`;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => objectToXML(item, tagName)).join("\n");
  }

  if (typeof obj === "object" && obj !== null) {
    // Separer attributs (@key) et enfants
    const attrs = Object.entries(obj)
      .filter(([k]) => k.startsWith("@"))
      .map(([k, v]) => `${k.slice(1)}="${escapeXML(String(v))}"`)
      .join(" ");

    const children = Object.entries(obj)
      .filter(([k]) => !k.startsWith("@"))
      .map(([k, v]) => objectToXML(v, k))
      .join("\n  ");

    const openTag = attrs ? `<${tagName} ${attrs}>` : `<${tagName}>`;
    return `${openTag}\n  ${children}\n</${tagName}>`;
  }

  return `<${tagName}></${tagName}>`;
}

// ---------------------------------------------------------------------------
// escapeXML — echapper les caracteres speciaux XML
// ---------------------------------------------------------------------------
function escapeXML(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ---------------------------------------------------------------------------
// getPreviewColumns — extrait les colonnes a afficher dans le tableau preview
// Prend le premier item et retourne les cles de premier niveau
// ---------------------------------------------------------------------------
export function getPreviewColumns(items) {
  if (!items || items.length === 0) return [];
  const first = items[0];
  return Object.keys(first).filter((k) => !k.startsWith("@")).slice(0, 8); // max 8 colonnes
}

// ---------------------------------------------------------------------------
// getCellValue — extrait la valeur affichable d'une cellule
// ---------------------------------------------------------------------------
export function getCellValue(item, col) {
  const val = item[col];
  if (val === undefined || val === null) return "—";
  if (typeof val === "string" || typeof val === "number") return String(val);
  if (typeof val === "object") return JSON.stringify(val).slice(0, 60) + "...";
  return "—";
}