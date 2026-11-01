import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { weekBefore } from "./week.js";

export const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const pathFor = (root, folder, week) => join(root, "data", folder, `${week}.json`);
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

export function loadPlan(week, root = PROJECT_ROOT) {
  for (const folder of ["weeks", "proposals"]) {
    const path = pathFor(root, folder, week);
    if (existsSync(path)) return readJson(path);
  }
  return null;
}

export function savePlan(plan, root = PROJECT_ROOT) {
  const folder = plan.status === "proposed" ? "proposals" : "weeks";
  const path = pathFor(root, folder, plan.week);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(plan, null, 2)}\n`);
  if (folder === "weeks") rmSync(pathFor(root, "proposals", plan.week), { force: true });
}

export function publishedPlans(root = PROJECT_ROOT) {
  const dir = join(root, "data", "weeks");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .reverse()
    .map((file) => readJson(join(dir, file)));
}

export function previousTitles(week, root = PROJECT_ROOT) {
  return [1, 2, 3, 4].flatMap((count) => {
    const plan = loadPlan(weekBefore(week, count), root);
    return plan ? plan.meals.map((meal) => meal.title) : [];
  });
}

export function planHash(plan) {
  const { status, ...content } = plan;
  return createHash("sha256").update(JSON.stringify(content)).digest("hex").slice(0, 12);
}
