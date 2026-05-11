import { useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import { buildXMLFromCSV, mapCsvItem, parseCSV } from "../../utils/csvUtils";
import { buildXML, getPreviewColumns, getCellValue } from "../../utils/xmlUtils";
import {
  createFromXml,
  getLookupMap,
  parseCreatedId,
  uploadProductImage,
  getProductIdByReference,
  deleteById,
  setStockAvailableQuantity,
  getCustomerIdByEmail,
  createCustomerFromData,
  createAddressFromData,
  createCartFromItems,
  createOrderFromCart,
  getCustomerSecureKey,
  getCombinationIdByValue,
  getActiveCountryId,
  createOrderHistory,
} from "../../api/prestashopClient";

const FILE_SLOTS = [
  { key: "produits",     label: "Produits",     accept: ".csv", resource: "produits_mai26" },
  { key: "declinaisons", label: "Declinaisons", accept: ".csv", resource: "declinaisons_mai26" },
  { key: "commandes",    label: "Commandes",    accept: ".csv", resource: null },
  { key: "images",       label: "Images (ZIP)", accept: ".zip", resource: null },
];

const CSV_SEPARATORS = [",", ";", "\t", "|"];

const detectSeparator = (text) => {
  const line = text.split(/\r?\n/).find((l) => l.trim()) || "";
  let best = ",";
  let bestCount = line.split(",").length;
  CSV_SEPARATORS.forEach((sep) => {
    const count = line.split(sep).length;
    if (count > bestCount) { best = sep; bestCount = count; }
  });
  return best;
};

export default function ImportCsvImg({ onOrdersLoaded }) {
  const inputsRef = useRef({});
  const [files, setFiles]       = useState({});
  const [step, setStep]         = useState("idle");
  const [progress, setProgress] = useState({ done: 0, total: FILE_SLOTS.length + 1, log: [] });

  const allReady = useMemo(
    () => FILE_SLOTS.every((f) => files[f.key]?.file && !files[f.key]?.error),
    [files]
  );

  const updateFileState = (key, next) =>
    setFiles((prev) => ({ ...prev, [key]: { ...prev[key], ...next } }));

  const addLog = (msg) =>
    setProgress((prev) => ({ ...prev, log: [...prev.log, msg] }));

  const bumpDone = () =>
    setProgress((prev) => ({ ...prev, done: prev.done + 1 }));

  // ── Chargement fichiers ──────────────────────────────────────────────────
  const handlePick = (key, file) => {
    if (!file) return;
    const meta = FILE_SLOTS.find((f) => f.key === key);
    if (!meta) return;

    if (meta.accept === ".zip") {
      if (!file.name.toLowerCase().endsWith(".zip")) {
        updateFileState(key, { file: null, error: "Le fichier doit etre un .zip" });
        return;
      }
      updateFileState(key, { file, error: "", items: null, columns: [], zipEntries: [] });
      return;
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      updateFileState(key, { file: null, error: "Le fichier doit etre un .csv" });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const raw = String(e.target.result || "");
        const separator = detectSeparator(raw);
        const parsed = parseCSV(raw, separator);
        updateFileState(key, {
          file, error: "",
          items: parsed.items,
          columns: getPreviewColumns(parsed.items),
          separator,
        });
        if (key === "commandes" && onOrdersLoaded) onOrdersLoaded(parsed.items);
      } catch (err) {
        updateFileState(key, { file, error: "Erreur de parsing : " + err.message });
      }
    };
    reader.readAsText(file, "UTF-8");
  };

  const handleReset = () => {
    setFiles({});
    setStep("idle");
    setProgress({ done: 0, total: FILE_SLOTS.length + 1, log: [] });
  };

  // ── Rollback : supprime tout ce qui a ete cree ──────────────────────────
  const rollback = async (created) => {
    addLog("⏪ Rollback — suppression des donnees creees...");
    for (const { resource, id } of [...created].reverse()) {
      try {
        await deleteById(resource, id);
        addLog(`   · supprime ${resource}#${id}`);
      } catch (err) {
        addLog(`   · erreur suppression ${resource}#${id} : ${err.message}`);
      }
    }
    addLog("⏪ Rollback termine.");
  };

  // ── Import principal ─────────────────────────────────────────────────────
  const handleImport = async () => {
    setStep("importing");
    setProgress({ done: 0, total: FILE_SLOTS.length + 1, log: [] });

    const produits     = files.produits?.items     || [];
    const declinaisons = files.declinaisons?.items || [];
    const imagesZip    = files.images?.file        || null;
    const commandes    = files.commandes?.items    || [];

    // Tout ce qui est cree — pour le rollback si erreur
    const created = []; // [{ resource, id }]

    try {
      const lookups = await buildLookups();
      const categoriesByName = { ...(lookups.categoriesByName || {}) };

      // Categorie General si absente
      if (!categoriesByName["general"]) {
        const xml    = buildXMLFromCSV("categories", { name: "General", active: "1", id_parent: "2" });
        const resXml = await createFromXml("categories", xml);
        const newId  = parseCreatedId(resXml);
        if (newId) {
          categoriesByName["general"] = newId;
          created.push({ resource: "categories", id: newId });
        }
      }
      lookups.categoriesByName = categoriesByName;

      await ensureCategoriesFromProducts(produits, lookups, created, addLog);

      // ── 1. Produits ──────────────────────────────────────────────────────
      const productIdMap = {};
      const taxRateByReference = {};
      const productPriceMap = {};
      const productNameMap = {};

      for (const row of produits) {
        const mapped = mapCsvItem("produits_mai26", row, lookups);
        if (!mapped.reference) continue;

        const xml      = buildXMLFromCSV("products", mapped, lookups);
        const response = await createFromXml("products", xml);
        const newId    = parseCreatedId(response);

        if (!newId) throw new Error(`Echec creation produit ref=${mapped.reference}`);

        const refKey = normalizeLookupKey(mapped.reference);
        productIdMap[refKey] = newId;
        productPriceMap[refKey] = mapped.price || "0.000000";
        productNameMap[refKey] = mapped.name || mapped.reference;
        const rawTax = getRowValue(row, /taxe/i);
        if (rawTax) {
          const rate = normalizeTaxRate(rawTax);
          if (rate) taxRateByReference[refKey] = rate;
        }
        created.push({ resource: "products", id: newId });
        addLog(`✓ Produit cree : ${mapped.reference} (id=${newId})`);
      }

      bumpDone();

      // ── 2. Verif references declinaisons AVANT tout effet de bord ───────
      const declinaisonsAvecAttribut = declinaisons.filter((row) => {
        const mapped = mapCsvItem("declinaisons_mai26", row, lookups);
        return String(mapped._attribute || "").trim() !== "" &&
               String(mapped._value    || "").trim() !== "";
      });

      const refsManquantes = [];
      for (const row of declinaisonsAvecAttribut) {
        const mapped = mapCsvItem("declinaisons_mai26", row, lookups);
        const ref    = mapped.reference;
        const refKey = normalizeLookupKey(ref);
        if (!productIdMap[refKey]) {
          let existingId = null;
          try { existingId = await getProductIdByReference(ref); } catch (_) {}
          if (existingId) {
            productIdMap[refKey] = existingId;
          } else {
            refsManquantes.push(ref);
          }
        }
      }

      if (refsManquantes.length > 0) {
        throw new Error(`References introuvables : ${refsManquantes.join(", ")}`);
      }

      // ── 3. Images ────────────────────────────────────────────────────────
      if (imagesZip) {
        const zip     = await JSZip.loadAsync(imagesZip);
        const entries = Object.values(zip.files).filter((f) => !f.dir);
        for (const entry of entries) {
          const base      = entry.name.split("/").pop();
          const reference = base?.split(".")[0];
          const productId = productIdMap[normalizeLookupKey(reference)];
          if (!productId) continue;
          const blob = await entry.async("blob");
          const file = new File([blob], base || "image.jpg", { type: blob.type || "image/jpeg" });
          await uploadProductImage(productId, file);
          addLog(`✓ Image uploadee : ${base}`);
        }
      }

      bumpDone();

      // ── 4. Declinaisons ──────────────────────────────────────────────────
      const priceImpactMap = buildPriceImpactMap(declinaisons, taxRateByReference);
      for (const row of declinaisonsAvecAttribut) {
        const combinationId = await createCombinationFromRow(
          row,
          productIdMap,
          lookups,
          taxRateByReference
        );
        if (combinationId) created.push({ resource: "combinations", id: combinationId });
      }

      const declinaisonsSansAttribut = declinaisons.filter((row) => {
        const mapped = mapCsvItem("declinaisons_mai26", row, lookups);
        return !String(mapped._attribute || "").trim() || !String(mapped._value || "").trim();
      });

      for (const row of declinaisonsSansAttribut) {
        const mapped = mapCsvItem("declinaisons_mai26", row, lookups);
        const refKey = normalizeLookupKey(mapped.reference);
        const productId = productIdMap[refKey];
        if (!productId) continue;
        const qty = mapped.quantity || "0";
        await setStockAvailableQuantity(productId, "0", qty);
      }

      // ── 5. Commandes ─────────────────────────────────────────────────────
      if (commandes.length > 0) {
        const countryId =
          (await getActiveCountryId("Madagascar", "MG")) ||
          (await getActiveCountryId("France", "FR")) ||
          "1";
        for (const row of commandes) {
          const email = getRowValue(row, /^email$/i);
          if (!email) continue;

          const fullName = getRowValue(row, /^nom$/i) || "Client";
          const { firstname, lastname } = splitName(fullName);
          const passwd = getRowValue(row, /^pwd$/i) || "changeme";
          const addressText = getRowValue(row, /^adresse$/i) || "Adresse";
          const etatRaw = normalizeEtatKey(getRowValue(row, /^etat$/i));
          const stateId = resolveOrderStateId(etatRaw);
          const payment = "PrestaShop";
          const carrierId = "1";

          let customerId = await getCustomerIdByEmail(email);
          if (!customerId) {
            customerId = await createCustomerFromData({ firstname, lastname, email, passwd });
            if (customerId) created.push({ resource: "customers", id: customerId });
          }

          const secureKey = customerId ? await getCustomerSecureKey(customerId) : "";

          const addressId = await createAddressFromData({
            id_customer: customerId,
            alias: `Import ${lastname}`,
            firstname,
            lastname,
            address1: addressText,
            city: "Antananarivo",
            postcode: "101",
            id_country: countryId,
          });
          if (addressId) created.push({ resource: "addresses", id: addressId });

          const items = await resolveOrderItems(
            parseAchatItems(getRowValue(row, /^achat$/i)),
            {
              productIdMap,
              productPriceMap,
              productNameMap,
              priceImpactMap,
              taxRateByReference,
              lookups,
            }
          );

          if (items.length === 0) {
            addLog(`⚠ Commande ignoree (aucun produit) : ${email}`);
            continue;
          }

          const cartId = await createCartFromItems({
            id_customer: customerId,
            id_address_delivery: addressId,
            id_address_invoice: addressId,
            id_currency: "1",
            id_lang: "1",
            id_carrier: carrierId,
            id_shop: "1",
            id_shop_group: "1",
            items: items.map((i) => ({
              productId: i.productId,
              productAttributeId: i.productAttributeId,
              quantity: i.quantity,
            })),
          });
          if (cartId) created.push({ resource: "carts", id: cartId });

          const totals = computeTotals(items);
          const orderId = await createOrderFromCart({
            id_customer: customerId,
            id_address_delivery: addressId,
            id_address_invoice: addressId,
            id_cart: cartId,
            id_currency: "1",
            id_lang: "1",
            id_carrier: carrierId,
            id_shop: "1",
            id_shop_group: "1",
            current_state: stateId,
            payment,
            secure_key: secureKey,
            total_paid: totals.totalPaidIncl,
            total_paid_tax_incl: totals.totalPaidIncl,
            total_paid_tax_excl: totals.totalPaidExcl,
            total_products: totals.totalPaidExcl,
            total_products_wt: totals.totalPaidIncl,
            valid: stateId === "2" ? "1" : "0",
            items,
          });
          if (orderId) {
            created.push({ resource: "orders", id: orderId });
            await createOrderHistory(orderId, stateId, "0");
            addLog(`✓ Commande creee : ${email} (id=${orderId})`);
          }
        }
      }

      bumpDone();

      addLog("✓ Import termine avec succes !");
      setStep("done");

    } catch (err) {
      addLog(`❌ Erreur : ${err.message}`);
      await rollback(created);
      setStep("error");
    }
  };

  // ── Lookups ──────────────────────────────────────────────────────────────
  const buildLookups = async () => {
    const [manufacturersByName, suppliersByName, categoriesByName, countriesByName, taxRulesByRate, optionValuesByName] =
      await Promise.all([
        getLookupMap("manufacturers"),
        getLookupMap("suppliers"),
        getLookupMap("categories"),
        getLookupMap("countries"),
        getLookupMap("taxes", { keyField: "rate" }),
        getLookupMap("product_option_values", { keyField: "name" }),
      ]);
    return {
      manufacturersByName, suppliersByName, categoriesByName,
      countriesByName, taxRulesByRate,
      optionValuesByName,
      attributeGroupsByName: {}, attributeValuesByKey: {},
    };
  };

  // ── Creer une declinaison — retourne l'id cree ───────────────────────────
  const createCombinationFromRow = async (row, productIdMap, lookups, taxRateByReference) => {
    const mapped    = mapCsvItem("declinaisons_mai26", row, lookups);
    const reference = mapped.reference;
    const refKey = normalizeLookupKey(reference);
    const productId = productIdMap[refKey];
    if (!productId) throw new Error(`Produit introuvable pour reference ${reference}`);

    const attrName  = String(mapped._attribute || "").trim();
    const valueName = String(mapped._value     || "").trim();
    if (!attrName || !valueName)
      throw new Error(`Attribut ou valeur manquante pour ${reference}`);

    const groupId = await getOrCreateAttributeGroup(attrName, lookups);
    const valueId = await getOrCreateAttributeValue(groupId, valueName, lookups);

    let priceImpact = mapped.price || "0";
    const rate = taxRateByReference?.[refKey];
    if (rate && priceImpact) {
      priceImpact = ttcToHt(priceImpact, rate);
    }

    const combination = {
      id_product:       String(productId),
      quantity:         mapped.quantity || "0",
      price:            priceImpact,
      minimal_quantity: "1",
      associations: {
        product_option_values: {
          product_option_value: [{ id: String(valueId) }],
        },
      },
    };

    const xml      = buildXML("combinations", combination);
    const response = await createFromXml("combinations", xml);
    const newId    = parseCreatedId(response);
    if (newId) {
      await setStockAvailableQuantity(productId, newId, mapped.quantity || "0");
      addLog(`✓ Declinaison creee : ${reference} / ${attrName}=${valueName} (id=${newId})`);
    }
    return newId;
  };

  const getOrCreateAttributeGroup = async (name, lookups) => {
    const key = name.trim().toLowerCase();
    if (lookups.attributeGroupsByName[key]) return lookups.attributeGroupsByName[key];
    const xml   = buildXMLFromCSV("product_options", { name, public_name: name, group_type: "select" });
    const res   = await createFromXml("product_options", xml);
    const newId = parseCreatedId(res);
    if (!newId) throw new Error(`Echec creation groupe attribut : ${name}`);
    lookups.attributeGroupsByName[key] = newId;
    return newId;
  };

  const getOrCreateAttributeValue = async (groupId, value, lookups) => {
    const key = `${groupId}:${value.trim().toLowerCase()}`;
    if (lookups.attributeValuesByKey[key]) return lookups.attributeValuesByKey[key];
    const xml   = buildXMLFromCSV("product_option_values", { id_attribute_group: String(groupId), name: value });
    const res   = await createFromXml("product_option_values", xml);
    const newId = parseCreatedId(res);
    if (!newId) throw new Error(`Echec creation valeur attribut : ${value}`);
    lookups.attributeValuesByKey[key] = newId;
    if (!lookups.optionValuesByName) lookups.optionValuesByName = {};
    lookups.optionValuesByName[normalizeLookupKey(value)] = newId;
    return newId;
  };

  const resolveOrderItems = async (rawItems, ctx) => {
    const items = [];
    const cache = ctx.lookups.cachedCombinationIds || {};
    ctx.lookups.cachedCombinationIds = cache;

    for (const rawItem of rawItems) {
      const refKey = normalizeLookupKey(rawItem.reference);
      const productId = ctx.productIdMap[refKey];
      if (!productId) continue;

      const valueName = rawItem.value;
      let productAttributeId = "0";
      if (valueName) {
        const valueId = ctx.lookups.optionValuesByName?.[normalizeLookupKey(valueName)];
        if (valueId) {
          const cacheKey = `${productId}:${valueId}`;
          if (!cache[cacheKey]) {
            cache[cacheKey] = await getCombinationIdByValue(productId, valueId);
          }
          productAttributeId = cache[cacheKey] || "0";
        }
      }

      if (valueName && productAttributeId === "0") {
        continue;
      }

      const basePrice = parseFloat(ctx.productPriceMap[refKey] || "0");
      const impactKey = `${refKey}:${normalizeLookupKey(valueName)}`;
      const impact = parseFloat(ctx.priceImpactMap[impactKey] || "0");
      const unitPrice = (basePrice + impact);
      const qty = Number(rawItem.quantity || 0);

      items.push({
        productId,
        productAttributeId,
        quantity: String(qty),
        name: ctx.productNameMap[refKey] || rawItem.reference,
        reference: rawItem.reference,
        price: unitPrice.toFixed(6),
        taxRate: ctx.taxRateByReference[refKey] || "0",
      });
    }

    return items;
  };

  // ── Rendu ────────────────────────────────────────────────────────────────
  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>Import CSV + image</h1>
        <p style={styles.subtitle}>
          Charge les 3 CSV et l'archive images.zip avant de lancer l'import global.
          En cas d'erreur, tout ce qui a ete cree est automatiquement supprime (rollback).
        </p>
      </header>

      <div style={styles.grid}>
        {FILE_SLOTS.map((meta) => {
          const state   = files[meta.key] || {};
          const hasFile = Boolean(state.file);
          const isCsv   = meta.accept === ".csv";
          return (
            <div key={meta.key} style={styles.card}>
              <div style={styles.cardHeader}>
                <div>
                  <div style={styles.cardTitle}>{meta.label}</div>
                  <div style={styles.cardDesc}>{meta.description}</div>
                </div>
                <span style={styles.badge}>{meta.accept.toUpperCase()}</span>
              </div>

              <div style={styles.dropZone} onClick={() => inputsRef.current[meta.key]?.click()}>
                <input
                  ref={(el) => (inputsRef.current[meta.key] = el)}
                  type="file"
                  accept={meta.accept}
                  style={{ display: "none" }}
                  onChange={(e) => handlePick(meta.key, e.target.files[0])}
                />
                <div style={styles.dropIcon}>⇪</div>
                <div style={styles.dropText}>
                  {hasFile ? state.file.name : "Cliquer pour choisir un fichier"}
                </div>
                {hasFile && (
                  <div style={styles.dropSub}>
                    {(state.items?.length || 0).toLocaleString()} lignes detectees
                    {isCsv && state.separator && (
                      <span> · separateur : {state.separator === "\t" ? "TAB" : state.separator}</span>
                    )}
                  </div>
                )}
                {state.error && <div style={styles.errorMsg}>{state.error}</div>}
              </div>

              {isCsv && state.items && state.items.length > 0 && (
                <div style={styles.preview}>
                  <div style={styles.previewHeader}>Apercu (3 lignes)</div>
                  <div style={styles.previewTableWrap}>
                    <table style={styles.table}>
                      <thead>
                        <tr>
                          {state.columns.map((col) => (
                            <th key={col} style={styles.th}>{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {state.items.slice(0, 3).map((item, idx) => (
                          <tr key={idx}>
                            {state.columns.map((col) => (
                              <td key={col} style={styles.td}>{getCellValue(item, col)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={styles.actions}>
        <button style={styles.ghostBtn} onClick={handleReset}>
          Reinitialiser
        </button>
        <button
          style={{
            ...styles.importBtn,
            opacity: allReady && step === "idle" ? 1 : 0.5,
            cursor:  allReady && step === "idle" ? "pointer" : "not-allowed",
          }}
          onClick={() => allReady && step === "idle" && handleImport()}
          disabled={!allReady || step !== "idle"}
        >
          Importer les 4 fichiers
        </button>
      </div>

      {step === "importing" && (
        <div style={styles.progress}>
          <div style={styles.progressTitle}>Import en cours...</div>
          <div style={styles.progressBar}>
            <div
              style={{
                ...styles.progressFill,
                width: `${Math.round((progress.done / progress.total) * 100)}%`,
              }}
            />
          </div>
          <div style={styles.progressMeta}>
            {progress.done}/{progress.total} etapes
          </div>
          <div style={styles.progressLog}>
            {progress.log.map((line, i) => (
              <div key={i} style={styles.logLine}>{line}</div>
            ))}
          </div>
        </div>
      )}

      {step === "done" && (
        <div style={styles.done}>
          <div style={styles.doneIcon}>✓</div>
          <div style={styles.doneTitle}>Import termine</div>
          <div style={styles.doneSub}>Tous les fichiers ont ete traites avec succes.</div>
        </div>
      )}

      {step === "error" && (
        <div style={{ ...styles.done, borderColor: "#c0392b" }}>
          <div style={{ ...styles.doneIcon, color: "#e74c3c" }}>✕</div>
          <div style={styles.doneTitle}>Import annule — rollback effectue</div>
          <div style={styles.progressLog}>
            {progress.log.map((line, i) => (
              <div key={i} style={styles.logLine}>{line}</div>
            ))}
          </div>
          <button style={{ ...styles.ghostBtn, marginTop: 16 }} onClick={handleReset}>
            Recommencer
          </button>
        </div>
      )}
    </div>
  );
}

function splitName(fullName) {
  const parts = String(fullName).trim().split(/\s+/);
  if (parts.length === 1) return { firstname: parts[0], lastname: "-" };
  return { firstname: parts[0], lastname: parts.slice(1).join(" ") };
}

function parseAchatItems(raw) {
  const items = [];
  if (!raw) return items;
  const text = String(raw);
  const regex = /\("?([^";]+)"?;\s*(\d+)\s*;\s*"?([^";]*)"?\)/g;
  let match;
  while ((match = regex.exec(text))) {
    items.push({
      reference: match[1],
      quantity: Number(match[2]),
      value: match[3] || "",
    });
  }
  return items;
}

function buildPriceImpactMap(rows, taxRateByReference) {
  const map = {};
  rows.forEach((row) => {
    const ref = String(row.reference || row.Reference || row.reference || "").trim();
    const value = String(row.karazany || row.Karazany || "").trim();
    const price = String(row.prix_vente_ttc || row["prix_vente_ttc"] || row["prix vente ttc"] || "").trim();
    if (!ref || !value || !price) return;
    const refKey = normalizeLookupKey(ref);
    const rate = taxRateByReference?.[refKey] || "0";
    const ht = ttcToHt(price, rate);
    map[`${refKey}:${normalizeLookupKey(value)}`] = ht;
  });
  return map;
}

function computeTotals(items) {
  let totalExcl = 0;
  let totalIncl = 0;
  items.forEach((item) => {
    const price = parseFloat(item.price || "0");
    const rate = parseFloat(item.taxRate || "0");
    const qty = parseFloat(item.quantity || "0");
    totalExcl += price * qty;
    totalIncl += price * (1 + rate / 100) * qty;
  });
  return {
    totalPaidExcl: totalExcl.toFixed(6),
    totalPaidIncl: totalIncl.toFixed(6),
  };
}

async function ensureCategoriesFromProducts(items, lookups, created, addLog) {
  const names = new Set();
  items.forEach((row) => {
    const raw = getRowValue(row, /categor|categorie/i);
    if (raw) names.add(raw.trim());
  });

  for (const name of names) {
    const key = normalizeLookupKey(name);
    if (lookups.categoriesByName?.[key]) continue;
    const xml = buildXMLFromCSV("categories", { name, active: "1", id_parent: "2" }, lookups);
    const res = await createFromXml("categories", xml);
    const id = parseCreatedId(res);
    if (id) {
      lookups.categoriesByName[key] = id;
      created.push({ resource: "categories", id });
      addLog(`✓ Categorie creee : ${name} (id=${id})`);
    }
  }
}

function normalizeLookupKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

function getRowValue(row, regex) {
  const key = Object.keys(row).find((k) => regex.test(k));
  return key ? String(row[key] ?? "").trim() : "";
}

function normalizeEtatKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function resolveOrderStateId(etatKey) {
  const v = String(etatKey || "");
  if (v.includes("accepte")) return "2";
  if (v.includes("livraison")) return "13";
  if (v.includes("attente")) return "14";
  if (v.includes("erreur") || v.includes("echec")) return "8";
  return "1";
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
  const price = parseFloat(String(priceTTC).replace(/,/g, "."));
  if (isNaN(rate) || isNaN(price)) return "0.000000";
  return (price / (1 + rate / 100)).toFixed(6);
}

const styles = {
  page: {
    minHeight: "100vh", background: "#0e0e0e", color: "#e0e0e0",
    fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
    padding: "40px 32px", maxWidth: 1100, margin: "0 auto",
  },
  header:   { marginBottom: 32, borderBottom: "1px solid #222", paddingBottom: 24 },
  title:    { fontSize: 28, fontWeight: 700, color: "#fff", margin: 0, letterSpacing: "-0.5px" },
  subtitle: { marginTop: 8, color: "#888", fontSize: 14, lineHeight: 1.6 },
  grid:     { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 },
  card: {
    border: "1px solid #1e1e1e", borderRadius: 12, padding: 18,
    background: "#141414", display: "flex", flexDirection: "column", gap: 12,
  },
  cardHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  cardTitle:  { fontSize: 16, fontWeight: 700, color: "#fff" },
  cardDesc:   { fontSize: 12, color: "#666" },
  badge: {
    fontSize: 10, letterSpacing: 1, textTransform: "uppercase",
    color: "#3498db", border: "1px solid #1d3750", padding: "4px 8px", borderRadius: 20,
  },
  dropZone: {
    border: "1px dashed #2a2a2a", borderRadius: 10, padding: "18px 16px",
    textAlign: "center", background: "#101010", cursor: "pointer",
  },
  dropIcon:         { fontSize: 22, color: "#444" },
  dropText:         { fontSize: 13, color: "#ccc", marginTop: 6 },
  dropSub:          { fontSize: 11, color: "#555", marginTop: 4 },
  errorMsg:         { marginTop: 6, fontSize: 12, color: "#e74c3c" },
  preview:          { borderTop: "1px solid #1f1f1f", paddingTop: 10 },
  previewHeader:    { fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: 1 },
  previewTableWrap: { overflowX: "auto", marginTop: 8 },
  table:            { width: "100%", borderCollapse: "collapse", fontSize: 11 },
  th: {
    textAlign: "left", color: "#666", fontWeight: 600,
    padding: "6px 8px", borderBottom: "1px solid #1f1f1f", whiteSpace: "nowrap",
  },
  td: { padding: "6px 8px", borderBottom: "1px solid #1a1a1a", color: "#bbb", whiteSpace: "nowrap" },
  actions: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    marginTop: 32, borderTop: "1px solid #222", paddingTop: 24,
  },
  ghostBtn: {
    background: "transparent", border: "1px solid #333", color: "#888",
    padding: "10px 20px", borderRadius: 6, fontSize: 13, fontFamily: "inherit", cursor: "pointer",
  },
  importBtn: {
    background: "#3498db", color: "#fff", border: "none",
    padding: "12px 28px", borderRadius: 6, fontSize: 14, fontWeight: 700, fontFamily: "inherit",
  },
  progress: {
    marginTop: 24, background: "#141414", border: "1px solid #222", borderRadius: 12, padding: 20,
  },
  progressTitle: { fontSize: 14, color: "#fff", marginBottom: 10 },
  progressBar:   { height: 8, background: "#222", borderRadius: 4, overflow: "hidden" },
  progressFill:  { height: "100%", background: "#3498db", borderRadius: 4, transition: "width 0.2s ease" },
  progressMeta:  { marginTop: 8, fontSize: 12, color: "#777" },
  progressLog:   { marginTop: 10, fontSize: 11, color: "#666" },
  logLine:       { padding: "3px 0", borderBottom: "1px solid #1a1a1a" },
  done: {
    marginTop: 24, textAlign: "center", background: "#141414",
    border: "1px solid #222", borderRadius: 12, padding: "28px 20px",
  },
  doneIcon:  { fontSize: 32, color: "#27ae60" },
  doneTitle: { fontSize: 16, fontWeight: 700, color: "#fff", marginTop: 6 },
  doneSub:   { fontSize: 12, color: "#666", marginTop: 4 },
};