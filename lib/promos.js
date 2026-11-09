import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PROJECT_ROOT } from "./store.js";
import { mondayOf } from "./week.js";

// Source : les catalogues en ligne du magasin, tels que les affiche sa page publique.
// La page magasin liste les catalogues en cours ; l'API du lecteur de catalogue donne
// pour chacun ses dates et ses produits. Aucun compte n'est nécessaire.
export const STORE = {
  name: "E.Leclerc Saint-Ouen-l'Aumône (Épluches)",
  code: "1495",
  page: "https://www.e.leclerc/mag/e-leclerc-saint-ouen-l-aumone",
};
const VIEWER = "https://nos-catalogues-promos-v2.e.leclerc";
const API = "https://nos-catalogues-promos-v2-api.e.leclerc";
// Le lecteur envoie sa propre adresse en Referer : on fait de même, sans se faire passer pour un navigateur.
const API_HEADERS = { Referer: `${VIEWER}/`, Accept: "application/json" };
const USER_AGENT = "MiamMiam/1.0 (plan de repas familial, une consultation par semaine)";

// Rayons Leclerc utiles à la cuisine ; les boissons, l'entretien ou le bazar sont ignorés.
export const FOOD_CATEGORIES = [
  "Fruits et légumes", "Viandes et poissons", "Charcuterie Traiteur", "Crèmerie Fromagerie",
  "Épicerie", "Surgelés", "Pain Viennoiserie Pâtisserie",
];

const DAY_MS = 86400000;
const round = (n) => Math.round(n * 100) / 100;
const num = (value) => {
  const n = Number.parseFloat(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const clean = (text) => String(text ?? "").replace(/\s+/g, " ").trim();
const day = (iso) => String(iso ?? "").slice(0, 10);
const addDays = (isoDay, count) => new Date(Date.parse(`${isoDay}T00:00:00Z`) + count * DAY_MS).toISOString().slice(0, 10);
const percent = (n) => `${String(n).replace(".", ",")} %`;
const euros = (n) => `${n.toFixed(2).replace(".", ",")} €`;

// Les noms arrivent souvent en capitales : on les rend lisibles, sans toucher aux noms déjà en casse mixte.
function readable(text) {
  const value = clean(text).replace(/^SUR LES PRODUITS PRÉSENTS EN MAGASIN DE LA GAMME\s*/i, "Gamme ");
  if (value !== value.toLocaleUpperCase("fr")) return value;
  const lower = value.toLocaleLowerCase("fr");
  return lower.charAt(0).toLocaleUpperCase("fr") + lower.slice(1);
}

export function catalogCodes(html, storeCode = STORE.code) {
  const pattern = new RegExp(`nos-catalogues-promos-v2\\.e\\.leclerc/catalog/([A-Z0-9]+)/${storeCode}\\b`, "g");
  return [...new Set([...html.matchAll(pattern)].map((match) => match[1]))];
}

export function parseCatalog(raw) {
  return {
    code: raw.code,
    title: clean(raw.catch_phrase) || clean(raw.name),
    validFrom: day(raw.start_date),
    validTo: day(raw.end_date),
    isFood: raw.is_food === true,
    // Les versions « EXPRESS » visent les petits magasins de proximité, pas l'hypermarché.
    express: /EXPRESS/i.test(raw.name ?? ""),
    documentUid: raw.documentUid,
  };
}

// Les opérations promotionnelles durent deux semaines ; au-delà de cinq, c'est un catalogue
// permanent (carte traiteur, bijoux, voyages) et non une promo.
const MAX_OFFER_DAYS = 35;

// Les courses se font le mardi : seules comptent les promos valables ce jour-là.
export function shoppingDay(week) {
  return addDays(mondayOf(week), 1);
}

// Chaque catalogue dure deux semaines et un nouveau démarre chaque mardi : une semaine
// compte donc deux catalogues, celui du mardi précédent et celui du mardi des courses.
// Le nouveau n'est publié que le dimanche qui précède.
export function missingCatalogs(promos) {
  const day = promos.shoppingDay;
  const before = addDays(day, -7);
  const missing = [];
  if (!promos.catalogs.some((c) => c.validFrom === before)) missing.push(`le catalogue commencé le mardi ${before}`);
  if (!promos.catalogs.some((c) => c.validFrom === day)) {
    missing.push(`le catalogue qui commence le mardi ${day} (publié à partir du dimanche ${addDays(day, -2)})`);
  }
  return missing;
}

export function isUsefulCatalog(catalog, week) {
  const days = (Date.parse(catalog.validTo) - Date.parse(catalog.validFrom)) / DAY_MS;
  return catalog.isFood && !catalog.express && days <= MAX_OFFER_DAYS && catalogCoversShoppingDay(catalog, week);
}

export function catalogCoversShoppingDay(catalog, week) {
  const day = shoppingDay(week);
  return catalog.validFrom <= day && day <= catalog.validTo;
}

// Traduit la mécanique promotionnelle Leclerc en libellé lisible et en prix unitaire réellement payé.
export function describeOffer(raw) {
  const price = num(raw.price);
  const amount = num(raw.discountAmount);
  const isEuro = raw.discountUnit === "EURO";
  const quantity = Math.max(1, Math.round(num(raw.discountPriceQty)) || 1);
  const regular = num(raw.priceWithoutDiscount);
  switch (raw.meca) {
    case "meca1":
    case "meca10": // Remise immédiate : le prix affiché est déjà remisé.
      return { offer: `-${isEuro ? euros(amount) : percent(amount)} immédiat`, effectivePrice: price, regularPrice: regular || undefined };
    case "meca7":
      return { offer: "Prix barré", effectivePrice: price, regularPrice: regular || undefined };
    case "meca3":
    case "meca11": { // Ticket E.Leclerc : remise créditée sur la carte de fidélité.
      const net = num(raw.priceWithTEL) || (isEuro ? price - amount : price * (1 - amount / 100));
      return { offer: `${isEuro ? euros(amount) : percent(amount)} en Ticket E.Leclerc`, effectivePrice: round(net), cardOnly: true };
    }
    case "meca14":
      return {
        offer: `${percent(amount)} en Ticket E.Leclerc sur le ${quantity}e`,
        effectivePrice: round(price * (1 - amount / 100 / quantity)),
        minQuantity: quantity,
        cardOnly: true,
      };
    case "meca4":
    case "meca17": { // -X % sur le Ne produit acheté.
      const lot = num(raw.discountedPriceLot);
      return {
        offer: `-${percent(amount)} sur le ${quantity}e`,
        effectivePrice: round(lot > 0 ? lot / quantity : price * (1 - amount / 100 / quantity)),
        minQuantity: quantity,
      };
    }
    case "meca2":
    case "meca18": { // X achetés + Y offerts.
      const bought = Math.round(num(raw.offertX)) || 1;
      const free = Math.round(num(raw.offertY)) || 1;
      return {
        offer: `${bought} achetés + ${free} offert${free > 1 ? "s" : ""}`,
        effectivePrice: round((price * bought) / (bought + free)),
        minQuantity: bought + free,
      };
    }
    case "meca5": { // Prix du lot.
      const lot = num(raw.discountedPriceLot);
      return {
        offer: `${euros(lot)} les ${quantity}`,
        effectivePrice: round(lot > 0 ? lot / quantity : price),
        minQuantity: quantity,
      };
    }
    case "meca6":
      return { offer: "Prix promo", effectivePrice: price };
    default:
      return { offer: clean(raw.discountLabel) || "Promo", effectivePrice: price };
  }
}

export function parseProduct(raw, catalog, categoryNames) {
  const category = (raw.categoriesParentUid ?? []).map((uid) => categoryNames.get(String(uid))).find(Boolean) ?? "";
  if (!FOOD_CATEGORIES.includes(category)) return null;
  const price = num(raw.price);
  if (!(price > 0)) return null;
  const { offer, effectivePrice, regularPrice, minQuantity, cardOnly } = describeOffer(raw);
  const unitPrice = num(raw.containerPrice);
  const promo = {
    product: readable(raw.name),
    brand: readable(raw.brand),
    category,
    details: clean(raw.description),
    offer,
    price,
    unit: clean(raw.conditioning),
    effectivePrice,
    validFrom: catalog.validFrom,
    validTo: catalog.validTo,
    catalog: catalog.code,
  };
  if (regularPrice) promo.regularPrice = regularPrice;
  if (minQuantity) promo.minQuantity = minQuantity;
  if (cardOnly) promo.cardOnly = true;
  if (unitPrice > 0 && raw.containerPriceUnit) promo.unitPrice = `${clean(raw.containerPriceUnit)} : ${euros(unitPrice)}`;
  return promo;
}

function categoryMap(categories) {
  const map = new Map();
  const visit = (list) => {
    for (const category of list ?? []) {
      map.set(String(category.uid), clean(category.name));
      visit(category.children);
    }
  };
  visit(categories);
  return map;
}

// catalogs : [{ raw, products, categories }] tels que renvoyés par l'API.
export function buildPromos(week, catalogs, { fetchedAt = new Date().toISOString() } = {}) {
  const kept = catalogs
    .map((entry) => ({ ...entry, catalog: parseCatalog(entry.raw) }))
    .filter(({ catalog }) => isUsefulCatalog(catalog, week));
  const seen = new Set();
  const promos = [];
  // Le catalogue le plus récent passe en premier : en cas de doublon, sa promo l'emporte.
  for (const { catalog, products, categories } of kept.sort((a, b) => b.catalog.validFrom.localeCompare(a.catalog.validFrom))) {
    const names = categoryMap(categories);
    for (const raw of products ?? []) {
      const promo = parseProduct(raw, catalog, names);
      if (!promo) continue;
      const key = `${promo.product}|${promo.brand}|${promo.details}`.toLocaleLowerCase("fr");
      if (seen.has(key)) continue;
      seen.add(key);
      promos.push(promo);
    }
  }
  promos.sort((a, b) =>
    FOOD_CATEGORIES.indexOf(a.category) - FOOD_CATEGORIES.indexOf(b.category) || a.product.localeCompare(b.product, "fr"));
  return {
    week,
    shoppingDay: shoppingDay(week),
    store: STORE.name,
    fetchedAt,
    note: "Prix relevés dans les catalogues en ligne du magasin. effectivePrice est le prix unitaire payé une fois la mécanique appliquée.",
    catalogs: kept
      .filter(({ catalog }) => promos.some((promo) => promo.catalog === catalog.code))
      .map(({ catalog }) => ({
        code: catalog.code,
        title: catalog.title,
        validFrom: catalog.validFrom,
        validTo: catalog.validTo,
        url: `${VIEWER}/catalog/${catalog.code}/${STORE.code}`,
      }))
      .sort((a, b) => a.validFrom.localeCompare(b.validFrom)),
    promos,
  };
}

async function getJson(fetch, url) {
  const response = await fetch(url, { headers: { ...API_HEADERS, "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`${url} : HTTP ${response.status}`);
  return response.json();
}

export async function fetchPromos(week, { fetch = globalThis.fetch, now = new Date() } = {}) {
  const page = await fetch(STORE.page, { headers: { "User-Agent": USER_AGENT, Accept: "text/html" } });
  if (!page.ok) throw new Error(`${STORE.page} : HTTP ${page.status}`);
  const codes = catalogCodes(await page.text());
  if (codes.length === 0) throw new Error("Aucun catalogue trouvé sur la page du magasin : sa mise en page a peut-être changé");

  const catalogs = [];
  for (const code of codes) {
    const raw = await getJson(fetch, `${API}/${code}/${STORE.code}`);
    const catalog = parseCatalog(raw);
    if (!isUsefulCatalog(catalog, week)) continue;
    const products = await getJson(fetch, `${API}/document/${catalog.documentUid}/products`);
    const categories = await getJson(fetch, `${API}/document/${catalog.documentUid}/categories`);
    catalogs.push({ raw, products, categories });
  }
  if (catalogs.length === 0) throw new Error(`${week} : aucun catalogue alimentaire valable le mardi ${shoppingDay(week)}, jour des courses`);
  return buildPromos(week, catalogs, { fetchedAt: now.toISOString() });
}

const promosPath = (week, root) => join(root, "data", "promos", `${week}.json`);

export function savePromos(promos, root = PROJECT_ROOT) {
  const path = promosPath(promos.week, root);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(promos, null, 2)}\n`);
  return path;
}

export function loadPromos(week, root = PROJECT_ROOT) {
  const path = promosPath(week, root);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
}
