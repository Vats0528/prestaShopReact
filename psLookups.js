// src/utils/psLookups.js
// -----------------------------------------------------------------------
// Construction automatique des tables de correspondance nom→id
// pour l'import PrestaShop via WebService API
// -----------------------------------------------------------------------

/**
 * @typedef {Object} Lookups
 * @property {Record<string,string>} manufacturersByName  - nom en minuscules → id
 * @property {Record<string,string>} suppliersByName      - nom en minuscules → id
 * @property {Record<string,string>} categoriesByName     - nom en minuscules → id
 * @property {Record<string,string>} countriesByName      - nom en minuscules → id
 * @property {Record<string,string>} statesByName         - nom en minuscules → id
 * @property {Record<string,string>} customersByEmail     - email en minuscules → id
 */

// -----------------------------------------------------------------------
// ⚙️  CONFIGURATION — à adapter à votre boutique
// -----------------------------------------------------------------------
const PS_URL = "http://localhost:88/prestashop_edition_classic_version_8.2.6/api"; // sans slash final
const API_KEY = "BWETJ42HT3VT13BRDRW3B68U9LT312MU";  // clé WebService (lecture suffisante)
// -----------------------------------------------------------------------

const AUTH_HEADER = "Basic " + btoa(API_KEY + ":");

/**
 * Récupère une ressource PrestaShop et retourne le tableau d'objets.
 *
 * @param {string}   resource - ex: "manufacturers"
 * @param {string[]} fields   - ex: ["id", "name"]
 * @returns {Promise<object[]>}
 */
async function fetchPS(resource, fields) {
  const url =
    `${PS_URL}/api/${resource}` +
    `?display=[${fields.join(",")}]` +
    `&output_format=JSON`;

  const res = await fetch(url, {
    headers: { Authorization: AUTH_HEADER },
  });

  if (!res.ok) {
    throw new Error(
      `GET /api/${resource} a échoué : HTTP ${res.status} — ${await res.text()}`
    );
  }

  const data = await res.json();
  return data[resource] || [];
}

/**
 * Construit un dictionnaire { "nom en minuscules": "id" }
 * depuis un tableau d'objets { id, name }.
 */
function byName(items) {
  const map = {};
  for (const item of items) {
    if (item.name) {
      map[String(item.name).trim().toLowerCase()] = String(item.id);
    }
  }
  return map;
}

/**
 * Construit un dictionnaire { "email en minuscules": "id" }
 * depuis un tableau d'objets { id, email }.
 */
function byEmail(items) {
  const map = {};
  for (const item of items) {
    if (item.email) {
      map[String(item.email).trim().toLowerCase()] = String(item.id);
    }
  }
  return map;
}

// -----------------------------------------------------------------------
// Fonctions de lookup individuelles (utiles pour les rafraîchissements partiels)
// -----------------------------------------------------------------------

export async function fetchManufacturersByName() {
  const items = await fetchPS("manufacturers", ["id", "name"]);
  return byName(items);
}

export async function fetchSuppliersByName() {
  const items = await fetchPS("suppliers", ["id", "name"]);
  return byName(items);
}

export async function fetchCategoriesByName() {
  const items = await fetchPS("categories", ["id", "name"]);
  return byName(items);
}

export async function fetchCountriesByName() {
  // PrestaShop retourne les pays avec un champ "name" multilingue
  // On récupère display=full pour avoir le nom natif
  const url =
    `${PS_URL}/api/countries` +
    `?display=full` +
    `&output_format=JSON`;

  const res = await fetch(url, { headers: { Authorization: AUTH_HEADER } });
  if (!res.ok) throw new Error(`GET /api/countries échoué : HTTP ${res.status}`);

  const data = await res.json();
  const map = {};
  for (const country of data.countries || []) {
    // Le champ name est un tableau de { id, value } (multilingue)
    const names = Array.isArray(country.name)
      ? country.name
      : [{ value: country.name }];
    for (const n of names) {
      const v = n.value || n;
      if (v) map[String(v).trim().toLowerCase()] = String(country.id);
    }
  }
  return map;
}

export async function fetchStatesByName() {
  const url =
    `${PS_URL}/api/states` +
    `?display=full` +
    `&output_format=JSON`;

  const res = await fetch(url, { headers: { Authorization: AUTH_HEADER } });
  if (!res.ok) throw new Error(`GET /api/states échoué : HTTP ${res.status}`);

  const data = await res.json();
  const map = {};
  for (const state of data.states || []) {
    const names = Array.isArray(state.name)
      ? state.name
      : [{ value: state.name }];
    for (const n of names) {
      const v = n.value || n;
      if (v) map[String(v).trim().toLowerCase()] = String(state.id);
    }
  }
  return map;
}

export async function fetchCustomersByEmail() {
  const items = await fetchPS("customers", ["id", "email"]);
  return byEmail(items);
}

export async function fetchProductsByReference() {
  const items = await fetchPS("products", ["id", "reference"]);
  const map = {};
  for (const p of items) {
    if (p.reference) {
      map[String(p.reference).trim().toLowerCase()] = String(p.id);
    }
  }
  return map;
}

// -----------------------------------------------------------------------
// Fonction principale : construit TOUS les lookups en parallèle
// -----------------------------------------------------------------------

/**
 * Construit l'objet lookups complet à passer à mapCsvItem / buildXMLFromCSV.
 *
 * Appeler cette fonction :
 *   - une fois au démarrage du script d'import
 *   - puis refreshLookups(lookups, ["customersByEmail"]) après l'import customers
 *   - puis refreshLookups(lookups, ["productsByRef"]) après l'import products
 *
 * @param {object} options
 * @param {boolean} [options.includeCustomers=true]  - inclure customers (faux si pas encore importés)
 * @param {boolean} [options.includeProducts=false]  - inclure products (faux si pas encore importés)
 * @returns {Promise<Lookups>}
 */
export async function buildLookups({
  includeCustomers = true,
  includeProducts = false,
} = {}) {
  console.log("[psLookups] Construction des lookups...");

  const tasks = {
    manufacturersByName: fetchManufacturersByName(),
    suppliersByName:     fetchSuppliersByName(),
    categoriesByName:    fetchCategoriesByName(),
    countriesByName:     fetchCountriesByName(),
    statesByName:        fetchStatesByName(),
  };

  if (includeCustomers) {
    tasks.customersByEmail = fetchCustomersByEmail();
  }
  if (includeProducts) {
    tasks.productsByRef = fetchProductsByReference();
  }

  // Exécution en parallèle
  const keys = Object.keys(tasks);
  const values = await Promise.all(Object.values(tasks));

  const lookups = {};
  keys.forEach((k, i) => {
    lookups[k] = values[i];
    console.log(`  ✓ ${k} : ${Object.keys(values[i]).length} entrées`);
  });

  console.log("[psLookups] Lookups prêts.");
  return lookups;
}

/**
 * Rafraîchit sélectivement certains lookups dans un objet existant.
 *
 * @param {Lookups} lookups  - objet lookups à mettre à jour (modifié en place)
 * @param {string[]} keys    - clés à rafraîchir, ex: ["customersByEmail"]
 * @returns {Promise<Lookups>}
 */
export async function refreshLookups(lookups, keys) {
  const FETCHERS = {
    manufacturersByName: fetchManufacturersByName,
    suppliersByName:     fetchSuppliersByName,
    categoriesByName:    fetchCategoriesByName,
    countriesByName:     fetchCountriesByName,
    statesByName:        fetchStatesByName,
    customersByEmail:    fetchCustomersByEmail,
    productsByRef:       fetchProductsByReference,
  };

  for (const key of keys) {
    if (!FETCHERS[key]) {
      console.warn(`[psLookups] Clé inconnue : "${key}", ignorée.`);
      continue;
    }
    lookups[key] = await FETCHERS[key]();
    console.log(`  ↻ ${key} rafraîchi : ${Object.keys(lookups[key]).length} entrées`);
  }

  return lookups;
}
