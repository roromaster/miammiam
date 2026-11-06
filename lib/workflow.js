import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadRecipients, proposalEmail, sendRaw, weeklyEmail } from "./email.js";
import { validatePlan } from "./plan.js";
import { DATA_PATHS, commitAndPush, publish, pullLatest } from "./publish.js";
import { PROJECT_ROOT, loadPlan, previousSunday, previousTitles, savePlan } from "./store.js";

export function defaultDeps(root = PROJECT_ROOT, { sync = true } = {}) {
  return {
    root,
    publish: (week) => publish(week, { root }),
    send: (mime) => sendRaw(mime),
    readImage: (week) => readFileSync(join(root, "site", week, "semaine.png")),
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
  });
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
  const proposal = { ...plan, status: "proposed" };
  const errors = checkPlan(proposal, deps);
  if (errors.length > 0) return { saved: false, errors };
  savePlan(proposal, deps.root);
  await pushOrWarn(`data: proposition de ${plan.week}`, deps);
  return { saved: true, errors: [] };
}

export async function notifyProposal(week, deps) {
  const plan = requirePlan(week, deps);
  if (plan.status !== "proposed" || plan.notified) return { sent: false };
  const { recipients } = loadRecipients(deps.root);
  await deps.send(proposalEmail(plan, { to: recipients.join(", ") }));
  savePlan({ ...plan, notified: true }, deps.root);
  await pushOrWarn(`data: proposition de ${week} notifiée`, deps);
  return { sent: true };
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
  await deps.send(weeklyEmail(plan, { to: recipients, siteUrl, imagePng: deps.readImage(week) }));

  // "sent" n'est écrit qu'après l'envoi : au pire un doublon, jamais un email manquant.
  savePlan({ ...plan, status: "sent" }, deps.root);
  await pushOrWarn(`data: ${week} envoyée`, deps);
  return { sent: true };
}
