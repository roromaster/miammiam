import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePlan } from "../lib/plan.js";
import { makePlan, makeMeal, withMeal } from "./helpers.js";

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

test("les portions sont pour 4 personnes", () => {
  assert.match(errorsFor(withMeal(makePlan(), "lundi", "soir", { servings: 3 })), /4/);
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
  const plan = withMeal(makePlan(), "mardi", "midi", { title: "Plat du lundi midi" });
  assert.match(errorsFor(plan), /deux fois/);
});

test("un plat des semaines précédentes est refusé, à la casse près", () => {
  const errors = errorsFor(makePlan(), { previousTitles: ["PLAT DU LUNDI MIDI"] });
  assert.match(errors, /semaines précédentes/);
});
