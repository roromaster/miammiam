import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkPlan, notifyProposal, republish, saveProposal, sendWeekly, validateWeek } from "../lib/workflow.js";
import { loadPlan, savePlan } from "../lib/store.js";
import { makePlan, makeLeftovers, withMeal } from "./helpers.js";

const WEEK = "2026-W46";

function setup(t, { recipients = { owner: "a@example.com", recipients: ["a@example.com", "b@example.com"] } } = {}) {
  const root = mkdtempSync(join(tmpdir(), "miammiam-flow-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  if (recipients) {
    mkdirSync(join(root, "config"));
    writeFileSync(join(root, "config/recipients.local.json"), JSON.stringify(recipients));
  }
  const order = [];
  const deps = {
    root,
    publish: async () => { order.push("publish"); return `https://example.com/${WEEK}/`; },
    send: async (mime) => { order.push("send"); deps.mimes.push(mime); },
    readImage: () => Buffer.from("png"),
    pushState: async () => { order.push(`push:${loadPlan(WEEK, root).status}`); },
    warn: (message) => deps.warnings.push(message),
    mimes: [],
    warnings: [],
  };
  return { root, deps, order };
}

test("saveProposal écrit un plan valide en proposed", (t) => {
  const { root, deps } = setup(t);
  assert.deepEqual(saveProposal(makePlan({ status: "validated" }), deps), { saved: true, errors: [] });
  assert.equal(loadPlan(WEEK, root).status, "proposed");
});

test("saveProposal n'écrase jamais un plan existant", (t) => {
  const { root, deps } = setup(t);
  savePlan(makePlan({ status: "sent" }), root);
  const result = saveProposal(withMeal(makePlan(), "lundi", "midi", { title: "Autre" }), deps);
  assert.deepEqual(result, { saved: false, errors: [] });
  assert.equal(loadPlan(WEEK, root).status, "sent");
  assert.equal(loadPlan(WEEK, root).meals[0].title, "Plat du lundi midi");
});

test("saveProposal refuse un plan invalide ou un plat récent", (t) => {
  const { root, deps } = setup(t);
  const invalid = saveProposal(withMeal(makePlan(), "mardi", "soir", { minutes: 45 }), deps);
  assert.equal(invalid.saved, false);
  assert.ok(invalid.errors.length > 0);
  savePlan(withMeal(makePlan({ week: "2026-W45", startDate: "2026-11-02", status: "sent" }), "lundi", "midi", { title: "Plat du mardi soir" }), root);
  const repeated = saveProposal(makePlan(), deps);
  assert.equal(repeated.saved, false);
  assert.match(repeated.errors.join(), /précédentes/);
  assert.equal(loadPlan(WEEK, root), null);
});

test("notifyProposal envoie une seule fois, à tous les destinataires", async (t) => {
  const { root, deps } = setup(t);
  savePlan(makePlan(), root);
  assert.deepEqual(await notifyProposal(WEEK, deps), { sent: true });
  assert.match(deps.mimes[0], /^To: a@example\.com, b@example\.com\r$/m);
  assert.deepEqual(await notifyProposal(WEEK, deps), { sent: false });
  assert.equal(deps.mimes.length, 1);
});

test("notifyProposal peut être relancée après un échec d'envoi", async (t) => {
  const { root, deps } = setup(t);
  savePlan(makePlan(), root);
  const send = deps.send;
  deps.send = async () => { throw new Error("réseau"); };
  await assert.rejects(notifyProposal(WEEK, deps), /réseau/);
  deps.send = send;
  assert.deepEqual(await notifyProposal(WEEK, deps), { sent: true });
});

test("notifyProposal ne fait rien après validation", async (t) => {
  const { root, deps } = setup(t);
  savePlan(makePlan({ status: "validated" }), root);
  assert.deepEqual(await notifyProposal(WEEK, deps), { sent: false });
  assert.equal(deps.mimes.length, 0);
});

test("validateWeek publie et passe en validated", async (t) => {
  const { root, deps, order } = setup(t);
  savePlan(makePlan(), root);
  assert.equal(await validateWeek(WEEK, deps), `https://example.com/${WEEK}/`);
  assert.equal(loadPlan(WEEK, root).status, "validated");
  assert.deepEqual(order, ["publish"]);
});

test("validateWeek refuse un plan absent ou invalide", async (t) => {
  const { root, deps, order } = setup(t);
  await assert.rejects(validateWeek(WEEK, deps), /plan absent/);
  savePlan(withMeal(makePlan(), "mardi", "soir", { minutes: 45 }), root);
  await assert.rejects(validateWeek(WEEK, deps), /mardi soir/);
  assert.deepEqual(order, []);
  assert.equal(loadPlan(WEEK, root).status, "proposed");
});

test("validateWeek ne rétrograde pas une semaine déjà envoyée", async (t) => {
  const { root, deps } = setup(t);
  savePlan(makePlan({ status: "sent" }), root);
  await validateWeek(WEEK, deps);
  assert.equal(loadPlan(WEEK, root).status, "sent");
});

test("sendWeekly ne renvoie jamais une semaine envoyée", async (t) => {
  const { root, deps, order } = setup(t);
  savePlan(makePlan({ status: "sent" }), root);
  assert.deepEqual(await sendWeekly(WEEK, deps), { sent: false, reason: "déjà envoyé" });
  assert.deepEqual(order, []);
});

test("sendWeekly échoue si le plan est absent", async (t) => {
  const { deps } = setup(t);
  await assert.rejects(sendWeekly(WEEK, deps), /plan absent/);
});

test("sendWeekly envoie une proposition non validée, aux deux destinataires", async (t) => {
  const { root, deps, order } = setup(t);
  savePlan(makePlan(), root);
  assert.deepEqual(await sendWeekly(WEEK, deps), { sent: true });
  assert.match(deps.mimes[0], /^To: a@example\.com, b@example\.com\r$/m);
  assert.deepEqual(order, ["publish", "send", "push:sent"]);
  assert.equal(loadPlan(WEEK, root).status, "sent");
});

test("sendWeekly vérifie les destinataires avant de publier", async (t) => {
  const { root, deps, order } = setup(t, { recipients: null });
  savePlan(makePlan(), root);
  await assert.rejects(sendWeekly(WEEK, deps), /recipients\.local\.json/);
  assert.deepEqual(order, []);
  assert.equal(loadPlan(WEEK, root).status, "proposed");
});

test("sendWeekly refuse un plan invalide", async (t) => {
  const { root, deps, order } = setup(t);
  savePlan(withMeal(makePlan(), "mardi", "soir", { minutes: 45 }), root);
  await assert.rejects(sendWeekly(WEEK, deps), /mardi soir/);
  assert.deepEqual(order, []);
});

test("un échec de publication bloque l'email, et la relance fonctionne", async (t) => {
  const { root, deps } = setup(t);
  savePlan(makePlan(), root);
  const publish = deps.publish;
  deps.publish = async () => { throw new Error("Publication non confirmée"); };
  await assert.rejects(sendWeekly(WEEK, deps), /Publication non confirmée/);
  assert.equal(deps.mimes.length, 0);
  assert.notEqual(loadPlan(WEEK, root).status, "sent");
  deps.publish = publish;
  assert.deepEqual(await sendWeekly(WEEK, deps), { sent: true });
});

test("un échec d'envoi laisse la semaine à renvoyer", async (t) => {
  const { root, deps } = setup(t);
  savePlan(makePlan({ status: "validated" }), root);
  const send = deps.send;
  deps.send = async () => { throw new Error("invalid_grant"); };
  await assert.rejects(sendWeekly(WEEK, deps), /invalid_grant/);
  assert.equal(loadPlan(WEEK, root).status, "validated");
  deps.send = send;
  assert.deepEqual(await sendWeekly(WEEK, deps), { sent: true });
});

test("un échec de push après l'envoi reste un simple avertissement", async (t) => {
  const { root, deps } = setup(t);
  savePlan(makePlan({ status: "validated" }), root);
  deps.pushState = async () => { throw new Error("push refusé"); };
  assert.deepEqual(await sendWeekly(WEEK, deps), { sent: true });
  assert.equal(loadPlan(WEEK, root).status, "sent");
  assert.match(deps.warnings[0], /push refusé/);
});

test("republish publie sans email ni changement d'état", async (t) => {
  const { root, deps, order } = setup(t);
  savePlan(makePlan({ status: "sent" }), root);
  await republish(WEEK, deps);
  assert.deepEqual(order, ["publish"]);
  assert.equal(deps.mimes.length, 0);
  assert.equal(loadPlan(WEEK, root).status, "sent");
});

test("republish refuse une proposition", async (t) => {
  const { root, deps, order } = setup(t);
  savePlan(makePlan(), root);
  await assert.rejects(republish(WEEK, deps), /non publiée/);
  assert.deepEqual(order, []);
});

test("checkPlan contrôle les plats récents", (t) => {
  const { root, deps } = setup(t);
  savePlan(withMeal(makePlan({ week: "2026-W45", startDate: "2026-11-02", status: "sent" }), "lundi", "midi", { title: "Plat du mardi soir" }), root);
  assert.match(checkPlan(makePlan(), deps).join(), /précédentes/);
});

test("le lundi midi est contrôlé avec le dimanche de la semaine précédente", (t) => {
  const { root, deps } = setup(t);
  savePlan(makePlan({ week: "2026-W45", startDate: "2026-11-02", status: "sent" }), root);
  const plan = withMeal(makePlan(), "lundi", "midi", makeLeftovers("lundi", "dimanche"));
  plan.meals = plan.meals.map((m) => (m.leftoversOf || m.title.startsWith("Restes") ? m : { ...m, title: `Nouveau ${m.title}` }));
  plan.meals = plan.meals.map((m) => (m.leftoversOf && m.leftoversOf !== "dimanche" ? { ...m, title: `Restes : Nouveau Plat du ${m.leftoversOf} soir` } : m));
  assert.deepEqual(checkPlan(plan, deps), []);
});
