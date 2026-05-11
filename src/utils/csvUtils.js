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
  const text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!text) throw new Error("Fichier CSV vide");

  const rows = splitCSVRows(text, separator);
  if (rows.length < 2) throw new Error("Le fichier doit contenir un en-tête et au moins une ligne de données");

  const headers = rows[0];
  if (headers.length === 0) throw new Error("L'en-tête CSV est vide");

  const items = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
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
  if (cell !== "" || row.length > 0) {
    row.push(cell.trim());
    rows.push(row);
  }

  return rows;
}

/**
 * Construit un XML PrestaShop minimal à partir d'un item CSV (objet plat).
 *
 * @param {string} resource  - Nom de la ressource PrestaShop (ex: "products")
 * @param {object} item      - Objet plat { champ: valeur }
 * @param {object} lookups   - Tables de correspondance nom→id
 * @param {string} mode      - "create" (POST, sans id) | "update" (PUT, avec id)
 * @returns {string}         - XML sérialisé
 */
export function buildXMLFromCSV(resource, item, lookups = {}, mode = "create") {
  const singular = singularize(resource);
  const mappedItem = mapCsvItem(resource, item, lookups, mode);

  const MULTILINGUAL_FIELDS = [
    "name",
    "description",
    "description_short",
    "link_rewrite",
    "meta_title",
    "meta_description",
    "meta_keywords",
    "public_name",
    "available_now",
    "available_later",
    "delivery_in_stock",
    "delivery_out_stock",
    // suppliers/manufacturers
    "short_description",
    // stores
    "hours",
    "note",
  ];

  const fields = Object.entries(mappedItem)
    .map(([key, val]) => {
      const safeKey = sanitizeTagName(key);
      if (!safeKey) return "";
      const safeVal = escapeXML(String(val ?? ""));

      if (MULTILINGUAL_FIELDS.includes(key)) {
        return (
          `    <${safeKey}>\n` +
          `      <language id="1">${safeVal}</language>\n` +
          `      <language id="2">${safeVal}</language>\n` +
          `    </${safeKey}>`
        );
      }

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
// Mapping CSV -> champs PrestaShop
// -----------------------------------------------------------------------

const RESOURCE_FIELD_MAP = {
  addresses: {
    "address id": "id",
    "alias": "alias",
    "active": "active",
    "customer e mail": "id_customer",
    "customer email": "id_customer",
    "customer id": "id_customer",
    "manufacturer": "id_manufacturer",
    "supplier": "id_supplier",
    "company": "company",
    "lastname": "lastname",
    "last name": "lastname",
    "firstname": "firstname",
    "first name": "firstname",
    "address 1": "address1",
    "address 2": "address2",
    "zipcode": "postcode",
    "post code": "postcode",
    "city": "city",
    "country": "id_country",
    "country name": "id_country",
    "state": "id_state",
    "other": "other",
    "phone": "phone",
    "mobile phone": "phone_mobile",
    "vat number": "vat_number",
    "dni": "dni",
    "deleted": "deleted",
  },
  customers: {
    "customer id": "id",
    "active": "active",
    "titles id": "id_gender",
    "title": "id_gender",
    "gender": "id_gender",
    "email": "email",
    "password": "passwd",
    "birthday": "birthday",
    "last name": "lastname",
    "lastname": "lastname",
    "first name": "firstname",
    "firstname": "firstname",
    "newsletter": "newsletter",
    "opt in": "optin",
    "optin": "optin",
    "registration date": "date_add",
    "default group id": "id_default_group",
    "default customer group id": "id_default_group",
    "website": "website",
    "outstanding allow amount": "outstanding_allow_amount",
    "max payment days": "max_payment_days",
    "risk id": "id_risk",
    "note": "note",
    "is guest": "is_guest",
  },
  categories: {
    "category id": "id",
    "active": "active",
    "name": "name",
    "parent category": "id_parent",
    "parent category id": "id_parent",
    "root category": "is_root_category",
    "description": "description",
    "meta title": "meta_title",
    "meta keywords": "meta_keywords",
    "meta description": "meta_description",
    "url rewritten": "link_rewrite",
    "image url": "image",
    "position": "position",
  },
  suppliers: {
    "supplier id": "id",
    "active": "active",
    "name": "name",
    "description": "description",
    "meta title": "meta_title",
    "meta keywords": "meta_keywords",
    "meta description": "meta_description",
    "image url": "image",
    "short description": "short_description",
  },
  manufacturers: {
    "id": "id",
    "manufacturer id": "id",
    "active": "active",
    "name": "name",
    "description": "description",
    "short description": "short_description",
    "meta title": "meta_title",
    "meta keywords": "meta_keywords",
    "meta description": "meta_description",
    "image url": "image",
  },
  products: {
    "product id": "id",
    "active": "active",
    "name": "name",
    "price tax excluded": "price",
    "price": "price",
    "tax rules id": "id_tax_rules_group",
    "wholesale price": "wholesale_price",
    "on sale": "on_sale",
    "reference": "reference",
    "reference #": "reference",
    "supplier reference #": "supplier_reference",
    "supplier reference": "supplier_reference",
    "supplier": "id_supplier",
    "manufacturer": "id_manufacturer",
    "brand": "id_manufacturer",
    "ean13": "ean13",
    "upc": "upc",
    "isbn": "isbn",
    "mpn": "mpn",
    "ecotax": "ecotax",
    "width": "width",
    "height": "height",
    "depth": "depth",
    "weight": "weight",
    "delivery time of in stock products": "delivery_in_stock",
    "delivery time of out of stock products with allowed orders": "delivery_out_stock",
    "quantity": "quantity",
    "minimal quantity": "minimal_quantity",
    "low stock level": "low_stock_level",
    "receive a low stock alert by email": "low_stock_alert",
    "visibility": "visibility",
    "additional shipping cost": "additional_shipping_cost",
    "unity": "unity",
    "unit price": "unit_price",
    "summary": "description_short",
    "description short": "description_short",
    "description": "description",
    "tags": "tags",
    "meta title": "meta_title",
    "meta keywords": "meta_keywords",
    "meta description": "meta_description",
    "url rewritten": "link_rewrite",
    "text when in stock": "available_now",
    "text when backorder allowed": "available_later",
    "available for order": "available_for_order",
    "product available date": "available_date",
    "product creation date": "date_add",
    "show price": "show_price",
    "available online only": "online_only",
    "condition": "condition",
    "customizable": "customizable",
    "uploadable files": "uploadable_files",
    "text fields": "text_fields",
    "out of stock action": "out_of_stock",
    "virtual product": "is_virtual",
    "file url": "file_url",
    "number of allowed downloads": "nb_downloadable",
    "expiration date": "date_expiration",
    "number of days": "nb_days",
    "id shop": "id_shop_default",
    "id / name of shop": "id_shop_default",
    "advanced stock management": "advanced_stock_management",
    "depends on stock": "depends_on_stock",
    "redirect type": "redirect_type",
    "target product": "id_product_redirected",
    "category default": "id_category_default",
    "category": "id_category_default",
  },
  produits_mai26: {
    "date produit": "date_add",
    "date availability produit": "available_date",
    "nom": "name",
    "reference": "reference",
    "prix ttc": "price",
    "prix achat": "wholesale_price",
    "taxe": "id_tax_rules_group",
    "categorie": "id_category_default",
  },
  declinaisons_mai26: {
    "reference": "reference",
    "specificite": "_attribute",
    "specificit": "_attribute",
    "karazany": "_value",
    "stock initial": "quantity",
    "prix vente ttc": "price",
  },
  combinations: {
    "product id": "id_product",
    "product reference": "reference",
    "supplier reference": "supplier_reference",
    "reference": "reference",
    "ean13": "ean13",
    "upc": "upc",
    "isbn": "isbn",
    "wholesale price": "wholesale_price",
    "impact on price": "price",
    "price impact": "price",
    "ecotax": "ecotax",
    "quantity": "quantity",
    "minimal quantity": "minimal_quantity",
    "low stock level": "low_stock_level",
    "impact on weight": "weight",
    "weight impact": "weight",
    "default": "default_on",
    "combination available date": "available_date",
    "available date": "available_date",
    "image position": "image_position",
  },
  aliases: {
    "alias id": "id",
    "alias": "alias",
    "search": "search",
    "active": "active",
  },
  stores: {
    "store id": "id",
    "active": "active",
    "name": "name",
    "address1": "address1",
    "address 1": "address1",
    "address2": "address2",
    "address 2": "address2",
    "postcode": "postcode",
    "post code": "postcode",
    "state": "id_state",
    "city": "city",
    "country": "id_country",
    "latitude": "latitude",
    "longitude": "longitude",
    "phone": "phone",
    "fax": "fax",
    "email": "email",
    "note": "note",
    "hours": "hours",
    "image": "image",
  },
  // ------ Ressources supplémentaires souvent oubliées ------
  cart_rules: {
    "cart rule id": "id",
    "active": "active",
    "name": "name",
    "description": "description",
    "code": "code",
    "highlight": "highlight",
    "partial use": "partial_use",
    "priority": "priority",
    "date from": "date_from",
    "date to": "date_to",
    "minimum amount": "minimum_amount",
    "minimum amount currency": "minimum_amount_currency",
    "minimum amount tax": "minimum_amount_tax",
    "minimum amount shipping": "minimum_amount_shipping",
    "total available": "total_available",
    "total available for each user": "total_available_for_each_user",
    "reduction percent": "reduction_percent",
    "reduction amount": "reduction_amount",
    "reduction tax": "reduction_tax",
    "reduction currency": "reduction_currency",
    "free shipping": "free_shipping",
    "apply to order": "apply_discount_to_product",
    "gift product": "gift_product",
  },
  specific_prices: {
    "specific price id": "id",
    "product id": "id_product",
    "from quantity": "from_quantity",
    "from": "from",
    "to": "to",
    "reduction type": "reduction_type",
    "reduction": "reduction",
    "reduction tax": "reduction_tax",
    "price": "price",
    "id shop": "id_shop",
    "id currency": "id_currency",
    "id country": "id_country",
    "id group": "id_group",
    "id customer": "id_customer",
    "id combination": "id_product_attribute",
  },
};

// Champs numériques qui doivent être nettoyés (supprimer virgules, espaces, etc.)
const NUMERIC_FIELDS = new Set([
  "price", "wholesale_price", "unit_price", "ecotax",
  "width", "height", "depth", "weight",
  "additional_shipping_cost", "reduction", "reduction_amount",
  "minimum_amount",
]);

// Champs qui doivent être des entiers
const INTEGER_FIELDS = new Set([
  "id_tax_rules_group", "id_supplier", "id_manufacturer", "id_category_default",
  "id_parent", "id_country", "id_state", "id_customer", "id_gender",
  "id_default_group", "id_shop_default", "id_risk",
  "quantity", "minimal_quantity", "low_stock_level",
  "customizable", "uploadable_files", "text_fields",
  "nb_downloadable", "nb_days",
  "total_available", "total_available_for_each_user",
  "from_quantity", "priority",
]);

const BOOLEAN_FIELDS = new Set([
  "active", "on_sale", "is_root_category",
  "newsletter", "optin",
  "available_for_order", "show_price", "online_only",
  "customizable", "uploadable_files", "text_fields",
  "is_virtual", "advanced_stock_management", "depends_on_stock",
  "low_stock_alert", "default_on", "highlight", "partial_use",
  "free_shipping", "reduction_tax", "minimum_amount_tax", "minimum_amount_shipping",
  "is_guest", "deleted",
]);

// Champs que PrestaShop refuse en POST/PUT s'ils sont vides ou invalides
const REQUIRED_DEFAULTS = {
  products: {
    state: "1",
    id_tax_rules_group: "1",
    visibility: "both",
    condition: "new",
    available_for_order: "1",
    show_price: "1",
    out_of_stock: "2",
    minimal_quantity: "1",
  },
  categories: {
    id_parent: "2",        // Home par défaut
    is_root_category: "0",
    active: "1",
  },
  customers: {
    id_default_group: "3", // Customer group par défaut
    newsletter: "0",
    optin: "0",
  },
  addresses: {
    active: "1",
    deleted: "0",
  },
  combinations: {
    minimal_quantity: "1",
    default_on: "0",
  },
  produits_mai26: {
    state: "1",
    id_tax_rules_group: "1",
    visibility: "both",
    condition: "new",
    available_for_order: "1",
    show_price: "1",
    out_of_stock: "2",
    minimal_quantity: "1",
  },
};

// Champs à supprimer du payload (PrestaShop les calcule ou les refuse)
const FIELDS_TO_STRIP = {
  products: ["quantity", "position"],
  produits_mai26: ["quantity", "position"],
  combinations: [],
  customers: [],
  categories: [],
  addresses: [],
};

export function normalizeHeaderKey(header) {
  return header
    .replace(/\*/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

export function getNormalizedHeaders(items) {
  if (!items || items.length === 0) return new Set();
  const headers = new Set();
  Object.keys(items[0]).forEach((h) => headers.add(normalizeHeaderKey(h)));
  return headers;
}

/**
 * Mappe et nettoie un item CSV vers les champs PrestaShop.
 *
 * @param {string}  resource - Nom de la ressource
 * @param {object}  item     - Ligne CSV brute
 * @param {object}  lookups  - Tables de correspondance nom→id
 * @param {string}  mode     - "create" | "update"
 */
export function mapCsvItem(resource, item, lookups = {}, mode = "create") {
  const mapped = {};
  const fieldMap = RESOURCE_FIELD_MAP[resource] || {};

  for (const [rawKey, rawValue] of Object.entries(item)) {
    const normalizedKey = normalizeHeaderKey(rawKey);
    if (!normalizedKey) continue;

    const field = fieldMap[normalizedKey] || normalizedKey.replace(/\s+/g, "_");
    if (!field) continue;

    const trimmed = String(rawValue ?? "").trim();
    if (trimmed === "") continue;

    let value = trimmed;

    // --- Booléens ---
    if (BOOLEAN_FIELDS.has(field)) {
      value = normalizeBoolean(trimmed);
    }

    // --- Numériques décimaux : nettoyer les virgules françaises ---
    if (NUMERIC_FIELDS.has(field)) {
      value = normalizeDecimal(trimmed);
    }

    // --- Entiers ---
    const keepTaxRate = resource === "produits_mai26" && field === "id_tax_rules_group";
    if (INTEGER_FIELDS.has(field) && !BOOLEAN_FIELDS.has(field) && !keepTaxRate) {
      value = normalizeInteger(trimmed);
    }

    // --- Résolution nom→id pour les clés étrangères ---
    if (field === "id_country") {
      value = resolveIdByName(trimmed, lookups.countriesByName) || trimmed;
    } else if (field === "id_state") {
      value = resolveIdByName(trimmed, lookups.statesByName) || trimmed;
    } else if (field === "id_supplier") {
      value = resolveIdByName(trimmed, lookups.suppliersByName) || trimmed;
    } else if (field === "id_manufacturer") {
      value = resolveIdByName(trimmed, lookups.manufacturersByName) || trimmed;
    } else if (field === "id_parent") {
      // Catégories : résoudre le nom du parent
      if (!/^\d+$/.test(String(trimmed).trim())) {
        value = resolveIdByName(trimmed, lookups.categoriesByName) || "2";
      }
    } else if (field === "id_customer") {
      value = resolveIdByName(trimmed, lookups.customersByEmail) || trimmed;
    } else if (field === "id_category_default") {
      const fallback = resource === "produits_mai26" ? "2" : trimmed;
      value = resolveIdByName(trimmed, lookups.categoriesByName) || fallback;
    }

    // --- Rejeter les id_manufacturer non numériques (non résolus) ---
    if (field === "id_manufacturer" && !/^\d+$/.test(String(value).trim())) {
      continue;
    }
    // --- Idem pour id_supplier ---
    if (field === "id_supplier" && !/^\d+$/.test(String(value).trim())) {
      continue;
    }

    // --- Condition : valeurs autorisées new | used | refurbished ---
    if (field === "condition") {
      value = normalizeCondition(trimmed);
    }

    // --- Visibility : valeurs autorisées both | catalog | search | none ---
    if (field === "visibility") {
      value = normalizeVisibility(trimmed);
    }

    // --- Dates : format YYYY-MM-DD ---
    if (["date_add", "date_from", "date_to", "available_date", "date_expiration"].includes(field)) {
      value = normalizeDate(trimmed);
      if (!value) continue; // ignorer les dates invalides
    }

    // --- Prix : jamais négatif ---
    if (field === "price" && parseFloat(value) < 0) {
      value = "0.000000";
    }

    mapped[field] = value;
  }

  // --- id : conserver seulement en mode update ---
  if (mapped.id) {
    if (mode !== "update") {
      delete mapped.id;
    }
  }

  // --- Appliquer les valeurs par défaut manquantes ---
  const defaults = REQUIRED_DEFAULTS[resource] || {};
  for (const [field, defaultVal] of Object.entries(defaults)) {
    if (mapped[field] === undefined || mapped[field] === "") {
      mapped[field] = defaultVal;
    }
  }

  // --- Supprimer les champs interdits/calculés ---
  const toStrip = FIELDS_TO_STRIP[resource] || [];
  for (const f of toStrip) {
    delete mapped[f];
  }

  // --- Logique spécifique produits ---
  if (resource === "products" || resource === "produits_mai26") {
    // id_category_default : tenter de déduire depuis une colonne "categories"
    if (!mapped.id_category_default && itemHasKey(item, /categor/i)) {
      const catRaw = getFirstMatchingValue(item, /categor/i);
      const firstCategory = (catRaw || "").split(/[,;]/)[0]?.trim();
      const categoryId = resolveIdByName(firstCategory, lookups.categoriesByName);
      if (categoryId) mapped.id_category_default = categoryId;
    }

    // link_rewrite : générer depuis le nom si absent
    if (!mapped.link_rewrite && mapped.name) {
      mapped.link_rewrite = slugify(mapped.name);
    }

    // Arrondir le prix au format PrestaShop (6 décimales)
    if (mapped.price) {
      mapped.price = formatDecimal(mapped.price, 6);
    }
    if (mapped.wholesale_price) {
      mapped.wholesale_price = formatDecimal(mapped.wholesale_price, 6);
    }
  }

  if (resource === "produits_mai26" && mapped.price && mapped.id_tax_rules_group) {
    const rate = normalizeTaxRate(mapped.id_tax_rules_group);
    if (rate !== null) {
      mapped.price = ttcToHt(mapped.price, rate);
      mapped.id_tax_rules_group = resolveTaxRuleId(rate, lookups.taxRulesByRate);
    }
  }

  // --- Logique spécifique catégories ---
  if (resource === "categories") {
    if (!mapped.link_rewrite && mapped.name) {
      mapped.link_rewrite = slugify(mapped.name);
    }
  }

  // --- Logique spécifique clients ---
  if (resource === "customers") {
    // passwd : PrestaShop attend le hash md5 ou le mot de passe brut selon la version
    // On laisse tel quel ; l'appelant doit gérer le hachage si nécessaire.

    // birthday : forcer le format YYYY-MM-DD ou vider
    if (mapped.birthday) {
      mapped.birthday = normalizeDate(mapped.birthday) || "0000-00-00";
    }
  }

  // --- Logique spécifique adresses ---
  if (resource === "addresses") {
    // L'alias est obligatoire
    if (!mapped.alias) {
      mapped.alias = "Mon adresse";
    }
    // lastname et firstname obligatoires
    if (!mapped.lastname) mapped.lastname = "-";
    if (!mapped.firstname) mapped.firstname = "-";

    // PrestaShop exige toujours id_customer, id_manufacturer et id_supplier
    // même s'ils valent 0. Selon le type d'adresse :
    //   - adresse client   → id_customer = ID résolu, id_manufacturer = 0, id_supplier = 0
    //   - adresse marque   → id_manufacturer = ID résolu, id_customer = 0, id_supplier = 0
    //   - adresse fournisseur → id_supplier = ID résolu, id_customer = 0, id_manufacturer = 0

    const hasCustomer     = mapped.id_customer     && /^\d+$/.test(mapped.id_customer)     && mapped.id_customer !== "0";
    const hasManufacturer = mapped.id_manufacturer && /^\d+$/.test(mapped.id_manufacturer) && mapped.id_manufacturer !== "0";
    const hasSupplier     = mapped.id_supplier     && /^\d+$/.test(mapped.id_supplier)     && mapped.id_supplier !== "0";

    if (hasCustomer) {
      mapped.id_manufacturer = "0";
      mapped.id_supplier     = "0";
    } else if (hasManufacturer) {
      mapped.id_customer = "0";
      mapped.id_supplier = "0";
    } else if (hasSupplier) {
      mapped.id_customer     = "0";
      mapped.id_manufacturer = "0";
    } else {
      // Aucune entité résolue → id_customer non résolu (email non trouvé dans lookup)
      // On force à 0 pour éviter le rejet, et on log un avertissement
      console.warn(`[addresses] Aucun id_customer/manufacturer/supplier résolu pour alias="${mapped.alias}". id_customer forcé à 0.`);
      mapped.id_customer     = "0";
      mapped.id_manufacturer = "0";
      mapped.id_supplier     = "0";
    }

    // id_country est obligatoire et doit être numérique
    if (!mapped.id_country || !/^\d+$/.test(mapped.id_country)) {
      throw new Error(`[addresses] id_country non résolu pour alias="${mapped.alias}". Alimentez lookups.countriesByName.`);
    }
  }

  return mapped;
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

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
  };
  return MAP[resource] ?? resource.replace(/s$/, "");
}

function sanitizeTagName(name) {
  let tag = name.trim().replace(/[^a-zA-Z0-9_\-\.]/g, "_");
  if (/^[0-9]/.test(tag)) tag = "_" + tag;
  return tag || null;
}

function escapeXML(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizeBoolean(value) {
  const v = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "oui", "vrai"].includes(v)) return "1";
  if (["0", "false", "no", "n", "non", "faux"].includes(v)) return "0";
  return value;
}

/**
 * Normalise un nombre décimal : remplace la virgule par un point.
 */
function normalizeDecimal(value) {
  // Supprimer les espaces utilisés comme séparateurs de milliers
  let v = value.replace(/\s/g, "");
  // Remplacer la virgule décimale française par un point
  // Attention : "1.234,56" -> "1234.56" ; "1,234.56" -> "1234.56"
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(v)) {
    // Format européen avec point pour milliers et virgule pour décimales
    v = v.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(v)) {
    // Format américain avec virgule pour milliers et point pour décimales
    v = v.replace(/,/g, "");
  } else {
    // Virgule simple = décimale
    v = v.replace(",", ".");
  }
  const n = parseFloat(v);
  return isNaN(n) ? "0" : String(n);
}

function normalizeInteger(value) {
  const n = parseInt(String(value).replace(/[^0-9-]/g, ""), 10);
  return isNaN(n) ? "0" : String(n);
}

/**
 * Formate un nombre décimal avec le nombre de décimales souhaité.
 */
function formatDecimal(value, decimals = 6) {
  const n = parseFloat(value);
  return isNaN(n) ? "0.000000" : n.toFixed(decimals);
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

function ttcToHt(priceTTC, taxRate) {
  const rate = parseFloat(String(taxRate));
  const price = parseFloat(String(priceTTC));
  if (isNaN(rate) || isNaN(price)) return "0.000000";
  return (price / (1 + rate / 100)).toFixed(6);
}

function resolveTaxRuleId(rate, lookup) {
  if (!lookup) return String(rate);
  const key = normalizeTaxRate(rate);
  return (key && lookup[key]) ? lookup[key] : String(rate);
}

/**
 * Normalise une date vers le format YYYY-MM-DD.
 * Accepte DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD, YYYY/MM/DD.
 */
function normalizeDate(value) {
  if (!value || value === "0000-00-00" || value === "0000-00-00 00:00:00") return null;

  // Déjà au bon format
  if (/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}:\d{2})?$/.test(value)) {
    return value.slice(0, 10);
  }

  // DD/MM/YYYY ou DD-MM-YYYY
  let m = value.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const date = new Date(`${y}-${mo}-${d}`);
    if (!isNaN(date)) return `${y}-${mo}-${d}`;
  }

  // YYYY/MM/DD
  m = value.match(/^(\d{4})[\/\-](\d{2})[\/\-](\d{2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo}-${d}`;
  }

  return null;
}

function normalizeCondition(value) {
  const v = value.trim().toLowerCase();
  if (["new", "neuf", "nouveau"].includes(v)) return "new";
  if (["used", "occasion", "usagé"].includes(v)) return "used";
  if (["refurbished", "reconditionné", "reconditionne"].includes(v)) return "refurbished";
  return "new"; // valeur par défaut sûre
}

function normalizeVisibility(value) {
  const v = value.trim().toLowerCase();
  if (["both", "tous", "tout"].includes(v)) return "both";
  if (["catalog", "catalogue"].includes(v)) return "catalog";
  if (["search", "recherche"].includes(v)) return "search";
  if (["none", "aucun", "aucune"].includes(v)) return "none";
  return "both";
}

/**
 * Génère un slug URL-friendly depuis un nom.
 */
function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // supprimer accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 128);
}

function normalizeLookupKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

function resolveIdByName(value, lookup) {
  if (!lookup) return null;
  if (/^\d+$/.test(String(value).trim())) return String(value).trim();
  const key = normalizeLookupKey(value);
  return lookup[key] || null;
}

function itemHasKey(item, regex) {
  return Object.keys(item).some((k) => regex.test(k));
}

function getFirstMatchingValue(item, regex) {
  const key = Object.keys(item).find((k) => regex.test(k));
  return key ? item[key] : "";
}