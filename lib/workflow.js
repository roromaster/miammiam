import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadRecipients, proposalEmail, sendRaw, weeklyEmail } from "./email.js";
import { validatePlan } from "./plan.js";
import { fetchPromos, savePromos } from "./promos.js";
import { DATA_PATHS, commitAndPush, publish, pullLatest } from "./publish.js";
import { applyCatalog, forDisplay, mergeCatalog } from "./catalog.js";
import { PROJECT_ROOT, loadCatalog, loadPantry, loadPlan, previousSunday, previousTitles, saveCatalog, savePlan } from "./store.js";

export function defaultDeps(root = PROJECT_ROOT, { sync = true } = {}) {
  return {
    root,
    publish: (week) => publish(week, { root }),
    send: (mime) => sendRaw(mime),
    readImage: (week) => readFileSync(join(root, "site", week, "semaine.png")),
    fetchPromos: (week) => fetchPromos(week),
    pull: sync ? () => pullLatest({ root }) : async () => {},
    pushData: sync ? (message) => commitAndPush(message, DATA_PATHS, { root }) : async () => {},
    warn: (message) => console.error(`Attention : ${message}`),
  };
}

// Le fichier local fait foi : un push raté est repris par le prochain commitAndPush.
async function pushOrWarn(message, deps) {
  try {
    await deps.pushData(message);
  } catch (error) {
    deps.warn(`modification enregistrée ici, mais non poussée sur GitHub : ${error.message}`);
  }
}

export function checkPlan(plan, deps) {
  return validatePlan(plan, {
    previousTitles: previousTitles(plan.week, deps.root),
    previousSunday: previousSunday(plan.week, deps.root),
    pantry: loadPantry(deps.root),
  });
}

// Les emails présentent la liste sans les produits du placard et avec les conditionnements ; le plan enregistré reste intact.
const shown = (plan, deps) => forDisplay(plan, { pantry: loadPantry(deps.root), catalog: loadCatalog(deps.root) });

// Aligne le plan sur le catalogue (noms, rayons, prix) et y ajoute les ingrédients nouveaux.
export function pricePlan(plan, deps) {
  const catalog = loadCatalog(deps.root);
  const result = applyCatalog(plan, catalog, loadPantry(deps.root));
  const learn = () => { if (result.added.length > 0) saveCatalog(mergeCatalog(catalog, result.added), deps.root); };
  return { ...result, added: result.added.map((entry) => entry.name), learn };
}

function requirePlan(week, deps) {
  const plan = loadPlan(week, deps.root);
  if (!plan) throw new Error(`${week} : plan absent`);
  return plan;
}

function requireValidPlan(week, deps) {
  const plan = requirePlan(week, deps);
  const errors = checkPlan(plan, deps);
  if (errors.length > 0) throw new Error(`${week} : plan invalide\n${errors.join("\n")}`);
  return plan;
}

export async function saveProposal(plan, deps) {
  if (loadPlan(plan.week, deps.root)) return { saved: false, errors: [] };
  const priced = pricePlan({ ...plan, status: "proposed" }, deps);
  const errors = [...priced.errors, ...checkPlan(priced.plan, deps)];
  if (errors.length > 0) return { saved: false, errors };
  savePlan(priced.plan, deps.root);
  priced.learn();
  await pushOrWarn(`data: proposition de ${plan.week}`, deps);
  return { saved: true, errors: [], added: priced.added };
}

export async function notifyProposal(week, deps) {
  const plan = requirePlan(week, deps);
  if (plan.status !== "proposed" || plan.notified) return { sent: false };
  const { recipients } = loadRecipients(deps.root);
  await deps.send(proposalEmail(shown(plan, deps), { to: recipients.join(", ") }));
  savePlan({ ...plan, notified: true }, deps.root);
  await pushOrWarn(`data: proposition de ${week} notifiée`, deps);
  return { sent: true };
}

// Sur demande seulement : la tâche planifiée passe par notifyProposal, qui n'envoie qu'une fois.
export async function renotifyProposal(week, deps) {
  const plan = requireValidPlan(week, deps);
  if (plan.status !== "proposed") throw new Error(`${week} : semaine déjà validée, rien à renvoyer`);
  const { recipients } = loadRecipients(deps.root);
  await deps.send(proposalEmail(shown(plan, deps), { to: recipients.join(", "), updated: true }));
  if (!plan.notified) {
    savePlan({ ...plan, notified: true }, deps.root);
    await pushOrWarn(`data: proposition de ${week} notifiée`, deps);
  }
}

export async function validateWeek(week, deps) {
  const plan = requireValidPlan(week, deps);
  if (plan.status === "proposed") savePlan({ ...plan, status: "validated" }, deps.root);
  return deps.publish(week);
}

export async function republish(week, deps) {
  const plan = requireValidPlan(week, deps);
  if (plan.status === "proposed") throw new Error(`${week} : semaine non publiée, utilise validate`);
  return deps.publish(week);
}

export async function sendWeekly(week, deps) {
  const plan = requirePlan(week, deps);
  if (plan.status === "sent") return { sent: false, reason: "déjà envoyé" };
  const { recipients } = loadRecipients(deps.root);
  requireValidPlan(week, deps);

  if (plan.status === "proposed") savePlan({ ...plan, status: "validated" }, deps.root);
  const siteUrl = await deps.publish(week);
  await deps.send(weeklyEmail(shown(plan, deps), { to: recipients, siteUrl, imagePng: deps.readImage(week) }));

  // "sent" n'est écrit qu'après l'envoi : au pire un doublon, jamais un email manquant.
  savePlan({ ...plan, status: "sent" }, deps.root);
  await pushOrWarn(`data: ${week} envoyée`, deps);
  return { sent: true };
}

// Sur demande seulement : renvoie l'email de la semaine déjà envoyée, marqué « mise à jour ».
export async function resendWeekly(week, deps) {
  const plan = requireValidPlan(week, deps);
  if (plan.status !== "sent") throw new Error(`${week} : semaine pas encore envoyée, utilise send-weekly`);
  const { recipients } = loadRecipients(deps.root);
  const siteUrl = await deps.publish(week);
  await deps.send(weeklyEmail(shown(plan, deps), { to: recipients, siteUrl, imagePng: deps.readImage(week), updated: true }));
}

// Récupère les promos du magasin pour la semaine et les partage, pour la génération du plan.
export async function updatePromos(week, deps) {
  const promos = await deps.fetchPromos(week);
  savePromos(promos, deps.root);
  await pushOrWarn(`data: promos de ${week}`, deps);
  return promos;
}
