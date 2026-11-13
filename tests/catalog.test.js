import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCatalog, catalogPrice, forDisplay, validateCatalog } from "../lib/catalog.js";
import { formatItem, shoppingList } from "../lib/shopping.js";
import { loadCatalog, loadPantry } from "../lib/store.js";
import { makePlan, withMeal } from "./helpers.js";

const BUTCHER = "Boucher (à acheter vendredi)";
const CATALOG = [
  { name: "ail", aisle: "Fruits et légumes", unit: "gousse", unitPrice: 0.06, pack: { size: 10, label: "tête" } },
  { name: "Sauce soja", aisle: "Épicerie", unit: "c. à soupe", unitPrice: 0.06 },
  { name: "tomate concassée", aisle: "Épicerie", unit: "g", unitPrice: 1.5, pack: { size: 400, label: "boîte de 400 g" } },
  { name: "entrecôte", aisle: "Viandes et poissons", unit: "g", unitPrice: 32 },
];
const item = (name, quantity, unit, extra = {}) => ({ name, quantity, unit, aisle: "Surgelés", staple: false, price: 9, ...extra });
const dinner = (plan) => plan.meals.find((m) => m.day === "samedi" && m.slot === "soir").ingredients;
const priced = (ingredients, pantry) => applyCatalog(withMeal(makePlan(), "samedi", "soir", { ingredients }), CATALOG, pantry);

test("le catalogue du projet est valide et couvre tout le placard", () => {
  const catalog = loadCatalog();
  assert.deepEqual(validateCatalog(catalog), []);
  const names = new Set(catalog.map((entry) => entry.name.toLocaleLowerCase("fr")));
  assert.deepEqual(loadPantry().filter((name) => !names.has(name.toLocaleLowerCase("fr"))), []);
});

test("validateCatalog signale doublons, rayons, unités et prix invalides", () => {
  const errors = validateCatalog([
    { name: "riz", aisle: "Épicerie", unit: "g", unitPrice: 2 },
    { name: "Riz", aisle: "Cave", unit: "kg", unitPrice: 0, pack: { size: 0, label: "paquet" } },
  ]).join(" | ");
  for (const pattern of [/deux fois/, /rayon inconnu/, /unité inconnue/, /prix invalide/, /conditionnement invalide/]) assert.match(errors, pattern);
});

test("le prix se calcule au kilo, à l'unité, et convertit les cuillères", () => {
  assert.equal(catalogPrice(CATALOG[2], 1.2, "kg"), 1.8);
  assert.equal(catalogPrice(CATALOG[0], 3, "gousse"), 0.18);
  assert.equal(catalogPrice(CATALOG[1], 3, "c. à café"), 0.06);
  assert.equal(catalogPrice(CATALOG[1], 1, "c. à café"), 0.02);
  assert.equal(catalogPrice(CATALOG[0], 20, "g"), null);
});

test("applyCatalog aligne nom, rayon et prix, et garde le rayon du boucher", () => {
  const { plan, added, errors } = priced([item("sauce soja", 2, "c. à soupe"), item("Entrecôte", 500, "g", { aisle: BUTCHER })]);
  assert.deepEqual(dinner(plan).map(({ name, aisle, price }) => [name, aisle, price]), [["Sauce soja", "Épicerie", 0.12], ["entrecôte", BUTCHER, 16]]);
  assert.deepEqual(errors, []);
  assert.ok(!added.some((entry) => entry.name === "sauce soja"));
});

test("un ingrédient en promo garde son prix et reçoit le prix habituel du catalogue", () => {
  const { plan } = priced([item("tomate concassée", 800, "g", { price: 0.8, promo: "Prix promo" })]);
  assert.deepEqual(dinner(plan)[0], { name: "tomate concassée", quantity: 800, unit: "g", aisle: "Épicerie", staple: false, price: 0.8, promo: "Prix promo", regularPrice: 1.2 });
});

test("un ingrédient inconnu garde son prix estimé et entre au catalogue", () => {
  const { plan, added } = priced([item("Brocoli ", 1.5, "kg", { price: 4.5 }), item("citron vert", 2, "pièce", { price: 0.5, promo: "-20 %", regularPrice: 0.6 })]);
  assert.equal(dinner(plan)[0].price, 4.5);
  assert.deepEqual(added.filter((entry) => entry.name !== "riz" && entry.name !== "entrecôte"), [
    { name: "Brocoli", aisle: "Surgelés", unit: "g", unitPrice: 3 },
    { name: "citron vert", aisle: "Surgelés", unit: "pièce", unitPrice: 0.3 },
  ]);
});

test("une unité étrangère au catalogue est une erreur, sauf produit de base ou du placard", () => {
  assert.match(priced([item("ail", 20, "g")]).errors.join(), /samedi soir : « ail » se compte en gousse dans le catalogue, pas en g/);
  assert.deepEqual(priced([item("ail", 20, "g", { staple: true })]).errors, []);
  const kept = priced([item("ail", 20, "g")], ["Ail"]);
  assert.deepEqual(kept.errors, []);
  assert.equal(dinner(kept.plan)[0].price, 9);
});

test("la liste de courses donne le nombre de conditionnements à acheter", () => {
  const plan = withMeal(withMeal(makePlan(), "samedi", "soir", { ingredients: [item("ail", 23, "gousse"), item("tomate concassée", 400, "g")] }),
    "samedi", "midi", { ingredients: [item("tomate concassée", 0.8, "kg"), item("sauce soja", 1, "c. à soupe")] });
  const list = shoppingList(forDisplay(plan, { catalog: CATALOG, pantry: ["sauce soja"] }));
  const lines = list.aisles.flatMap((group) => group.items).map(formatItem);
  assert.ok(lines.includes("ail : 23 gousses, soit 3 têtes"));
  assert.ok(lines.includes("tomate concassée : 1,2 kg, soit 3 boîtes de 400 g"));
  assert.deepEqual(list.aisles.map((group) => group.aisle).slice(0, 2), ["Fruits et légumes", "Épicerie"]);
  assert.ok(list.pantry.includes("sauce soja"));
  assert.equal(formatItem({ name: "ail", quantity: 4, unit: "gousse", packs: { count: 1, label: "tête" } }), "ail : 4 gousses, soit 1 tête");
});
