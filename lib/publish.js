import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { renderImage } from "./image.js";
import { buildSite } from "./site.js";
import { forDisplay } from "./catalog.js";
import { PROJECT_ROOT, loadCatalog, loadPantry, planHash, publishedPlans } from "./store.js";

export const SITE_URL = "https://roromaster.github.io/miammiam/";

const ATTRIBUTION = "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>";
const execFileAsync = promisify(execFile);

// Les plans voyagent entre machines par git : propositions et promos comprises.
export const DATA_PATHS = ["data/proposals", "data/weeks", "data/promos", "data/pantry.json", "data/ingredients.json"];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function commitAndPush(message, paths, { exec = execFileAsync, root = PROJECT_ROOT } = {}) {
  const git = (...args) => exec("git", args, { cwd: root });
  // --all prend aussi les suppressions (une proposition validée quitte data/proposals).
  await git("add", "--all", "--", ...paths);
  try {
    await git("diff", "--cached", "--quiet");
  } catch (error) {
    if (error.code !== 1) throw error;
    await git("commit", "-m", `${message}\n\n${ATTRIBUTION}`);
  }
  // Toujours pousser : un push précédent a pu échouer après son commit.
  await git("push", "origin", "main");
}

export async function pullLatest({ exec = execFileAsync, root = PROJECT_ROOT } = {}) {
  await exec("git", ["pull", "--rebase", "--autostash", "origin", "main"], { cwd: root });
}

async function waitForDeployment(url, hash, { fetch, timeoutMs, pollMs }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok && (await response.text()).includes(hash)) return;
    } catch {
      // Une erreur réseau passagère ne doit pas interrompre l'attente.
    }
    await sleep(pollMs);
  }
  throw new Error(`Publication non confirmée après ${timeoutMs / 1000} s : ${url}`);
}

export async function publish(week, {
  exec = execFileAsync,
  fetch = globalThis.fetch,
  render = renderImage,
  timeoutMs = 300_000,
  pollMs = 15_000,
  root = PROJECT_ROOT,
} = {}) {
  const display = { pantry: loadPantry(root), catalog: loadCatalog(root) };
  const plans = publishedPlans(root).map((candidate) => forDisplay(candidate, display));
  const plan = plans.find((candidate) => candidate.week === week);
  if (!plan) throw new Error(`Semaine ${week} absente de data/weeks`);

  const siteDir = join(root, "site");
  buildSite(plans, siteDir);
  await render(plan, join(siteDir, week, "semaine.png"));
  await commitAndPush(`data: publication de ${week}`, [...DATA_PATHS, "site"], { exec, root });

  const url = `${SITE_URL}${week}/`;
  await waitForDeployment(url, planHash(plan), { fetch, timeoutMs, pollMs });
  return url;
}
