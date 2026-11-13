import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkPlan, promoWarnings, notifyProposal, renotifyProposal, republish, resendWeekly, saveProposal, sendWeekly, validateWeek } from "../lib/workflow.js";
import { loadCatalog, loadPlan, saveCatalog, savePlan } from "../lib/store.js";
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
    pushData: async (message) => { order.push(`push:${loadPlan(WEEK, root).status}`); deps.pushes.push(message); },
    warn: (message) => deps.warnings.push(message),
    mimes: [],
    warnings: [],
    pushes: [],
  };
  return { root, deps, order };
}

test("saveProposal écrit un plan valide en proposed et le pousse", async (t) => {
  const { root, deps } = setup(t);
  assert.deepEqual(await saveProposal(makePlan({ status: "validated" }), deps), { saved: true, errors: [], added: ["riz", "entrecôte"], warnings: [] });
  assert.equal(loadPlan(WEEK, root).status, "proposed");
  assert.deepEqual(deps.pushes, [`data: proposition de ${WEEK}`]);
});

test("saveProposal garde la proposition si le push échoue", async (t) => {
  const { root, deps } = setup(t);
  deps.pushData = async () => { throw new Error("push refusé"); };
  assert.equal((await saveProposal(makePlan(), deps)).saved, true);
  assert.equal(loadPlan(WEEK, root).status, "proposed");
  assert.match(deps.warnings[0], /push refusé/);
});

test("saveProposal n'écrase jamais un plan existant", async (t) => {
  const { root, deps } = setup(t);
  savePlan(makePlan({ status: "sent" }), root);
  const result = await saveProposal(withMeal(makePlan(), "lundi", "midi", { title: "Autre" }), deps);
  assert.deepEqual(result, { saved: false, errors: [] });
  assert.deepEqual(deps.pushes, []);
  assert.equal(loadPlan(WEEK, root).status, "sent");
  assert.equal(loadPlan(WEEK, root).meals[0].title, "Plat du lundi midi");
});

test("saveProposal refuse un plan invalide ou un plat récent", async (t) => {
  const { root, deps } = setup(t);
  const invalid = await saveProposal(withMeal(makePlan(), "mardi", "soir", { minutes: 45 }), deps);
  assert.equal(invalid.saved, false);
  assert.ok(invalid.errors.length > 0);
  savePlan(withMeal(makePlan({ week: "2026-W45", startDate: "2026-11-02", status: "sent" }), "lundi", "midi", { title: "Plat du mardi soir" }), root);
  const repeated = await saveProposal(makePlan(), deps);
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
  assert.equal(loadPlan(WEEK, root).notified, true);
  assert.deepEqual(deps.pushes, [`data: proposition de ${WEEK} notifiée`]);
});

test("notifyProposal : un push refusé après l'envoi reste un avertissement", async (t) => {
  const { root, deps } = setup(t);
  savePlan(makePlan(), root);
  deps.pushData = async () => { throw new Error("push refusé"); };
  assert.deepEqual(await notifyProposal(WEEK, deps), { sent: true });
  assert.equal(loadPlan(WEEK, root).notified, true);
  assert.match(deps.warnings[0], /push refusé/);
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

test("renotifyProposal renvoie la proposition à chaque demande", async (t) => {
  const { root, deps } = setup(t);
  savePlan(makePlan({ notified: true }), root);
  await renotifyProposal(WEEK, deps);
  await renotifyProposal(WEEK, deps);
  assert.equal(deps.mimes.length, 2);
  assert.match(deps.mimes[0], /^To: a@example\.com, b@example\.com\r$/m);
  const [, subject] = deps.mimes[0].match(/^Subject: =\?UTF-8\?B\?(.+)\?=$/m);
  assert.match(Buffer.from(subject, "base64").toString("utf8"), /^🍽️ À valider \(mise à jour\) : /);
  assert.deepEqual(deps.pushes, []);
});

test("renotifyProposal marque la proposition comme notifiée et bloque l'envoi du dimanche", async (t) => {
  const { root, deps } = setup(t);
  savePlan(makePlan(), root);
  await renotifyProposal(WEEK, deps);
  assert.equal(loadPlan(WEEK, root).notified, true);
  assert.deepEqual(await notifyProposal(WEEK, deps), { sent: false });
  assert.equal(deps.mimes.length, 1);
});

test("renotifyProposal refuse une semaine validée", async (t) => {
  const { root, deps } = setup(t);
  savePlan(makePlan({ status: "validated" }), root);
  await assert.rejects(renotifyProposal(WEEK, deps), /déjà validée/);
  assert.equal(deps.mimes.length, 0);
});

test("renotifyProposal refuse un plan invalide", async (t) => {
  const { root, deps } = setup(t);
  savePlan(withMeal(makePlan(), "mardi", "soir", { minutes: 45 }), root);
  await assert.rejects(renotifyProposal(WEEK, deps), /mardi soir/);
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
  deps.pushData = async () => { throw new Error("push refusé"); };
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

test("resendWeekly republie et renvoie l'email de la semaine, marqué mise à jour", async (t) => {
  const { root, deps, order } = setup(t);
  savePlan(makePlan({ status: "sent" }), root);
  await resendWeekly(WEEK, deps);
  await resendWeekly(WEEK, deps);
  assert.deepEqual(order, ["publish", "send", "publish", "send"]);
  const [, subject] = deps.mimes[0].match(/^Subject: =\?UTF-8\?B\?(.+)\?=$/m);
  assert.match(Buffer.from(subject, "base64").toString("utf8"), /\(mise à jour\)$/);
  assert.equal(loadPlan(WEEK, root).status, "sent");
  assert.deepEqual(deps.pushes, []);
});

test("resendWeekly refuse une semaine pas encore envoyée", async (t) => {
  const { root, deps } = setup(t);
  savePlan(makePlan({ status: "validated" }), root);
  await assert.rejects(resendWeekly(WEEK, deps), /pas encore envoyée/);
  assert.equal(deps.mimes.length, 0);
});

test("l'email de la semaine sort les produits du placard de la liste, sans toucher au plan", async (t) => {
  const { root, deps } = setup(t);
  mkdirSync(join(root, "data"), { recursive: true });
  writeFileSync(join(root, "data/pantry.json"), JSON.stringify(["riz"]));
  savePlan(makePlan({ status: "validated" }), root);
  await sendWeekly(WEEK, deps);
  const body = deps.mimes[0].split('text/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n')[1].split("\r\n--")[0];
  const text = Buffer.from(body.replaceAll("\r\n", ""), "base64").toString("utf8");
  assert.match(text, /À vérifier au placard\n- riz/);
  assert.doesNotMatch(text, /riz : /);
  assert.ok(loadPlan(WEEK, root).meals.every((m) => m.ingredients.every((i) => !i.staple)));
});

test("saveProposal recalcule les prix d'après le catalogue et y ajoute les ingrédients nouveaux", async (t) => {
  const { root, deps } = setup(t);
  saveCatalog([{ name: "riz", aisle: "Épicerie", unit: "g", unitPrice: 2.5 }], root);
  const { added } = await saveProposal(makePlan(), deps);
  assert.deepEqual(added, ["entrecôte"]);
  const friday = loadPlan(WEEK, root).meals.find((m) => m.day === "vendredi" && m.slot === "soir");
  assert.deepEqual(friday.ingredients.map((i) => i.price), [1, 24]);
  assert.deepEqual(loadCatalog(root).map((entry) => entry.name), ["entrecôte", "riz"]);
  assert.equal(loadCatalog(root)[0].unitPrice, 30);
});

test("saveProposal refuse un ingrédient écrit dans une autre unité que le catalogue", async (t) => {
  const { root, deps } = setup(t);
  saveCatalog([{ name: "riz", aisle: "Épicerie", unit: "pièce", unitPrice: 1 }], root);
  const { saved, errors } = await saveProposal(makePlan(), deps);
  assert.equal(saved, false);
  assert.match(errors.join("\n"), /« riz » se compte en pièce dans le catalogue, pas en g/);
  assert.equal(loadPlan(WEEK, root), null);
});

test("promoWarnings rappelle l'objectif de 3 repas bâtis autour d'une promo fraîche", (t) => {
  const { root, deps } = setup(t);
  const promo = (product) => ({ product, brand: "", category: "Viandes et poissons", details: "", offer: "Prix promo", price: 10, unit: "Le kg", effectivePrice: 10 });
  mkdirSync(join(root, "data/promos"), { recursive: true });
  const write = (promos) => writeFileSync(join(root, "data/promos", `${WEEK}.json`), JSON.stringify({ week: WEEK, promos }));
  const fish = { name: "saumon", quantity: 600, unit: "g", aisle: "Viandes et poissons", staple: false, price: 7, promo: "Prix promo" };
  const built = (days) => days.reduce((plan, day) => withMeal(plan, day, "soir", { ingredients: [fish] }), makePlan());

  assert.deepEqual(promoWarnings(makePlan(), deps), []);
  write([promo("Filet de saumon"), promo("Paleron")]);
  assert.deepEqual(promoWarnings(makePlan(), deps), []);
  write([promo("Filet de saumon"), promo("Paleron"), promo("Moules de bouchot")]);
  assert.match(promoWarnings(built(["lundi"]), deps)[0], /^1 repas bâti\(s\) autour d'une promo fraîche, pour un objectif de 3 \(3 promos fraîches disponibles\)\. Expliquer/);
  assert.doesNotMatch(promoWarnings({ ...built(["lundi"]), promosSkipped: ["Moules : pas cette semaine"] }, deps)[0], /Expliquer/);
  assert.deepEqual(promoWarnings(built(["lundi", "mardi", "mercredi"]), deps), []);
});
