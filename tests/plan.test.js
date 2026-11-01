import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePlan } from "../lib/plan.js";
import { makePlan, makeMeal, makeLeftovers, withMeal } from "./helpers.js";

const errorsFor = (plan, opts) => validatePlan(plan, opts).join(" | ");

test("un plan complet est valide", () => {
  assert.deepEqual(validatePlan(makePlan()), []);
});

test("il faut exactement 14 repas", () => {
  const plan = makePlan();
  plan.meals.pop();
  assert.match(errorsFor(plan), /14/);
});

test("un même repas ne peut pas apparaître deux fois", () => {
  const plan = makePlan();
  plan.meals[1] = makeMeal("lundi", "midi", { title: "Autre" });
  assert.match(errorsFor(plan), /lundi midi/);
});

test("les limites de temps dépendent du jour", () => {
  assert.match(errorsFor(withMeal(makePlan(), "mardi", "soir", { minutes: 31 })), /mardi soir/);
  assert.deepEqual(validatePlan(withMeal(makePlan(), "mardi", "soir", { minutes: 30 })), []);
  assert.deepEqual(validatePlan(withMeal(makePlan(), "samedi", "midi", { minutes: 90 })), []);
  assert.match(errorsFor(withMeal(makePlan(), "samedi", "midi", { minutes: 91 })), /samedi midi/);
});

test("les portions couvrent 4 personnes, ou 8 quand il faut des restes", () => {
  assert.match(errorsFor(withMeal(makePlan(), "samedi", "midi", { servings: 3 })), /4/);
  assert.match(errorsFor(withMeal(makePlan(), "lundi", "soir", { servings: 4 })), /8/);
  assert.match(errorsFor(withMeal(makePlan(), "dimanche", "soir", { servings: 4 })), /8/);
  assert.match(errorsFor(withMeal(makePlan(), "vendredi", "soir", { servings: 8 })), /4/);
});

const ingredient = (o) => [{ name: "riz", quantity: 1, unit: "g", aisle: "Épicerie", staple: false, ...o }];

test("unité et rayon appartiennent aux listes fermées", () => {
  assert.match(errorsFor(withMeal(makePlan(), "lundi", "soir", { ingredients: ingredient({ unit: "poignée" }) })), /poignée/);
  assert.match(errorsFor(withMeal(makePlan(), "lundi", "soir", { ingredients: ingredient({ aisle: "Divers" }) })), /Divers/);
});

test("une quantité doit être positive", () => {
  assert.match(errorsFor(withMeal(makePlan(), "lundi", "soir", { ingredients: ingredient({ quantity: 0 }) })), /quantité/);
});

test("une recette a des ingrédients et des étapes", () => {
  assert.match(errorsFor(withMeal(makePlan(), "lundi", "soir", { steps: [] })), /étape/);
  assert.match(errorsFor(withMeal(makePlan(), "lundi", "soir", { ingredients: [] })), /ingrédient/);
});

test("startDate correspond à la semaine", () => {
  assert.match(errorsFor(makePlan({ startDate: "2026-11-10" })), /startDate/);
});

test("le statut doit être connu", () => {
  assert.match(errorsFor(makePlan({ status: "brouillon" })), /status/);
});

test("deux repas de la semaine ne portent pas le même titre", () => {
  const plan = withMeal(makePlan(), "mardi", "soir", { title: "Plat du lundi soir" });
  assert.match(errorsFor(plan), /deux fois/);
});

test("un plat des semaines précédentes est refusé, à la casse près", () => {
  const errors = errorsFor(makePlan(), { previousTitles: ["PLAT DU LUNDI MIDI"] });
  assert.match(errors, /semaines précédentes/);
});

test("les midis de semaine sont les restes de la veille au soir", () => {
  const plan = withMeal(makePlan(), "mercredi", "midi", makeMeal("mercredi", "midi"));
  assert.match(errorsFor(plan), /mercredi midi.*restes/);
  assert.match(errorsFor(withMeal(makePlan(), "mercredi", "midi", { leftoversOf: "lundi" })), /mardi/);
  assert.match(errorsFor(withMeal(makePlan(), "mercredi", "midi", { title: "Restes : autre chose" })), /Plat du mardi soir/);
});

test("des restes n'ont ni ingrédients ni étapes", () => {
  const plan = withMeal(makePlan(), "mardi", "midi", { steps: ["Cuire"] });
  assert.match(errorsFor(plan), /mardi midi/);
});

test("le week-end, le midi reste un vrai repas", () => {
  const plan = withMeal(makePlan(), "samedi", "midi", makeLeftovers("samedi", "vendredi", { slot: "midi" }));
  assert.match(errorsFor(plan), /samedi midi/);
});

test("le lundi midi reprend le dimanche soir de la semaine précédente", () => {
  const previousSunday = makeMeal("dimanche", "soir", { title: "Daube de bœuf" });
  const good = withMeal(makePlan(), "lundi", "midi", makeLeftovers("lundi", "dimanche", { title: "Restes : Daube de bœuf" }));
  assert.deepEqual(validatePlan(good, { previousSunday }), []);
  assert.match(errorsFor(makePlan(), { previousSunday }), /lundi midi.*restes/);
  assert.match(errorsFor(good), /lundi midi/);
});

test("sans semaine précédente, le lundi midi est une vraie recette", () => {
  assert.deepEqual(validatePlan(makePlan()), []);
});

test("les fromages refusés sont bloqués, y compris sans accent ou au pluriel", () => {
  const withIngredient = (name) => withMeal(makePlan(), "samedi", "midi", {
    ingredients: [{ name, quantity: 1, unit: "g", aisle: "Produits laitiers", staple: false }],
  });
  for (const name of ["chèvre", "chevre frais", "roblochon", "reblochon", "parmesan râpé", "Mozzarella", "feta", "fromage râpé", "mascarpone"]) {
    assert.match(errorsFor(withIngredient(name)), /fromage/i, name);
  }
  for (const name of ["comté", "gruyère râpé", "emmental", "fromage blanc", "crème fraîche", "brioche"]) {
    assert.deepEqual(validatePlan(withIngredient(name)), [], name);
  }
  assert.match(errorsFor(withIngredient("brie")), /fromage/i);
});

test("le titre et l'accompagnement ne citent pas de fromage refusé", () => {
  assert.match(errorsFor(withMeal(makePlan(), "samedi", "midi", { title: "Tarte au chèvre" })), /fromage/i);
  assert.match(errorsFor(withMeal(makePlan(), "samedi", "midi", { side: "Salade au parmesan" })), /fromage/i);
});

test("le vendredi soir comporte une pièce du boucher", () => {
  const plan = withMeal(makePlan(), "vendredi", "soir", {
    ingredients: [{ name: "riz", quantity: 1, unit: "g", aisle: "Épicerie", staple: false }],
  });
  assert.match(errorsFor(plan), /vendredi soir.*boucher/);
});

test("le rayon du boucher est réservé au vendredi soir", () => {
  const plan = withMeal(makePlan(), "mardi", "soir", {
    ingredients: [{ name: "bavette", quantity: 1, unit: "g", aisle: "Boucher (à acheter vendredi)", staple: false }],
  });
  assert.match(errorsFor(plan), /mardi soir.*boucher/);
});

test("chaque vrai repas a une cuisine connue", () => {
  assert.match(errorsFor(withMeal(makePlan(), "samedi", "midi", { cuisine: "grecque" })), /grecque/);
});

test("la semaine varie au moins 4 cuisines", () => {
  const plan = makePlan();
  plan.meals = plan.meals.map((m) => (m.leftoversOf ? m : { ...m, cuisine: "française" }));
  assert.match(errorsFor(plan), /4 cuisines/);
});

test("un burger au plus par semaine", () => {
  let plan = withMeal(makePlan(), "samedi", "midi", { cuisine: "burger" });
  assert.deepEqual(validatePlan(plan), []);
  plan = withMeal(plan, "samedi", "soir", { cuisine: "burger" });
  assert.match(errorsFor(plan), /burger/);
});

test("chaque vrai repas a son propre accompagnement", () => {
  assert.match(errorsFor(withMeal(makePlan(), "samedi", "midi", { side: "" })), /accompagnement/);
  assert.match(errorsFor(withMeal(makePlan(), "samedi", "midi", { side: "Accompagnement du lundi soir" })), /accompagnement/);
});
