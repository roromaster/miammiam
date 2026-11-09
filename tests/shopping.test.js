import { test } from "node:test";
import assert from "node:assert/strict";
import { shoppingList, formatItem, formatPricedItem, formatPrice, mealPrice, weekPrice } from "../lib/shopping.js";
import { makePlan, makeMeal } from "./helpers.js";

const item = (name, quantity, unit, extra = {}) => ({ name, quantity, unit, aisle: "Épicerie", staple: false, price: 1, ...extra });

function planWith(mardi, lundiMidi = [item("eau", 1, "l", { staple: true })]) {
  const plan = makePlan();
  plan.meals = plan.meals.map((m) => {
    if (m.day === "mardi" && m.slot === "soir") return makeMeal("mardi", "soir", { ingredients: mardi });
    if (m.day === "lundi" && m.slot === "midi") return makeMeal("lundi", "midi", { ingredients: lundiMidi });
    return makeMeal(m.day, m.slot, { ingredients: [item("eau", 1, "l", { staple: true })] });
  });
  return plan;
}

const allItems = (list) => list.aisles.flatMap((a) => a.items);
const formatted = (list) => allItems(list).map(formatItem);

test("additionne les quantités d'un même ingrédient", () => {
  const list = shoppingList(planWith([item("riz", 200, "g"), item("riz", 300, "g")]));
  assert.deepEqual(allItems(list), [{ name: "riz", quantity: 500, unit: "g", price: 2 }]);
});

test("ignore les espaces et la casse des noms", () => {
  const list = shoppingList(planWith([item("Oignon ", 1, "pièce"), item("oignon", 2, "pièce")]));
  assert.deepEqual(formatted(list), ["oignon : 3 pièces"]);
});

test("convertit les masses avant addition", () => {
  const list = shoppingList(planWith([item("farine", 500, "g"), item("farine", 1, "kg")]));
  assert.deepEqual(formatted(list), ["farine : 1,5 kg"]);
});

test("convertit les volumes avant addition", () => {
  const list = shoppingList(planWith([item("lait", 50, "cl"), item("lait", 1, "l")]));
  assert.deepEqual(formatted(list), ["lait : 1,5 l"]);
});

test("évite les erreurs d'arrondi", () => {
  const list = shoppingList(planWith([item("miel", 0.1, "c. à soupe"), item("miel", 0.2, "c. à soupe")]));
  assert.equal(allItems(list)[0].quantity, 0.3);
});

test("garde séparées les unités incompatibles", () => {
  const list = shoppingList(planWith([item("carotte", 2, "pièce"), item("carotte", 200, "g")]));
  assert.deepEqual(formatted(list).sort(), ["carotte : 2 pièces", "carotte : 200 g"]);
});

test("les produits de base vont au placard", () => {
  const list = shoppingList(planWith([item("sel", 1, "c. à café", { staple: true }), item("riz", 1, "g")]));
  assert.ok(list.pantry.includes("sel"));
  assert.ok(!allItems(list).some((i) => i.name === "sel"));
});

test("les ingrédients du lundi midi vont au placard", () => {
  const list = shoppingList(planWith([item("riz", 1, "g")], [item("thon", 200, "g")]));
  assert.ok(list.pantry.includes("thon"));
  assert.ok(!allItems(list).some((i) => i.name === "thon"));
});

test("un ingrédient du lundi midi reste à acheter pour les autres repas, sans sa quantité", () => {
  const list = shoppingList(planWith([item("riz", 100, "g")], [item("riz", 400, "g")]));
  assert.ok(list.pantry.includes("riz"));
  assert.deepEqual(allItems(list), [{ name: "riz", quantity: 100, unit: "g", price: 1 }]);
});

test("le placard ne contient pas de doublon", () => {
  const list = shoppingList(planWith([item("riz", 1, "g")]));
  assert.deepEqual(list.pantry, ["eau"]);
});

test("suit l'ordre des rayons et trie par nom", () => {
  const list = shoppingList(planWith([
    item("riz", 1, "g"),
    item("épinard", 1, "g", { aisle: "Fruits et légumes" }),
    item("carotte", 1, "g", { aisle: "Fruits et légumes" }),
    item("abricot", 1, "g", { aisle: "Fruits et légumes" }),
  ]));
  assert.deepEqual(list.aisles.map((a) => a.aisle), ["Fruits et légumes", "Épicerie"]);
  assert.deepEqual(list.aisles[0].items.map((i) => i.name), ["abricot", "carotte", "épinard"]);
});

test("un même ingrédient classé dans deux rayons reste sur une seule ligne", () => {
  const list = shoppingList(planWith([
    item("crème", 10, "cl", { aisle: "Produits laitiers" }),
    item("crème", 10, "cl", { aisle: "Épicerie" }),
  ]));
  assert.deepEqual(formatted(list), ["crème : 20 cl"]);
});

test("formatItem garde une unité lisible", () => {
  assert.equal(formatItem({ name: "beurre", quantity: 900, unit: "g" }), "beurre : 900 g");
  assert.equal(formatItem({ name: "ail", quantity: 1, unit: "gousse" }), "ail : 1 gousse");
  assert.equal(formatItem({ name: "huile", quantity: 2, unit: "c. à soupe" }), "huile : 2 c. à soupe");
  assert.equal(formatItem({ name: "vin", quantity: 750, unit: "ml" }), "vin : 75 cl");
});

test("la liste additionne les prix et donne un total, sans le placard", () => {
  const list = shoppingList(planWith(
    [item("riz", 200, "g", { price: 1.1 }), item("riz", 300, "g", { price: 2.2 }), item("sel", 1, "c. à café", { staple: true, price: 0.01 })],
    [item("thon", 200, "g", { price: 3 })],
  ));
  assert.equal(allItems(list)[0].price, 3.3);
  assert.equal(list.total, 3.3);
});

test("le prix d'un repas additionne tous ses ingrédients, placard compris", () => {
  const meal = makeMeal("mardi", "soir", { ingredients: [item("riz", 1, "g", { price: 0.1 }), item("sel", 1, "g", { staple: true, price: 0.2 })] });
  assert.equal(mealPrice(meal), 0.3);
});

test("des restes ne coûtent rien de plus", () => {
  assert.equal(mealPrice({ leftoversOf: "lundi", ingredients: [] }), 0);
});

test("le prix de la semaine additionne tous les repas", () => {
  assert.equal(weekPrice(makePlan()), 34);
});

test("les prix s'écrivent en euros à la française", () => {
  assert.equal(formatPrice(3.6), "3,60 €");
  assert.equal(formatPrice(12), "12,00 €");
  assert.equal(formatPricedItem({ name: "riz", quantity: 500, unit: "g", price: 2.5 }), "riz : 500 g (≈ 2,50 €)");
});

test("un ingrédient en promo le signale dans la liste de courses", () => {
  const list = shoppingList(planWith([item("saumon", 300, "g", { promo: "Prix promo" }), item("saumon", 200, "g")]));
  assert.deepEqual(allItems(list), [{ name: "saumon", quantity: 500, unit: "g", price: 2, promo: "Prix promo" }]);
  assert.equal(formatPricedItem(allItems(list)[0]), "saumon : 500 g (≈ 2,00 €, en promo : Prix promo)");
});
