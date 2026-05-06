// src/api/prestashopClient.js
// Tous les echanges avec l'API PrestaShop se font en XML uniquement

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