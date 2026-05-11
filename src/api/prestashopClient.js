// src/api/prestashopClient.js
// Tous les echanges avec l'API PrestaShop se font en XML uniquement
import { buildXML } from "../utils/xmlUtils";
import { buildXMLFromCSV, mapCsvItem } from "../utils/csvUtils";

const BASE_URL = "http://localhost:88/prestashop_edition_classic_version_8.2.6/api";
const WS_KEY   = "BWETJ42HT3VT13BRDRW3B68U9LT312MU";

const AUTH_HEADER = "Basic " + btoa(WS_KEY + ":");

const HEADERS = {
  Authorization: AUTH_HEADER,
};

const HEADERS_XML = {
  Authorization:  AUTH_HEADER,
  "Content-Type": "application/xml",
};

// Timeout par defaut pour les requetes (5 secondes)
const FETCH_TIMEOUT = 5000;

// ---------------------------------------------------------------------------
// parseIdsFromXML — extrait la liste des IDs depuis une reponse XML
// PrestaShop retourne :
// <prestashop><products><product id="1" xlink:href="..."/></products></prestashop>
// ---------------------------------------------------------------------------
function parseIdsFromXML(xmlString) {
  const parser = new DOMParser();
  const doc    = parser.parseFromString(xmlString, "application/xml");

  const error = doc.querySelector("parsererror");
  if (error) throw new Error("XML invalide : " + error.textContent);

  const ids  = [];
  const root = doc.documentElement; // <prestashop>

  if (root.children.length > 0) {
    const container = root.children[0]; // ex: <products>
    Array.from(container.children).forEach((el) => {
      const id = el.getAttribute("id");
      if (id) ids.push(id);
    });
  }

  return ids;
}

// ---------------------------------------------------------------------------
// Helper : fetch avec timeout
// ---------------------------------------------------------------------------
async function fetchWithTimeout(url, options = {}, timeout = FETCH_TIMEOUT) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw new Error(`Request timeout after ${timeout}ms`);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// getAllIds — recupere tous les IDs d'une ressource via XML
// Gere la pagination pour les grands ensembles de donnees
// ---------------------------------------------------------------------------
export async function getAllIds(resource) {
  const ids = [];
  let page = 1;
  const limit = 50; // Reduit de 100 a 50 pour eviter les surcharges

  while (true) {
    try {
      const url = `${BASE_URL}/${resource}?limit=${limit}&page=${page}`;
      console.log(`[getAllIds] Fetching ${resource} page ${page}...`);
      
      const res = await fetchWithTimeout(url, { headers: HEADERS }, FETCH_TIMEOUT);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const xml = await res.text();
      const pageIds = parseIdsFromXML(xml);
      
      console.log(`[getAllIds] Page ${page}: got ${pageIds.length} IDs`);
      
      if (pageIds.length === 0) break; // Plus de resultats
      
      ids.push(...pageIds);
      page++;
      
      // Limite de securite : maximum 10 pages (500 resultats)
      if (page > 10) {
        console.warn(`[getAllIds] Reached maximum page limit for ${resource}`);
        break;
      }
    } catch (err) {
      console.error(`[getAllIds] Error fetching ${resource} page ${page}:`, err.message);
      throw err;
    }
  }

  return ids;
}

// ---------------------------------------------------------------------------
// getById — recupere une entree complete en XML (string XML brut)
// ---------------------------------------------------------------------------
export async function getById(resource, id) {
  const res = await fetchWithTimeout(`${BASE_URL}/${resource}/${id}`, {
    headers: HEADERS,
  });

  if (!res.ok) throw new Error(`GET ${resource}/${id} failed: HTTP ${res.status}`);

  return res.text();
}

// ---------------------------------------------------------------------------
// getAll — recupere toutes les entrees d'une ressource (display=full)
// Retourne le string XML brut
// ---------------------------------------------------------------------------
export async function getAll(resource) {
  const res = await fetchWithTimeout(`${BASE_URL}/${resource}?display=full`, {
    headers: HEADERS,
  });

  if (!res.ok) throw new Error(`GET ${resource} failed: HTTP ${res.status}`);

  return res.text();
}

// ---------------------------------------------------------------------------
// createFromXml — cree une entree depuis un string XML
// Retourne le XML de la reponse (entree creee avec son nouvel ID)
// ---------------------------------------------------------------------------
export async function createFromXml(resource, xmlString) {
  const res = await fetchWithTimeout(`${BASE_URL}/${resource}`, {
    method:  "POST",
    headers: HEADERS_XML,
    body:    xmlString,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${resource} failed: HTTP ${res.status} — ${text}`);
  }

  return res.text();
}

// ---------------------------------------------------------------------------
// updateFromXml — met a jour une entree depuis un string XML
// ---------------------------------------------------------------------------
export async function updateFromXml(resource, id, xmlString) {
  const res = await fetchWithTimeout(`${BASE_URL}/${resource}/${id}`, {
    method:  "PUT",
    headers: HEADERS_XML,
    body:    xmlString,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PUT ${resource}/${id} failed: HTTP ${res.status} — ${text}`);
  }

  return res.text();
}

// ---------------------------------------------------------------------------
// deleteById — supprime une entree par ID
// ---------------------------------------------------------------------------
export async function deleteById(resource, id) {
  const res = await fetchWithTimeout(`${BASE_URL}/${resource}/${id}`, {
    method:  "DELETE",
    headers: HEADERS,
  });

  // 404 = deja supprime, on ignore
  if (res.status === 404) return true;

  if (!res.ok) throw new Error(`DELETE ${resource}/${id} failed: HTTP ${res.status}`);

  return true;
}

// ---------------------------------------------------------------------------
// getProductImageUrl — construit l'URL d'image pour un produit
// ---------------------------------------------------------------------------
export function getProductImageUrl(productId, imageId) {
  if (!productId || !imageId) return "";
  return `${BASE_URL}/images/products/${productId}/${imageId}`;
}

//id protegee
const PROTECTED_IDS = {
  categories: ["1", "2"],  // racine et home
  shops:      ["1"],
  languages:  ["1"],
};

// ---------------------------------------------------------------------------
// deleteAll — supprime toutes les entrees d'une ressource
// onProgress : callback({ deleted, total, errors })
// Retourne   : { deleted, total, errors }
// ---------------------------------------------------------------------------
export async function deleteAll(resource, onProgress) {
  const allIds     = await getAllIds(resource);
  const protected_ = PROTECTED_IDS[resource] || [];
  const ids        = allIds.filter((id) => !protected_.includes(String(id)));
  let deleted      = 0;
  const errors     = [];
  const total      = ids.length;
 
  for (const id of ids) {
    try {
      await deleteById(resource, id);
      deleted++;
    } catch (err) {
      errors.push({ id, error: err.message });
    }
    if (onProgress) onProgress({ deleted, total, errors });
  }
 
  return { deleted, total, errors };
}

// ---------------------------------------------------------------------------
// getSchema — recupere le schema vide d'une ressource
// Utile pour connaitre les champs requis avant un import
// ---------------------------------------------------------------------------
export async function getSchema(resource) {
  const res = await fetchWithTimeout(`${BASE_URL}/${resource}?schema=blank`, {
    headers: HEADERS,
  });

  if (!res.ok) throw new Error(`GET schema ${resource} failed: HTTP ${res.status}`);

  return res.text();
}

// ---------------------------------------------------------------------------
// getLookupMap — recupere une map { key -> id } (ex: nom pays -> id)
// keyField: "name", "email", etc.
// ---------------------------------------------------------------------------
export async function getLookupMap(resource, options = {}) {
  const { keyField = "name", languageId = "1" } = options;
  const xml = await getAll(resource);

  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) throw new Error("XML invalide : " + parseError.textContent);

  const singular = singularize(resource);
  const items = Array.from(doc.getElementsByTagName(singular));
  const map = {};

  items.forEach((item) => {
    const id = item.querySelector("id")?.textContent?.trim();
    if (!id) return;

    const value = extractFieldValue(item, keyField, languageId);
    if (!value) return;

    map[value.toLowerCase()] = id;
  });

  return map;
}

// ---------------------------------------------------------------------------
// getTaxRulesByRate — recupere une map { rate -> id }
// ---------------------------------------------------------------------------
export async function getTaxRulesByRate() {
  const xml = await getAll("taxes");
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) throw new Error("XML invalide : " + parseError.textContent);

  const items = Array.from(doc.getElementsByTagName("tax"));
  const map = {};

  items.forEach((item) => {
    const id = item.querySelector("id")?.textContent?.trim();
    const rate = item.querySelector("rate")?.textContent?.trim();
    if (!id || !rate) return;
    const key = normalizeTaxRate(rate);
    if (key) map[key] = id;
  });

  return map;
}

// ---------------------------------------------------------------------------
// uploadProductImage — envoie une image vers /api/images/products/{id}
// ---------------------------------------------------------------------------
export async function uploadProductImage(productId, fileBlob, fileName) {
  const form = new FormData();
  form.append("image", fileBlob, fileName);

  const res = await fetchWithTimeout(`${BASE_URL}/images/products/${productId}`, {
    method: "POST",
    headers: { Authorization: AUTH_HEADER },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST images/products/${productId} failed: HTTP ${res.status} — ${text}`);
  }

  return res.text();
}

// ---------------------------------------------------------------------------
// getStockAvailableId — recupere l'id stock_available pour un produit/declinaison
// ---------------------------------------------------------------------------
export async function getStockAvailableId(productId, productAttributeId = "0") {
  const url = `${BASE_URL}/stock_availables?display=[id,id_product,id_product_attribute]` +
    `&filter[id_product]=${encodeURIComponent(productId)}` +
    `&filter[id_product_attribute]=${encodeURIComponent(productAttributeId)}`;

  const res = await fetchWithTimeout(url, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`GET stock_availables failed: HTTP ${res.status}`);
  }

  const xml = await res.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) throw new Error("XML invalide : " + parseError.textContent);

  const node = doc.querySelector("stock_available > id");
  return node?.textContent?.trim() || null;
}

// ---------------------------------------------------------------------------
// setStockAvailableQuantity — met a jour la quantite d'un stock_available
// ---------------------------------------------------------------------------
export async function setStockAvailableQuantity(productId, productAttributeId, quantity) {
  const stockId = await getStockAvailableId(productId, productAttributeId);
  if (!stockId) {
    throw new Error(`stock_available introuvable pour produit=${productId} attr=${productAttributeId}`);
  }

  const xml = await getById("stock_availables", stockId);
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) throw new Error("XML invalide : " + parseError.textContent);

  const qtyNode = doc.querySelector("quantity");
  if (qtyNode) {
    qtyNode.textContent = String(quantity ?? "0");
  }

  const serializer = new XMLSerializer();
  let payload = serializer.serializeToString(doc);
  if (!payload.startsWith("<?xml")) {
    payload = `<?xml version="1.0" encoding="UTF-8"?>\n${payload}`;
  }

  await updateFromXml("stock_availables", stockId, payload);
  return stockId;
}

// ---------------------------------------------------------------------------
// createCombinationFromRow — cree option, valeur, puis combinaison
// ---------------------------------------------------------------------------
export async function createCombinationFromRow(item, productIdMap, lookups = {}) {
  const mapped = mapCsvItem("declinaisons_mai26", item, lookups, "create");
  const ref = mapped.reference;
  if (!ref) throw new Error("[declinaisons] reference manquante");

  const productId = productIdMap[normalizeLookupKey(ref)];
  if (!productId) throw new Error(`[declinaisons] produit introuvable pour reference=${ref}`);

  const attributeName = mapped._attribute;
  const attributeValue = mapped._value;
  if (!attributeName || !attributeValue) {
    throw new Error(`[declinaisons] attribut ou valeur manquants pour reference=${ref}`);
  }

  const optionId = await getOrCreateProductOption(attributeName, lookups);
  const valueId = await getOrCreateProductOptionValue(optionId, attributeValue, lookups);

  const combination = {
    id_product: String(productId),
    reference: mapped.reference,
    price: mapped.price ?? "0.000000",
    quantity: mapped.quantity ?? "0",
    associations: {
      product_option_values: {
        product_option_value: [{ id: String(valueId) }],
      },
    },
  };

  const xml = buildXML("combinations", combination);
  return createFromXml("combinations", xml);
}

async function getOrCreateProductOption(name, lookups) {
  if (!lookups.productOptionsByName) {
    lookups.productOptionsByName = await getLookupMap("product_options", { keyField: "name" });
  }

  const key = normalizeLookupKey(name);
  const existing = lookups.productOptionsByName[key];
  if (existing) return existing;

  const xml = buildXMLFromCSV("product_options", {
    name,
    public_name: name,
  });
  const res = await createFromXml("product_options", xml);
  const id = parseCreatedId(res);
  if (!id) throw new Error(`[product_options] impossible de recuperer l'id pour ${name}`);

  lookups.productOptionsByName[key] = id;
  return id;
}

async function getOrCreateProductOptionValue(optionId, valueName, lookups) {
  if (!lookups.productOptionValuesByGroup) {
    lookups.productOptionValuesByGroup = {};
  }
  if (!lookups.productOptionValuesByGroup[optionId]) {
    lookups.productOptionValuesByGroup[optionId] = await getOptionValuesMap(optionId);
  }

  const key = normalizeLookupKey(valueName);
  const existing = lookups.productOptionValuesByGroup[optionId][key];
  if (existing) return existing;

  const xml = buildXMLFromCSV("product_option_values", {
    name: valueName,
    id_attribute_group: String(optionId),
  });
  const res = await createFromXml("product_option_values", xml);
  const id = parseCreatedId(res);
  if (!id) throw new Error(`[product_option_values] impossible de recuperer l'id pour ${valueName}`);

  lookups.productOptionValuesByGroup[optionId][key] = id;
  return id;
}

async function getOptionValuesMap(optionId) {
  const xml = await getAll("product_option_values");
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) throw new Error("XML invalide : " + parseError.textContent);

  const items = Array.from(doc.getElementsByTagName("product_option_value"));
  const map = {};

  items.forEach((item) => {
    const id = item.querySelector("id")?.textContent?.trim();
    const groupId = item.querySelector("id_attribute_group")?.textContent?.trim();
    if (!id || !groupId || String(groupId) !== String(optionId)) return;
    const name = extractFieldValue(item, "name", "1");
    if (!name) return;
    map[normalizeLookupKey(name)] = id;
  });

  return map;
}

export function parseCreatedId(xmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "application/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) return null;
  return doc.querySelector("id")?.textContent?.trim() || null;
}

function normalizeLookupKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeTaxRate(value) {
  const cleaned = String(value ?? "")
    .replace(/%/g, "")
    .replace(/\s/g, "")
    .replace(/,/g, ".")
    .trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : String(n);
}

function findChild(parent, tagName) {
  const lower = tagName.toLowerCase();
  for (const child of Array.from(parent.children || [])) {
    if (child.nodeName.toLowerCase() === lower) return child;
  }
  return null;
}

function extractFieldValue(item, fieldName, languageId) {
  const field = findChild(item, fieldName);
  if (!field) return null;

  // Itère les enfants directs pour trouver <language id="X">
  // querySelector est case-sensitive en XML et peut rater les CDATA
  for (const node of Array.from(field.childNodes)) {
    if (
      node.nodeType === 1 &&
      node.nodeName.toLowerCase() === "language" &&
      node.getAttribute("id") === String(languageId)
    ) {
      const text = node.textContent && node.textContent.trim();
      if (text) return text;
    }
  }

  // Champ simple (email, reference…) : TEXT_NODE directs uniquement
  // évite la concaténation de toutes les langues via textContent global
  const directText = Array.from(field.childNodes)
    .filter((n) => n.nodeType === 3)
    .map((n) => n.textContent.trim())
    .filter(Boolean)
    .join("");
  if (directText) return directText;

  // Fallback : CDATA sans enfants éléments
  const full = field.textContent && field.textContent.trim();
  return full || null;
}

// ---------------------------------------------------------------------------
// getProductIdByReference — cherche un produit existant par sa reference
// Retourne l'id (string) ou null si introuvable
// ---------------------------------------------------------------------------
export async function getProductIdByReference(reference) {
  const url = `${BASE_URL}/products?display=[id,reference]&filter[reference]=${encodeURIComponent(reference)}`;
  const res = await fetchWithTimeout(url, { headers: HEADERS });

  if (!res.ok) {
    throw new Error(`GET products?filter[reference]=${reference} failed: HTTP ${res.status}`);
  }

  const xml = await res.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) throw new Error("XML invalide : " + parseError.textContent);

  const products = Array.from(doc.getElementsByTagName("product"));
  for (const product of products) {
    const ref = product.querySelector("reference")?.textContent?.trim();
    const id  = product.querySelector("id")?.textContent?.trim();
    if (ref === reference && id) return id;
  }

  return null;
}

// ---------------------------------------------------------------------------
// getActiveCountryId — cherche un pays actif par nom ou code ISO
// ---------------------------------------------------------------------------
export async function getActiveCountryId(name, isoCode) {
  const xml = await getAll("countries");
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) throw new Error("XML invalide : " + parseError.textContent);

  const countries = Array.from(doc.getElementsByTagName("country"));
  const nameKey = String(name || "").trim().toLowerCase();
  const isoKey = String(isoCode || "").trim().toUpperCase();

  for (const country of countries) {
    const active = country.querySelector("active")?.textContent?.trim();
    if (active !== "1") continue;
    const cname = country.querySelector("name")?.textContent?.trim().toLowerCase();
    const iso = country.querySelector("iso_code")?.textContent?.trim().toUpperCase();
    if (nameKey && cname === nameKey) return country.querySelector("id")?.textContent?.trim() || null;
    if (isoKey && iso === isoKey) return country.querySelector("id")?.textContent?.trim() || null;
  }

  // fallback: first active country
  for (const country of countries) {
    const active = country.querySelector("active")?.textContent?.trim();
    if (active === "1") {
      return country.querySelector("id")?.textContent?.trim() || null;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// getCustomerIdByEmail — cherche un client existant par email
// ---------------------------------------------------------------------------
export async function getCustomerIdByEmail(email) {
  const url = `${BASE_URL}/customers?display=[id,email]&filter[email]=${encodeURIComponent(email)}`;
  const res = await fetchWithTimeout(url, { headers: HEADERS });

  if (!res.ok) {
    throw new Error(`GET customers?filter[email]=${email} failed: HTTP ${res.status}`);
  }

  const xml = await res.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) throw new Error("XML invalide : " + parseError.textContent);

  const nodes = Array.from(doc.getElementsByTagName("customer"));
  for (const node of nodes) {
    const e = node.querySelector("email")?.textContent?.trim();
    const id = node.querySelector("id")?.textContent?.trim();
    if (e && id && e.toLowerCase() === String(email).toLowerCase()) return id;
  }

  return null;
}

// ---------------------------------------------------------------------------
// createCustomerFromData — cree un client et retourne son id
// ---------------------------------------------------------------------------
export async function createCustomerFromData(data) {
  const xml = buildXMLFromCSV("customers", {
    firstname: data.firstname,
    lastname: data.lastname,
    email: data.email,
    passwd: data.passwd,
    active: "1",
  });
  const res = await createFromXml("customers", xml);
  return parseCreatedId(res);
}

// ---------------------------------------------------------------------------
// getCustomerSecureKey — recupere le secure_key d'un client
// ---------------------------------------------------------------------------
export async function getCustomerSecureKey(customerId) {
  const xml = await getById("customers", customerId);
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) throw new Error("XML invalide : " + parseError.textContent);
  return doc.querySelector("secure_key")?.textContent?.trim() || "";
}

// ---------------------------------------------------------------------------
// createAddressFromData — cree une adresse client
// ---------------------------------------------------------------------------
export async function createAddressFromData(data) {
  const xml = buildXMLFromCSV("addresses", {
    id_customer: data.id_customer,
    alias: data.alias,
    firstname: data.firstname,
    lastname: data.lastname,
    address1: data.address1,
    city: data.city,
    postcode: data.postcode,
    id_country: data.id_country,
    active: "1",
    deleted: "0",
  });
  const res = await createFromXml("addresses", xml);
  return parseCreatedId(res);
}

// ---------------------------------------------------------------------------
// createCartFromItems — cree un panier avec ses lignes
// ---------------------------------------------------------------------------
export async function createCartFromItems(data) {
  const cart = {
    id_customer: String(data.id_customer),
    id_address_delivery: String(data.id_address_delivery),
    id_address_invoice: String(data.id_address_invoice),
    id_currency: String(data.id_currency || "1"),
    id_lang: String(data.id_lang || "1"),
    id_carrier: String(data.id_carrier || "1"),
    id_shop: String(data.id_shop || "1"),
    id_shop_group: String(data.id_shop_group || "1"),
    associations: {
      cart_rows: {
        cart_row: data.items.map((item) => ({
          id_product: String(item.productId),
          id_product_attribute: String(item.productAttributeId || "0"),
          quantity: String(item.quantity || "1"),
        })),
      },
    },
  };

  const xml = buildXML("carts", cart);
  const res = await createFromXml("carts", xml);
  return parseCreatedId(res);
}

// ---------------------------------------------------------------------------
// createOrderFromCart — cree une commande depuis un panier
// ---------------------------------------------------------------------------
export async function createOrderFromCart(data) {
  const order = {
    id_customer: String(data.id_customer),
    id_address_delivery: String(data.id_address_delivery),
    id_address_invoice: String(data.id_address_invoice),
    id_cart: String(data.id_cart),
    id_currency: String(data.id_currency || "1"),
    id_lang: String(data.id_lang || "1"),
    id_carrier: String(data.id_carrier || "1"),
    id_shop: String(data.id_shop || "1"),
    id_shop_group: String(data.id_shop_group || "1"),
    current_state: String(data.current_state),
    payment: data.payment,
    module: data.module || "ps_checkpayment",
    conversion_rate: "1",
    secure_key: data.secure_key || "",
    total_paid: data.total_paid,
    total_paid_real: data.total_paid,
    total_paid_tax_incl: data.total_paid_tax_incl,
    total_paid_tax_excl: data.total_paid_tax_excl,
    total_products: data.total_products,
    total_products_wt: data.total_products_wt,
    total_shipping: "0",
    total_shipping_tax_incl: "0",
    total_shipping_tax_excl: "0",
    total_discounts: "0",
    total_discounts_tax_incl: "0",
    total_discounts_tax_excl: "0",
    total_wrapping: "0",
    total_wrapping_tax_incl: "0",
    total_wrapping_tax_excl: "0",
    round_mode: "2",
    round_type: "2",
    valid: data.valid || "0",
    associations: {
      order_rows: {
        order_row: data.items.map((item) => ({
          product_id: String(item.productId),
          product_attribute_id: String(item.productAttributeId || "0"),
          product_quantity: String(item.quantity || "1"),
          product_name: item.name,
          product_reference: item.reference,
          product_price: item.price,
          unit_price_tax_excl: item.price,
          unit_price_tax_incl: computeTaxIncl(item.price, item.taxRate),
          total_price_tax_excl: computeLineTotal(item.price, item.quantity),
          total_price_tax_incl: computeTaxIncl(computeLineTotal(item.price, item.quantity), item.taxRate),
          product_quantity_in_stock: String(item.quantity || "1"),
          product_weight: "0",
          tax_name: item.taxRate ? `Tax ${item.taxRate}%` : "Tax 0%",
          tax_rate: String(item.taxRate || "0"),
        })),
      },
    },
  };

  const xml = buildXML("orders", order);
  const res = await createFromXml("orders", xml);
  return parseCreatedId(res);
}

// ---------------------------------------------------------------------------
// createOrderHistory — force un etat de commande
// ---------------------------------------------------------------------------
export async function createOrderHistory(orderId, stateId, employeeId = "0") {
  const history = {
    id_order: String(orderId),
    id_order_state: String(stateId),
    id_employee: String(employeeId),
  };
  const xml = buildXML("order_histories", history);
  const res = await createFromXml("order_histories", xml);
  return parseCreatedId(res);
}

function computeLineTotal(price, quantity) {
  const p = parseFloat(String(price || "0"));
  const q = parseFloat(String(quantity || "0"));
  if (isNaN(p) || isNaN(q)) return "0.000000";
  return (p * q).toFixed(6);
}

function computeTaxIncl(price, taxRate) {
  const p = parseFloat(String(price || "0"));
  const r = parseFloat(String(taxRate || "0"));
  if (isNaN(p) || isNaN(r)) return "0.000000";
  return (p * (1 + r / 100)).toFixed(6);
}

// ---------------------------------------------------------------------------
// getCombinationIdByValue — trouve la declinaison pour un id valeur
// ---------------------------------------------------------------------------
export async function getCombinationIdByValue(productId, valueId) {
  const url = `${BASE_URL}/combinations?display=full&filter[id_product]=${encodeURIComponent(productId)}`;
  const res = await fetchWithTimeout(url, { headers: HEADERS });

  if (!res.ok) {
    throw new Error(`GET combinations failed: HTTP ${res.status}`);
  }

  const xml = await res.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) throw new Error("XML invalide : " + parseError.textContent);

  const combos = Array.from(doc.getElementsByTagName("combination"));
  for (const combo of combos) {
    const id = combo.querySelector("id")?.textContent?.trim();
    const valueNodes = combo.querySelectorAll("product_option_values > product_option_value > id");
    for (const node of Array.from(valueNodes)) {
      if (node.textContent?.trim() === String(valueId)) return id || null;
    }
  }

  return null;
}

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
    aliases: "alias",
    stores: "store",
    countries: "country",
    states: "state",
  };
  return MAP[resource] ?? resource.replace(/s$/, "");
}