import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FOOD_CATEGORIES, buildPromos, catalogCodes, describeOffer, fetchPromos, isUsefulCatalog, loadPromos, missingCatalogs, parseCatalog, shoppingDay,
} from "../lib/promos.js";
import { updatePromos } from "../lib/workflow.js";

// Réponses réelles du 10 novembre 2026, réduites à quelques produits et sans les coordonnées du magasin.
const FIXTURES = new URL("./fixtures/promos/", import.meta.url);
const fixture = (name) => readFileSync(new URL(name, FIXTURES), "utf8");
const json = (name) => JSON.parse(fixture(name));
const OPERATIONS = json("operations.json");
const CATEGORIES = json("categories.json");
const PRODUCTS = { "26G312G": json("products-26G312G.json"), "26G311G": json("products-26G311G.json") };
const product = (code, uidPrefix) => PRODUCTS[code].find((p) => p.uid.startsWith(uidPrefix));

const allCatalogs = () => Object.entries(OPERATIONS).map(([code, raw]) => ({
  raw, products: PRODUCTS[code] ?? [], categories: CATEGORIES,
}));

test("la page du magasin donne les codes de ses catalogues, sans doublon", () => {
  const codes = catalogCodes(fixture("store-page.html"));
  assert.equal(codes.length, 11);
  assert.ok(codes.includes("26G312G") && codes.includes("26G311G"));
  assert.deepEqual(catalogCodes(fixture("store-page.html"), "9999"), []);
});

test("seuls les catalogues promo alimentaires de l'hypermarché valables le mardi des courses sont gardés", () => {
  const useful = (code, week) => isUsefulCatalog(parseCatalog(OPERATIONS[code]), week);
  assert.equal(shoppingDay("2026-W46"), "2026-11-10");
  assert.equal(useful("26G312G", "2026-W46"), true, "commence le mardi 10 novembre");
  assert.equal(useful("26G311G", "2026-W46"), true, "court jusqu'au 14 novembre");
  assert.equal(useful("26G311G", "2026-W47"), false, "fini avant le mardi 17 novembre");
  assert.equal(useful("26G312G", "2026-W47"), true);
  assert.equal(useful("26G312G", "2026-W45"), false, "commence après le mardi 3 novembre");
  assert.equal(useful("26G312E", "2026-W46"), false, "version Express");
  assert.equal(useful("26G006G", "2026-W46"), false, "non alimentaire");
  assert.equal(useful("26C002A", "2026-W46"), false, "carte permanente");
});

test("parseCatalog lit les dates de validité", () => {
  assert.deepEqual(parseCatalog(OPERATIONS["26G312G"]), {
    code: "26G312G",
    title: "Plein pouvoirs d'achat",
    validFrom: "2026-11-10",
    validTo: "2026-11-21",
    isFood: true,
    express: false,
    documentUid: "9e42d9c5097d0d5d91e6e533ff6e7471",
  });
});

test("describeOffer traduit chaque mécanique en prix réellement payé", () => {
  const cases = [
    ["26G312G", "6cd9a45d", { offer: "-34 % immédiat", effectivePrice: 1.38, regularPrice: 2.09 }],
    ["26G312G", "4d42e273", { offer: "Prix promo", effectivePrice: 4.29 }],
    ["26G312G", "23c6450b", { offer: "-68 % sur le 2e", effectivePrice: 1.58, minQuantity: 2 }],
    ["26G312G", "aad8910f", { offer: "2 achetés + 1 offert", effectivePrice: 1.26, minQuantity: 3 }],
    ["26G312G", "c0ca0b89", { offer: "20 % en Ticket E.Leclerc", effectivePrice: 1.08, cardOnly: true }],
    ["26G311G", "050a976c", { offer: "1,00 € en Ticket E.Leclerc", effectivePrice: 4.81, cardOnly: true }],
    ["26G312G", "73b7488f", { offer: "60 % en Ticket E.Leclerc sur le 2e", effectivePrice: 1.88, minQuantity: 2, cardOnly: true }],
    ["26G311G", "8e90ee80", { offer: "5,70 € les 3", effectivePrice: 1.9, minQuantity: 3 }],
  ];
  for (const [code, uid, expected] of cases) {
    const raw = product(code, uid);
    assert.deepEqual(describeOffer(raw), expected, raw.name);
  }
});

test("buildPromos ne garde que les produits alimentaires, triés par rayon", () => {
  const result = buildPromos("2026-W46", allCatalogs(), { fetchedAt: "2026-11-10T08:00:00.000Z" });
  assert.equal(result.week, "2026-W46");
  assert.equal(result.shoppingDay, "2026-11-10");
  assert.equal(result.fetchedAt, "2026-11-10T08:00:00.000Z");
  assert.deepEqual(result.catalogs.map((c) => c.code), ["26G311G", "26G312G"]);
  assert.equal(result.catalogs[1].url, "https://nos-catalogues-promos-v2.e.leclerc/catalog/26G312G/1495");
  assert.ok(result.promos.length > 20);
  const ranks = result.promos.map((p) => FOOD_CATEGORIES.indexOf(p.category));
  assert.ok(ranks.every((rank) => rank >= 0), "aucun rayon non alimentaire");
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
  for (const promo of result.promos) {
    assert.ok(promo.price > 0 && promo.effectivePrice > 0 && promo.effectivePrice <= promo.price, promo.product);
    assert.match(promo.validFrom, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test("une semaine compte deux catalogues : celui du mardi précédent et celui du mardi des courses", () => {
  const both = buildPromos("2026-W46", allCatalogs());
  assert.deepEqual(both.catalogs.map((c) => [c.validFrom, c.validTo]), [["2026-11-03", "2026-11-14"], ["2026-11-10", "2026-11-21"]]);
  assert.deepEqual(missingCatalogs(both), []);

  // Le samedi, le catalogue du mardi suivant n'est pas encore publié.
  const saturday = buildPromos("2026-W46", allCatalogs().filter((c) => c.raw.code !== "26G312G"));
  assert.deepEqual(missingCatalogs(saturday), ["le catalogue qui commence le mardi 2026-11-10 (publié à partir du dimanche 2026-11-08)"]);

  const onlyNew = buildPromos("2026-W46", allCatalogs().filter((c) => c.raw.code !== "26G311G"));
  assert.deepEqual(missingCatalogs(onlyNew), ["le catalogue commencé le mardi 2026-11-03"]);
});

test("buildPromos rend les noms lisibles et garde le prix au kilo", () => {
  const { promos } = buildPromos("2026-W46", allCatalogs());
  const potatoes = promos.find((p) => p.product.startsWith("Pommes de terre"));
  assert.deepEqual(
    { product: potatoes.product, brand: potatoes.brand, category: potatoes.category, unit: potatoes.unit, unitPrice: potatoes.unitPrice },
    {
      product: "Pommes de terre four puree potage",
      brand: "Panier du primeur",
      category: "Fruits et légumes",
      unit: "Le filet de 2kg",
      unitPrice: "Le kg : 0,85 €",
    },
  );
  assert.ok(promos.some((p) => p.product.startsWith("Gamme ")), "les promos sur une gamme sont signalées");
});

test("une promo présente dans deux catalogues n'apparaît qu'une fois, celle du plus récent", () => {
  const duplicate = { ...product("26G311G", "050a976c"), uid: "copie" };
  const catalogs = allCatalogs().map((entry) =>
    (entry.raw.code === "26G312G" ? { ...entry, products: [...entry.products, duplicate] } : entry));
  const sausages = buildPromos("2026-W46", catalogs).promos.filter((p) => p.product.startsWith("8 Saucisses"));
  assert.equal(sausages.length, 1);
  assert.equal(sausages[0].catalog, "26G312G");
});

function fakeFetch(calls) {
  const API = "https://nos-catalogues-promos-v2-api.e.leclerc";
  const DOCS = Object.fromEntries(Object.entries(OPERATIONS).map(([code, op]) => [op.documentUid, code]));
  const respond = (body) => ({ ok: true, status: 200, text: async () => body, json: async () => JSON.parse(body) });
  return async (url, options = {}) => {
    calls.push({ url, headers: options.headers ?? {} });
    if (url === "https://www.e.leclerc/mag/e-leclerc-saint-ouen-l-aumone") return respond(fixture("store-page.html"));
    const operation = url.match(new RegExp(`^${API}/([A-Z0-9]+)/1495$`));
    if (operation) {
      const raw = OPERATIONS[operation[1]] ?? { code: operation[1], name: "AUTRE", is_food: false, start_date: "2026-01-01", end_date: "2026-12-31" };
      return respond(JSON.stringify(raw));
    }
    const document = url.match(new RegExp(`^${API}/document/(\\w+)/(products|categories)$`));
    if (document) {
      return respond(JSON.stringify(document[2] === "categories" ? CATEGORIES : PRODUCTS[DOCS[document[1]]] ?? []));
    }
    return { ok: false, status: 404 };
  };
}

test("fetchPromos interroge la page du magasin puis l'API, avec le Referer du lecteur", async () => {
  const calls = [];
  const result = await fetchPromos("2026-W46", { fetch: fakeFetch(calls), now: new Date("2026-11-10T08:00:00Z") });
  assert.deepEqual(result.catalogs.map((c) => c.code), ["26G311G", "26G312G"]);
  const documentCalls = calls.filter((c) => c.url.includes("/document/"));
  assert.equal(documentCalls.length, 4, "produits et rayons des deux seuls catalogues utiles");
  for (const call of calls.filter((c) => c.url.includes("-api."))) {
    assert.equal(call.headers.Referer, "https://nos-catalogues-promos-v2.e.leclerc/");
    assert.match(call.headers["User-Agent"], /^MiamMiam/);
  }
});

test("fetchPromos échoue clairement sans catalogue pour la semaine", async () => {
  await assert.rejects(fetchPromos("2027-W10", { fetch: fakeFetch([]) }), /aucun catalogue alimentaire valable le mardi/);
});

test("fetchPromos signale une erreur HTTP", async () => {
  const fetch = async () => ({ ok: false, status: 403 });
  await assert.rejects(fetchPromos("2026-W46", { fetch }), /HTTP 403/);
});

test("updatePromos enregistre les promos dans data/promos et les pousse", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "miammiam-promos-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const pushed = [];
  const deps = {
    root,
    fetchPromos: (week) => fetchPromos(week, { fetch: fakeFetch([]) }),
    pushData: async (message) => pushed.push(message),
    warn: () => {},
  };
  const result = await updatePromos("2026-W46", deps);
  assert.deepEqual(loadPromos("2026-W46", root), result);
  assert.deepEqual(pushed, ["data: promos de 2026-W46"]);
  assert.equal(loadPromos("2026-W47", root), null);
});

test("pricePerKg déduit le prix au kilo payé selon la forme de l'offre", async () => {
  const { pricePerKg } = await import("../lib/promos.js");
  const promo = (extra) => ({ price: 10, effectivePrice: 10, unit: "", details: "", ...extra });
  assert.equal(pricePerKg(promo({ unit: "Le kg", effectivePrice: 11.99 })), 11.99);
  assert.equal(pricePerKg(promo({ unit: "Les 100 g", effectivePrice: 1.63 })), 16.3);
  assert.equal(pricePerKg(promo({ unit: "Le sachet de 1,5 kg", effectivePrice: 3 })), 2);
  assert.equal(pricePerKg(promo({ price: 6.95, effectivePrice: 4.59, unitPrice: "Le kg : 9,17 €", details: "Le kg : 13,90 €." })), 9.17);
  assert.equal(pricePerKg(promo({ price: 4.59, effectivePrice: 3.67, cardOnly: true, unitPrice: "Le kg : 13,11 €" })), 10.48);
  assert.equal(pricePerKg(promo({ price: 8, effectivePrice: 4, details: "500 g.Le kg : 16 €." })), 8);
  assert.equal(pricePerKg(promo({ details: "La pièce." })), null);
});

test("freshPromos ne garde que le frais brut et cite les prix habituels du catalogue", async () => {
  const { freshPromos, formatFreshPromo } = await import("../lib/promos.js");
  const promo = (product, category, extra = {}) => ({ product, brand: "", category, details: "", offer: "Prix promo", price: 10, unit: "Le kg", effectivePrice: 10, ...extra });
  const fresh = freshPromos({ promos: [
    promo("Filet de saumon", "Viandes et poissons", { price: 11.99, effectivePrice: 11.99 }),
    promo("Saumon fumé de l'atlantique", "Viandes et poissons"),
    promo("Colin d'Alaska pané MSC", "Viandes et poissons"),
    promo("Pommes bicolores", "Fruits et légumes"),
    promo("Pommes de terre four puree potage", "Fruits et légumes"),
    promo("Pizza royale", "Épicerie"),
  ] }, [
    { name: "pavé de saumon", aisle: "Viandes et poissons", unit: "g", unitPrice: 19.8 },
    { name: "sauce soja", aisle: "Épicerie", unit: "c. à soupe", unitPrice: 0.1 },
  ]);
  assert.deepEqual(fresh.map((item) => item.product), ["Pommes de terre four puree potage", "Filet de saumon"]);
  assert.equal(formatFreshPromo(fresh[1]), "[Viandes et poissons] Filet de saumon : 11,99 €/kg | Prix promo | prix habituels du catalogue : pavé de saumon 19,80 €/kg");
  assert.deepEqual(freshPromos(null), []);
});
