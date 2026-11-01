import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DAYS, SLOTS } from "./plan.js";
import { formatItem, shoppingList } from "./shopping.js";
import { planHash } from "./store.js";
import { frenchDate } from "./week.js";

const WEEK_DIR = /^\d{4}-W\d{2}$/;
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

export function esc(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const CSS = `
:root { color-scheme: light dark; --bg: #fbf7f0; --card: #ffffff; --ink: #2b2620; --muted: #6f665a; --line: #e6ddcf; --accent: #b4532a; }
@media (prefers-color-scheme: dark) { :root { --bg: #1d1a16; --card: #29251f; --ink: #f2ebe0; --muted: #b5aa9a; --line: #3d372e; --accent: #e8895c; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 17px/1.55 -apple-system, "Segoe UI", Roboto, sans-serif; }
main { max-width: 760px; margin: 0 auto; padding: 24px 16px 64px; }
h1 { font-size: 1.9rem; line-height: 1.2; margin: 0 0 8px; }
h2 { font-size: 1.4rem; margin: 40px 0 12px; }
h3 { font-size: 1.05rem; margin: 18px 0 4px; }
a { color: var(--accent); }
nav { color: var(--muted); margin-bottom: 16px; }
img { display: block; width: 100%; height: auto; border-radius: 10px; margin: 16px 0; }
.card, .recipe { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px; margin: 12px 0; }
.recipe h3 { margin: 0; font-size: 1.15rem; }
.meta { color: var(--muted); font-size: .92rem; margin: 2px 0 10px; }
ul, ol { padding-left: 22px; margin: 6px 0; }
.weeks { list-style: none; padding: 0; }
.weeks a { display: block; padding: 14px 16px; background: var(--card); border: 1px solid var(--line); border-radius: 12px; margin: 8px 0; text-decoration: none; }
`;

function page(title, body, head = "") {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
${head}<title>${esc(title)}</title>
<style>${CSS}</style>
</head>
<body><main>${body}</main></body>
</html>
`;
}

const portions = (servings) => (servings === 8 ? "8 portions, dont 4 pour les restes" : `${esc(servings)} personnes`);

function recipeHtml(meal) {
  if (meal.leftoversOf) {
    return `<article class="recipe">
<h3>${esc(meal.emoji)} ${esc(meal.title)}</h3>
<p class="meta">${capitalize(esc(meal.slot))} · Restes du ${esc(meal.leftoversOf)} soir, à réchauffer</p>
</article>`;
  }
  const ingredients = meal.ingredients
    .map((i) => `<li>${esc(formatItem({ name: i.name, quantity: i.quantity, unit: i.unit }))}</li>`)
    .join("");
  const steps = meal.steps.map((step) => `<li>${esc(step)}</li>`).join("");
  return `<article class="recipe">
<h3>${esc(meal.emoji)} ${esc(meal.title)}</h3>
<p class="meta">${capitalize(esc(meal.slot))} · Cuisine ${esc(meal.cuisine)} · ${esc(meal.minutes)} min · ${portions(meal.servings)}</p>
<p><strong>Accompagnement :</strong> ${esc(meal.side)}</p>
<strong>Ingrédients</strong><ul>${ingredients}</ul>
<strong>Préparation</strong><ol>${steps}</ol>
</article>`;
}

function shoppingHtml(plan) {
  const { aisles, pantry } = shoppingList(plan);
  const groups = aisles.map(({ aisle, items }) =>
    `<h3>${esc(aisle)}</h3><ul>${items.map((item) => `<li>${esc(formatItem(item))}</li>`).join("")}</ul>`);
  if (pantry.length > 0) {
    groups.push(`<h3>À vérifier au placard</h3><ul>${pantry.map((name) => `<li>${esc(name)}</li>`).join("")}</ul>`);
  }
  return `<div class="card">${groups.join("")}</div>`;
}

function weekPage(plan) {
  const date = frenchDate(plan.startDate);
  const recipes = DAYS.map((day) => {
    const meals = SLOTS.map((slot) => plan.meals.find((m) => m.day === day && m.slot === slot)).filter(Boolean);
    return `<h2>${capitalize(day)}</h2>${meals.map(recipeHtml).join("")}`;
  }).join("");
  const body = `<nav><a href="../">← Toutes les semaines</a></nav>
<h1>Repas de la semaine du ${esc(date)}</h1>
<img src="semaine.png" alt="Grille des repas de la semaine du ${esc(date)}">
<h2 id="courses">Liste de courses</h2>
${shoppingHtml(plan)}
${recipes}`;
  return page(`Semaine du ${date}`, body, `<meta name="miammiam-build" content="${planHash(plan)}">\n`);
}

function homePage(plans) {
  const list = plans.length === 0
    ? "<p>Aucun plan publié pour le moment.</p>"
    : `<ul class="weeks">${plans.map((plan) =>
        `<li><a href="${esc(plan.week)}/">Semaine du ${esc(frenchDate(plan.startDate))}</a></li>`).join("")}</ul>`;
  return page("MiamMiam", `<h1>MiamMiam</h1><p>Les repas de la semaine, pour 4 personnes.</p>${list}`);
}

export function buildSite(plans, outDir) {
  mkdirSync(outDir, { recursive: true });
  const kept = new Set(plans.map((plan) => plan.week));
  for (const entry of readdirSync(outDir)) {
    if (WEEK_DIR.test(entry) && !kept.has(entry)) rmSync(join(outDir, entry), { recursive: true });
  }
  writeFileSync(join(outDir, "index.html"), homePage(plans));
  writeFileSync(join(outDir, "robots.txt"), "User-agent: *\nDisallow: /\n");
  writeFileSync(join(outDir, ".nojekyll"), "");
  for (const plan of plans) {
    mkdirSync(join(outDir, plan.week), { recursive: true });
    writeFileSync(join(outDir, plan.week, "index.html"), weekPage(plan));
  }
}
