#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PROJECT_ROOT, loadPlan } from "../lib/store.js";
import { currentWeek, upcomingWeek } from "../lib/week.js";
import { checkPlan, defaultDeps, notifyProposal, republish, saveProposal, sendWeekly, validateWeek } from "../lib/workflow.js";

const USAGE = `Commandes :
  target upcoming|current
  status <semaine>
  check <fichier.json>
  save-proposal <fichier.json>
  notify-proposal <semaine>
  validate <semaine>
  send-weekly <semaine>
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

const COMMANDS = {
  target(which) {
    if (which === "upcoming") return upcomingWeek(new Date());
    if (which === "current") return currentWeek(new Date());
    throw new Error("target attend upcoming ou current");
  },
  status(week) {
    return loadPlan(weekArg(week), deps.root)?.status ?? "missing";
  },
  check(path) {
    const errors = checkPlan(planArg(path), deps);
    if (errors.length > 0) throw new Error(errors.join("\n"));
    return "Plan valide";
  },
  async "save-proposal"(path) {
    const plan = planArg(path);
    const { saved, errors } = await saveProposal(plan, deps);
    if (errors.length > 0) throw new Error(errors.join("\n"));
    return saved ? `Proposition enregistrée : ${plan.week}` : `${plan.week} existe déjà, rien n'a changé`;
  },
  async "notify-proposal"(week) {
    const { sent } = await notifyProposal(weekArg(week), deps);
    return sent ? "Email de proposition envoyé" : "Aucun email à envoyer";
  },
  validate(week) {
    return validateWeek(weekArg(week), deps);
  },
  async "send-weekly"(week) {
    const { sent, reason } = await sendWeekly(weekArg(week), deps);
    return sent ? "Email de la semaine envoyé" : `Rien à faire : ${reason}`;
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
