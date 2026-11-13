#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PROJECT_ROOT, loadPlan } from "../lib/store.js";
import { missingCatalogs } from "../lib/promos.js";
import { currentWeek, upcomingWeek } from "../lib/week.js";
import { checkPlan, defaultDeps, pricePlan, updatePromos, notifyProposal, renotifyProposal, republish, resendWeekly, saveProposal, sendWeekly, validateWeek } from "../lib/workflow.js";

const USAGE = `Commandes :
  target upcoming|current
  status <semaine>
  promos <semaine>
  price <fichier.json>
  check <fichier.json>
  save-proposal <fichier.json>
  notify-proposal <semaine>
  renotify <semaine>
  validate <semaine>
  send-weekly <semaine>
  resend-weekly <semaine>
  republish <semaine>
  sync

Chaque commande, sauf target, récupère d'abord le dernier état depuis GitHub.
MIAMMIAM_SYNC=0 désactive les échanges avec GitHub.`;

const deps = defaultDeps(process.env.MIAMMIAM_ROOT ?? PROJECT_ROOT, { sync: process.env.MIAMMIAM_SYNC !== "0" });

function weekArg(value) {
  if (!/^\d{4}-W\d{2}$/.test(value ?? "")) throw new Error(`Semaine invalide : ${value} (attendu : 2026-W46)`);
  return value;
}

function planArg(path) {
  if (!path) throw new Error("Fichier de plan manquant");
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

const newIngredients = (added) => (added.length > 0 ? `\nNouveaux ingrédients ajoutés au catalogue, au prix estimé : ${added.join(", ")}` : "");

const COMMANDS = {
  target(which) {
    if (which === "upcoming") return upcomingWeek(new Date());
    if (which === "current") return currentWeek(new Date());
    throw new Error("target attend upcoming ou current");
  },
  status(week) {
    return loadPlan(weekArg(week), deps.root)?.status ?? "missing";
  },
  async promos(week) {
    const result = await updatePromos(weekArg(week), deps);
    const from = result.catalogs.map((c) => `${c.code} du ${c.validFrom} au ${c.validTo}`).join(", ");
    const missing = missingCatalogs(result);
    const gap = missing.length > 0 ? `\nCatalogue manquant : ${missing.join(" ; ")}. Relancer promos plus tard pour l'ajouter.` : "";
    return `${result.promos.length} promos alimentaires enregistrées dans data/promos/${week}.json (catalogues ${from})${gap}`;
  },
  // Recalcule noms, rayons et prix d'après le catalogue, dans le fichier même.
  price(path) {
    const { plan, added, errors, learn } = pricePlan(planArg(path), deps);
    if (errors.length > 0) throw new Error(errors.join("\n"));
    writeFileSync(resolve(path), `${JSON.stringify(plan, null, 2)}\n`);
    learn();
    return `Prix recalculés d'après le catalogue${newIngredients(added)}`;
  },
  check(path) {
    const errors = checkPlan(planArg(path), deps);
    if (errors.length > 0) throw new Error(errors.join("\n"));
    return "Plan valide";
  },
  async "save-proposal"(path) {
    const plan = planArg(path);
    const { saved, errors, added } = await saveProposal(plan, deps);
    if (errors.length > 0) throw new Error(errors.join("\n"));
    return saved ? `Proposition enregistrée : ${plan.week}${newIngredients(added)}` : `${plan.week} existe déjà, rien n'a changé`;
  },
  async "notify-proposal"(week) {
    const { sent } = await notifyProposal(weekArg(week), deps);
    return sent ? "Email de proposition envoyé" : "Aucun email à envoyer";
  },
  async renotify(week) {
    await renotifyProposal(weekArg(week), deps);
    return "Proposition mise à jour renvoyée";
  },
  validate(week) {
    return validateWeek(weekArg(week), deps);
  },
  async "send-weekly"(week) {
    const { sent, reason } = await sendWeekly(weekArg(week), deps);
    return sent ? "Email de la semaine envoyé" : `Rien à faire : ${reason}`;
  },
  async "resend-weekly"(week) {
    await resendWeekly(weekArg(week), deps);
    return "Email de la semaine renvoyé (mise à jour)";
  },
  republish(week) {
    return republish(weekArg(week), deps);
  },
  async sync() {
    await deps.pushData("data: mise à jour des plans");
    return "Plans synchronisés avec GitHub";
  },
};

const [command, argument] = process.argv.slice(2);
if (!Object.hasOwn(COMMANDS, command ?? "")) {
  console.error(USAGE);
  process.exit(1);
}
try {
  if (command !== "target") await deps.pull();
  console.log(await COMMANDS[command](argument));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
