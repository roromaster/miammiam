import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadPlan, savePlan, publishedPlans, previousTitles, previousSunday, planHash } from "../lib/store.js";
import { makePlan, withMeal } from "./helpers.js";

function tempRoot(t) {
  const root = mkdtempSync(join(tmpdir(), "miammiam-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test("une proposition reste hors de data/weeks", (t) => {
  const root = tempRoot(t);
  savePlan(makePlan(), root);
  assert.ok(existsSync(join(root, "data/proposals/2026-W46.json")));
  assert.ok(!existsSync(join(root, "data/weeks/2026-W46.json")));
  assert.equal(loadPlan("2026-W46", root).status, "proposed");
});

test("la validation déplace le plan et supprime la proposition", (t) => {
  const root = tempRoot(t);
  savePlan(makePlan(), root);
  savePlan(makePlan({ status: "validated" }), root);
  assert.ok(!existsSync(join(root, "data/proposals/2026-W46.json")));
  assert.equal(loadPlan("2026-W46", root).status, "validated");
});

test("loadPlan renvoie null pour une semaine inconnue", (t) => {
  assert.equal(loadPlan("2026-W01", tempRoot(t)), null);
});

test("publishedPlans ignore les propositions et trie à travers les années", (t) => {
  const root = tempRoot(t);
  savePlan(makePlan({ week: "2026-W53", startDate: "2026-12-28", status: "sent" }), root);
  savePlan(makePlan({ week: "2027-W01", startDate: "2027-01-04", status: "validated" }), root);
  savePlan(makePlan({ week: "2027-W02", startDate: "2027-01-11" }), root);
  assert.deepEqual(publishedPlans(root).map((p) => p.week), ["2027-W01", "2026-W53"]);
});

test("previousTitles couvre les 4 semaines précédentes", (t) => {
  const root = tempRoot(t);
  const stored = (week, title, status = "sent") => savePlan(withMeal(makePlan({ week, status }), "lundi", "midi", { title }), root);
  stored("2026-W41", "Trop ancien");
  stored("2026-W42", "Limite");
  stored("2026-W45", "Récent", "proposed");
  stored("2026-W46", "Même semaine");
  const titles = previousTitles("2026-W46", root);
  assert.ok(titles.includes("Limite"));
  assert.ok(titles.includes("Récent"));
  assert.ok(!titles.includes("Trop ancien"));
  assert.ok(!titles.includes("Même semaine"));
});

test("previousTitles remonte dans l'année précédente", (t) => {
  const root = tempRoot(t);
  savePlan(withMeal(makePlan({ week: "2026-W53", status: "sent" }), "lundi", "midi", { title: "Réveillon" }), root);
  assert.ok(previousTitles("2027-W01", root).includes("Réveillon"));
});

test("planHash ne dépend pas du statut, mais du contenu", () => {
  assert.equal(planHash(makePlan()), planHash(makePlan({ status: "sent" })));
  assert.notEqual(planHash(makePlan()), planHash(withMeal(makePlan(), "lundi", "midi", { title: "Autre" })));
});

test("planHash ne dépend pas de notified", () => {
  assert.equal(planHash(makePlan()), planHash(makePlan({ notified: true })));
});

test("previousTitles ignore les restes", (t) => {
  const root = tempRoot(t);
  savePlan(makePlan({ week: "2026-W45", startDate: "2026-11-02", status: "sent" }), root);
  const titles = previousTitles("2026-W46", root);
  assert.ok(titles.includes("Plat du lundi soir"));
  assert.ok(!titles.includes("Restes : Plat du lundi soir"));
});

test("previousSunday renvoie le dimanche soir de la semaine précédente", (t) => {
  const root = tempRoot(t);
  assert.equal(previousSunday("2026-W46", root), null);
  savePlan(makePlan({ week: "2026-W45", startDate: "2026-11-02", status: "sent" }), root);
  assert.equal(previousSunday("2026-W46", root).title, "Plat du dimanche soir");
});
